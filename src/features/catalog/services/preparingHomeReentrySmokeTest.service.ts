import { createPreparingHomeOrchestrator } from './preparingHomeOrchestrator.service';
import type {
  AppBootstrapResult,
  RunAppBootstrapInput,
} from '@/features/bootstrap/services/appBootstrap.service';
import type { PlaylistRuntimeStatus, PlaylistSource } from '@/features/playlists/types/playlist';

function sampleBootstrapResult(overrides: Partial<AppBootstrapResult> = {}): AppBootstrapResult {
  return {
    licenseCode: 'TEST-CODE',
    deviceIdentifier: 'TEST-DEV-ID',
    sourceId: 'src-100',
    homeSections: [],
    livePreviewChannels: [],
    movieItems: [],
    seriesItems: [],
    preloadedImages: 0,
    failedImages: 0,
    warnings: [],
    ...overrides,
  };
}

function samplePlaylistSource(overrides: Partial<PlaylistSource> = {}): PlaylistSource {
  return {
    sourceType: 'm3u',
    sourceId: 'src-test',
    url: 'https://example.com/playlist.m3u',
    ...overrides,
  };
}

export async function runPreparingHomeReentrySmokeTest() {
  // S1 & Root Cause: Runtime changes during bootstrap execution
  let s1NavigatedTo = '';
  let s1RuntimeStatus: PlaylistRuntimeStatus = 'idle';
  let s1RuntimeChannelsCount = 0;
  const s1LoadFromChannels = () => {
    s1RuntimeStatus = 'ready' as PlaylistRuntimeStatus;
    s1RuntimeChannelsCount = 10;
  };

  const s1Orchestrator = createPreparingHomeOrchestrator({
    getStoredActivation: () => ({
      licenseCode: 'LIC-S1',
      deviceIdentifier: 'DEV-S1',
    }),
    runBootstrap: async (input) => {
      input.runtime.loadFromChannels({ source: samplePlaylistSource({ sourceId: 'src-1' }), channels: [] });
      return sampleBootstrapResult({ sourceId: 'src-1' });
    },
    navigate: (to) => {
      s1NavigatedTo = to;
    },
    runtime: {
      currentChannelsCount: s1RuntimeChannelsCount,
      currentStatus: s1RuntimeStatus,
      currentSourceId: undefined,
      loadFromSource: async () => undefined,
      loadFromChannels: s1LoadFromChannels,
      clearRuntime: () => undefined,
    },
    onStateChange: () => undefined,
    runSmokeTestInBackground: () => undefined,
  });

  s1Orchestrator.startAttempt();
  await new Promise((r) => setTimeout(r, 20));
  const s1Pass =
    s1Orchestrator.getState().step === 'ready' &&
    (s1RuntimeStatus as string) === 'ready' &&
    s1NavigatedTo === '';

  // S2: Effect / Rerender equivalent — runtime changes do not cancel in-flight attempt
  let s2StateUpdates = 0;
  const s2Orchestrator = createPreparingHomeOrchestrator({
    getStoredActivation: () => ({
      licenseCode: 'LIC-S2',
      deviceIdentifier: 'DEV-S2',
    }),
    runBootstrap: async (input) => {
      input.runtime.loadFromChannels({ source: samplePlaylistSource(), channels: [] });
      return sampleBootstrapResult();
    },
    navigate: () => undefined,
    runtime: {
      currentChannelsCount: 0,
      currentStatus: 'idle',
      currentSourceId: undefined,
      loadFromSource: async () => undefined,
      loadFromChannels: () => undefined,
      clearRuntime: () => undefined,
    },
    onStateChange: () => {
      s2StateUpdates += 1;
    },
    runSmokeTestInBackground: () => undefined,
  });

  s2Orchestrator.startAttempt();
  await new Promise((r) => setTimeout(r, 20));
  const s2Pass = s2Orchestrator.getState().step === 'ready' && s2StateUpdates > 0;

  // S3: Real unmount guard
  let s3StateChangeAfterUnmount = false;
  let triggerS3Resolve: (res: AppBootstrapResult) => void = () => undefined;
  const s3Orchestrator = createPreparingHomeOrchestrator({
    getStoredActivation: () => ({
      licenseCode: 'LIC-S3',
      deviceIdentifier: 'DEV-S3',
    }),
    runBootstrap: () =>
      new Promise((resolve) => {
        triggerS3Resolve = resolve;
      }),
    navigate: () => undefined,
    runtime: {
      currentChannelsCount: 0,
      currentStatus: 'idle',
      currentSourceId: undefined,
      loadFromSource: async () => undefined,
      loadFromChannels: () => undefined,
      clearRuntime: () => undefined,
    },
    onStateChange: () => {
      if (s3Unmounted) {
        s3StateChangeAfterUnmount = true;
      }
    },
    runSmokeTestInBackground: () => undefined,
  });

  let s3Unmounted = false;
  s3Orchestrator.startAttempt();
  s3Unmounted = true;
  s3Orchestrator.unmount();
  triggerS3Resolve(sampleBootstrapResult());
  await new Promise((r) => setTimeout(r, 20));
  const s3Pass = !s3StateChangeAfterUnmount;

  // S4: Retry generation guard (Attempt A ignored when Attempt B started)
  let triggerS4AttemptAResolve: (res: AppBootstrapResult) => void = () => undefined;
  let triggerS4AttemptBResolve: (res: AppBootstrapResult) => void = () => undefined;
  let s4RunCount = 0;

  const s4Orchestrator = createPreparingHomeOrchestrator({
    getStoredActivation: () => ({
      licenseCode: 'LIC-S4',
      deviceIdentifier: 'DEV-S4',
    }),
    runBootstrap: () => {
      s4RunCount += 1;
      const count = s4RunCount;
      return new Promise((resolve) => {
        if (count === 1) {
          triggerS4AttemptAResolve = resolve;
        } else {
          triggerS4AttemptBResolve = resolve;
        }
      });
    },
    navigate: () => undefined,
    runtime: {
      currentChannelsCount: 0,
      currentStatus: 'idle',
      currentSourceId: undefined,
      loadFromSource: async () => undefined,
      loadFromChannels: () => undefined,
      clearRuntime: () => undefined,
    },
    onStateChange: () => undefined,
    runSmokeTestInBackground: () => undefined,
  });

  s4Orchestrator.startAttempt(); // Attempt 1
  s4Orchestrator.startAttempt(); // Attempt 2 (Retry)
  triggerS4AttemptAResolve(sampleBootstrapResult({ sourceId: 'src-A' }));
  await new Promise((r) => setTimeout(r, 20));
  const s4StepAfterA = s4Orchestrator.getState().step; // Should still be 'loading'

  triggerS4AttemptBResolve(sampleBootstrapResult({ sourceId: 'src-B' }));
  await new Promise((r) => setTimeout(r, 20));
  const s4StepAfterB = s4Orchestrator.getState().step; // Should be 'ready'
  const s4Pass = s4StepAfterA === 'loading' && s4StepAfterB === 'ready';

  // S5: Bootstrap error handling
  const s5Orchestrator = createPreparingHomeOrchestrator({
    getStoredActivation: () => ({
      licenseCode: 'LIC-S5',
      deviceIdentifier: 'DEV-S5',
    }),
    runBootstrap: async () => {
      throw new Error('BOOTSTRAP_FAILED_TEST');
    },
    navigate: () => undefined,
    runtime: {
      currentChannelsCount: 0,
      currentStatus: 'idle',
      currentSourceId: undefined,
      loadFromSource: async () => undefined,
      loadFromChannels: () => undefined,
      clearRuntime: () => undefined,
    },
    onStateChange: () => undefined,
    runSmokeTestInBackground: () => undefined,
  });

  s5Orchestrator.startAttempt();
  await new Promise((r) => setTimeout(r, 20));
  const s5State = s5Orchestrator.getState();
  const s5Pass = s5State.step === 'error' && s5State.localError === 'BOOTSTRAP_FAILED_TEST';

  // S6: Bootstrap success
  const s6Orchestrator = createPreparingHomeOrchestrator({
    getStoredActivation: () => ({
      licenseCode: 'LIC-S6',
      deviceIdentifier: 'DEV-S6',
    }),
    runBootstrap: async () => sampleBootstrapResult(),
    navigate: () => undefined,
    runtime: {
      currentChannelsCount: 0,
      currentStatus: 'idle',
      currentSourceId: undefined,
      loadFromSource: async () => undefined,
      loadFromChannels: () => undefined,
      clearRuntime: () => undefined,
    },
    onStateChange: () => undefined,
    runSmokeTestInBackground: () => undefined,
  });

  s6Orchestrator.startAttempt();
  await new Promise((r) => setTimeout(r, 20));
  const s6Pass = s6Orchestrator.getState().step === 'ready';

  // S7: Missing activation flow
  let s7NavigatedTo = '';
  const s7Orchestrator = createPreparingHomeOrchestrator({
    getStoredActivation: () => null,
    runBootstrap: async () => sampleBootstrapResult(),
    navigate: (to) => {
      s7NavigatedTo = to;
    },
    runtime: {
      currentChannelsCount: 0,
      currentStatus: 'idle',
      currentSourceId: undefined,
      loadFromSource: async () => undefined,
      loadFromChannels: () => undefined,
      clearRuntime: () => undefined,
    },
    onStateChange: () => undefined,
    runSmokeTestInBackground: () => undefined,
  });

  s7Orchestrator.startAttempt();
  const s7StateImmediate = s7Orchestrator.getState();
  await new Promise((r) => setTimeout(r, 1850));
  const s7Pass =
    s7StateImmediate.step === 'error' &&
    Boolean(s7StateImmediate.localError) &&
    s7NavigatedTo === '/settings';

  // S8: criticalOnly: true passed
  let s8PassedCriticalOnly = false;
  const s8Orchestrator = createPreparingHomeOrchestrator({
    getStoredActivation: () => ({
      licenseCode: 'LIC-S8',
      deviceIdentifier: 'DEV-S8',
    }),
    runBootstrap: async (input: RunAppBootstrapInput) => {
      s8PassedCriticalOnly = Boolean(input.criticalOnly);
      return sampleBootstrapResult();
    },
    navigate: () => undefined,
    runtime: {
      currentChannelsCount: 0,
      currentStatus: 'idle',
      currentSourceId: undefined,
      loadFromSource: async () => undefined,
      loadFromChannels: () => undefined,
      clearRuntime: () => undefined,
    },
    onStateChange: () => undefined,
    runSmokeTestInBackground: () => undefined,
  });

  s8Orchestrator.startAttempt();
  await new Promise((r) => setTimeout(r, 20));
  const s8Pass = s8PassedCriticalOnly;

  const cases = {
    S1: { pass: s1Pass },
    S2: { pass: s2Pass },
    S3: { pass: s3Pass },
    S4: { pass: s4Pass },
    S5: { pass: s5Pass },
    S6: { pass: s6Pass },
    S7: { pass: s7Pass },
    S8: { pass: s8Pass },
  };

  return {
    pass: Object.values(cases).every((c) => c.pass),
    cases,
  };
}
