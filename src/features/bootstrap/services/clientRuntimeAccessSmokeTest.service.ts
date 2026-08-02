import {
  act,
  createElement,
  useEffect,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Session, User } from '@supabase/supabase-js';

import {
  AuthProvider,
  useAuth,
} from '@/app/providers/AuthProvider';
import {
  PlaylistRuntimeProvider,
  usePlaylistRuntime,
} from '@/features/playlists/providers/PlaylistRuntimeProvider';
import type {
  IptvChannel,
  PlaylistDiagnostics,
  PlaylistSource,
} from '@/features/playlists/types/playlist';
import {
  clearSupabaseLocalAuthStorage,
  supabase,
} from '@/lib/supabase/supabaseClient';
import { clearClientRuntimeAccessState } from './appBootstrap.service';
import {
  CLIENT_RUNTIME_ACCESS_REVOKED_EVENT,
  notifyClientRuntimeAccessRevoked,
} from './clientRuntimeAccessEvents.service';

export interface RuntimeAccessSmokeResult {
  ok: boolean;
  EVENT_SERVICE_DISPATCH_COUNT: boolean;
  EVENT_SERVICE_REMOVE_LISTENER: boolean;
  EVENT_SERVICE_NO_PAYLOAD: boolean;
  SUPABASE_KEYS_CLEARED: boolean;
  SUPABASE_UNRELATED_PRESERVED: boolean;
  SUPABASE_STORAGE_ERROR_HANDLED: boolean;
  AUTH_PROVIDER_MOUNTED: boolean;
  AUTH_CONTEXT_OBSERVED: boolean;
  AUTH_STALE_REFRESH_REJECTED: boolean;
  AUTH_STALE_CALLBACK_REJECTED: boolean;
  AUTH_VALID_LOGIN_ACCEPTED: boolean;
  AUTH_LOGOUT_SUCCESS_CLEANUP: boolean;
  AUTH_LOGOUT_ERROR_CLEANUP: boolean;
  BOOTSTRAP_CLEAR_EVENT_COUNT: boolean;
  BOOTSTRAP_NO_RECURSION: boolean;
  PLAYLIST_PROVIDER_MOUNTED: boolean;
  PLAYLIST_CONTEXT_OBSERVED: boolean;
  PLAYLIST_CHANNELS_READY: boolean;
  PLAYLIST_STATE_CLEARED_ON_REVOCATION: boolean;
  PLAYLIST_ABORT_SIGNAL_CAPTURED: boolean;
  PLAYLIST_ABORT_BEFORE_REVOCATION: boolean;
  PLAYLIST_ACTIVE_REQUEST_ABORTED: boolean;
  PLAYLIST_STALE_RESPONSE_REJECTED: boolean;
  PLAYLIST_UNMOUNT_CLEANUP: boolean;
  PLAYLIST_LISTENER_CLEANUP: boolean;
  REACT_WARNING_COUNT: number;
}

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

type AuthContextValue = ReturnType<typeof useAuth>;
type PlaylistRuntimeContextValue = ReturnType<typeof usePlaylistRuntime>;

type AuthSnapshot = {
  userId: string | null;
  sessionUserId: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
};

type PlaylistSnapshot = {
  sourcePresent: boolean;
  channelCount: number;
  selectedChannelPresent: boolean;
  diagnosticsPresent: boolean;
  status: PlaylistRuntimeContextValue['status'];
  progressPresent: boolean;
  errorPresent: boolean;
  localCatalogScopePresent: boolean;
  localCatalogGenerationPresent: boolean;
};

type MountedHarness = {
  container: HTMLDivElement;
  root: Root;
};

type PendingPlaylistRequest = {
  deferred: Deferred<Response>;
  signal: AbortSignal | null;
};

function expectObserved(
  condition: unknown,
  errorCode: string,
): asserts condition {
  if (!condition) {
    throw new Error(errorCode);
  }
}

function createDeferred<T>(): Deferred<T> {
  let resolvePromise: ((value: T) => void) | null = null;
  let rejectPromise: ((reason?: unknown) => void) | null = null;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    resolve(value) {
      expectObserved(resolvePromise, 'CONTROLLED_PROMISE_RESOLVE_MISSING');
      resolvePromise(value);
    },
    reject(reason) {
      expectObserved(rejectPromise, 'CONTROLLED_PROMISE_REJECT_MISSING');
      rejectPromise(reason);
    },
  };
}

async function settleTasks() {
  await Promise.resolve();
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
  await Promise.resolve();
}

async function waitForObserved(
  predicate: () => boolean,
  errorCode: string,
) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) {
      return;
    }

    await settleTasks();
  }

  throw new Error(errorCode);
}

function createSyntheticUser(id: string): User {
  return {
    id,
    aud: 'authenticated',
    role: 'authenticated',
    email: `${id}@example.invalid`,
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00.000Z',
  } as User;
}

function createSyntheticSession(id: string): Session {
  const user = createSyntheticUser(id);

  return {
    access_token: `synthetic-access-${id}`,
    refresh_token: `synthetic-refresh-${id}`,
    expires_in: 3_600,
    token_type: 'bearer',
    user,
  } as Session;
}

function createHarnessContainer(label: string) {
  const container = document.createElement('div');
  container.dataset.runtimeAccessHarness = label;
  document.body.appendChild(container);
  return container;
}

function cleanupHarness(harness: MountedHarness | null) {
  if (!harness) {
    return;
  }

  try {
    act(() => {
      harness.root.unmount();
    });
  } finally {
    harness.container.remove();
  }
}

function clearTestStorages() {
  window.localStorage.clear();
  window.sessionStorage.clear();
}

function AuthContextConsumer({
  onSnapshot,
}: {
  onSnapshot: (context: AuthContextValue, snapshot: AuthSnapshot) => void;
}) {
  const context = useAuth();

  useEffect(() => {
    onSnapshot(context, {
      userId: context.user?.id ?? null,
      sessionUserId: context.session?.user.id ?? null,
      isLoading: context.isLoading,
      isAuthenticated: context.isAuthenticated,
    });
  }, [context, onSnapshot]);

  return createElement('output', {
    'data-auth-user': context.user?.id ?? 'none',
    'data-auth-loading': String(context.isLoading),
  });
}

async function mountAuthHarness(
  onSnapshot: (context: AuthContextValue, snapshot: AuthSnapshot) => void,
) {
  const container = createHarnessContainer('auth');
  const root = createRoot(container);

  await act(async () => {
    root.render(
      createElement(
        AuthProvider,
        null,
        createElement(AuthContextConsumer, { onSnapshot }),
      ),
    );
    await settleTasks();
  });

  return { container, root };
}

function PlaylistContextConsumer({
  onSnapshot,
}: {
  onSnapshot: (
    context: PlaylistRuntimeContextValue,
    snapshot: PlaylistSnapshot,
  ) => void;
}) {
  const context = usePlaylistRuntime();

  useEffect(() => {
    onSnapshot(context, {
      sourcePresent: context.source !== null,
      channelCount: context.channels.length,
      selectedChannelPresent: context.selectedChannel !== null,
      diagnosticsPresent: context.diagnostics !== null,
      status: context.status,
      progressPresent: context.progress !== null,
      errorPresent: context.error !== null,
      localCatalogScopePresent: context.localCatalogScopeKey !== null,
      localCatalogGenerationPresent:
        context.localCatalogGenerationId !== null,
    });
  }, [context, onSnapshot]);

  return createElement('output', {
    'data-playlist-status': context.status,
    'data-playlist-channel-count': String(context.channels.length),
  });
}

async function mountPlaylistHarness(
  onSnapshot: (
    context: PlaylistRuntimeContextValue,
    snapshot: PlaylistSnapshot,
  ) => void,
) {
  const container = createHarnessContainer('playlist');
  const root = createRoot(container);

  await act(async () => {
    root.render(
      createElement(
        PlaylistRuntimeProvider,
        null,
        createElement(PlaylistContextConsumer, { onSnapshot }),
      ),
    );
    await settleTasks();
  });

  return { container, root };
}

function getCurrentAuthContext(context: AuthContextValue | null) {
  expectObserved(context, 'AUTH_CONTEXT_NOT_OBSERVED');
  return context;
}

function getCurrentPlaylistContext(
  context: PlaylistRuntimeContextValue | null,
) {
  expectObserved(context, 'PLAYLIST_CONTEXT_NOT_OBSERVED');
  return context;
}

async function runEventServiceAssertions() {
  let dispatchCount = 0;
  let capturedEvent: Event | null = null;
  const listener = (event: Event) => {
    dispatchCount += 1;
    capturedEvent = event;
  };

  window.addEventListener(CLIENT_RUNTIME_ACCESS_REVOKED_EVENT, listener);
  notifyClientRuntimeAccessRevoked();
  const countAfterDispatch = dispatchCount;
  window.removeEventListener(CLIENT_RUNTIME_ACCESS_REVOKED_EVENT, listener);
  notifyClientRuntimeAccessRevoked();
  const countAfterRemoval = dispatchCount;

  const dispatchCountObserved = countAfterDispatch === 1;
  expectObserved(
    dispatchCountObserved,
    'EVENT_SERVICE_DISPATCH_COUNT_FAILED',
  );

  const removeListenerObserved = countAfterRemoval === countAfterDispatch;
  expectObserved(
    removeListenerObserved,
    'EVENT_SERVICE_REMOVE_LISTENER_FAILED',
  );

  const readCapturedEvent = (): Event | null => capturedEvent;
  const observedEvent = readCapturedEvent();
  const eventNoPayloadObserved =
    observedEvent instanceof Event &&
    observedEvent.type === CLIENT_RUNTIME_ACCESS_REVOKED_EVENT &&
    !(observedEvent instanceof CustomEvent) &&
    !Object.prototype.hasOwnProperty.call(observedEvent, 'detail') &&
    !('detail' in observedEvent);
  expectObserved(eventNoPayloadObserved, 'EVENT_SERVICE_PAYLOAD_DETECTED');

  return {
    EVENT_SERVICE_DISPATCH_COUNT: dispatchCountObserved,
    EVENT_SERVICE_REMOVE_LISTENER: removeListenerObserved,
    EVENT_SERVICE_NO_PAYLOAD: eventNoPayloadObserved,
  };
}

function runSupabaseStorageAssertions() {
  clearTestStorages();

  for (const storage of [window.localStorage, window.sessionStorage]) {
    storage.setItem('sb-fakeproject-auth-token', 'synthetic');
    storage.setItem(
      'sb-fakeproject-auth-token-code-verifier',
      'synthetic',
    );
    storage.setItem('sb-fakeproject-auth-token-user', 'synthetic');
    storage.setItem('xandeflix:test:preserve', 'preserved');
    storage.setItem('unrelated-key', 'preserved');
  }

  clearSupabaseLocalAuthStorage();

  const supabaseKeysCleared = [
    window.localStorage,
    window.sessionStorage,
  ].every(
    (storage) =>
      storage.getItem('sb-fakeproject-auth-token') === null &&
      storage.getItem('sb-fakeproject-auth-token-code-verifier') === null &&
      storage.getItem('sb-fakeproject-auth-token-user') === null,
  );
  expectObserved(supabaseKeysCleared, 'SUPABASE_AUTH_KEYS_NOT_CLEARED');

  const unrelatedPreserved = [
    window.localStorage,
    window.sessionStorage,
  ].every(
    (storage) =>
      storage.getItem('xandeflix:test:preserve') === 'preserved' &&
      storage.getItem('unrelated-key') === 'preserved',
  );
  expectObserved(unrelatedPreserved, 'SUPABASE_UNRELATED_KEY_REMOVED');

  return {
    SUPABASE_KEYS_CLEARED: supabaseKeysCleared,
    SUPABASE_UNRELATED_PRESERVED: unrelatedPreserved,
  };
}

function runBootstrapAssertions() {
  clearTestStorages();
  window.localStorage.setItem(
    'xandeflix.seriesLandingItems.synthetic',
    'synthetic',
  );

  let eventCount = 0;
  let currentDepth = 0;
  let maxDepth = 0;
  const listener = () => {
    currentDepth += 1;
    maxDepth = Math.max(maxDepth, currentDepth);
    eventCount += 1;
    currentDepth -= 1;
  };

  window.addEventListener(CLIENT_RUNTIME_ACCESS_REVOKED_EVENT, listener);
  try {
    clearClientRuntimeAccessState();
  } finally {
    window.removeEventListener(CLIENT_RUNTIME_ACCESS_REVOKED_EVENT, listener);
  }

  const eventCountObserved = eventCount === 1;
  expectObserved(
    eventCountObserved,
    'BOOTSTRAP_CLEAR_EVENT_COUNT_FAILED',
  );

  const noRecursionObserved = maxDepth === 1 && currentDepth === 0;
  expectObserved(noRecursionObserved, 'BOOTSTRAP_CLEAR_EVENT_RECURSION');

  return {
    BOOTSTRAP_CLEAR_EVENT_COUNT: eventCountObserved,
    BOOTSTRAP_NO_RECURSION: noRecursionObserved,
  };
}

async function runAuthProviderAssertions() {
  const auth = supabase.auth;
  const originalMethods = {
    getSession: auth.getSession,
    onAuthStateChange: auth.onAuthStateChange,
    signInWithPassword: auth.signInWithPassword,
    signOut: auth.signOut,
  };
  type AuthStateCallback = Parameters<typeof auth.onAuthStateChange>[0];
  type GetSessionResult = Awaited<ReturnType<typeof auth.getSession>>;

  let getSessionImplementation: () => Promise<GetSessionResult> = async () => ({
    data: { session: null },
    error: null,
  });
  let signInSession: Session | null = null;
  let signOutImplementation: () => ReturnType<typeof auth.signOut> =
    async () => ({ error: null });
  let authStateCallback: AuthStateCallback | null = null;
  let subscriptionUnsubscribeCount = 0;
  let signInCallCount = 0;
  let signOutCallCount = 0;

  const getSessionStub = (() => getSessionImplementation()) as typeof auth.getSession;
  const onAuthStateChangeStub = ((callback: AuthStateCallback) => {
    authStateCallback = callback;
    return {
      data: {
        subscription: {
          id: `runtime-access-smoke-${subscriptionUnsubscribeCount}`,
          callback,
          unsubscribe() {
            subscriptionUnsubscribeCount += 1;
          },
        },
      },
    };
  }) as unknown as typeof auth.onAuthStateChange;
  const signInWithPasswordStub = (async () => {
    signInCallCount += 1;
    const currentSession = signInSession;
    const callback = authStateCallback;

    if (currentSession && callback) {
      await callback('SIGNED_IN', currentSession);
    }

    return {
      data: {
        user: currentSession?.user ?? null,
        session: currentSession,
      },
      error: null,
    };
  }) as typeof auth.signInWithPassword;
  const signOutStub = (() => {
    signOutCallCount += 1;
    return signOutImplementation();
  }) as typeof auth.signOut;

  expectObserved(
    Reflect.set(auth, 'getSession', getSessionStub) &&
      Reflect.set(auth, 'onAuthStateChange', onAuthStateChangeStub) &&
      Reflect.set(auth, 'signInWithPassword', signInWithPasswordStub) &&
      Reflect.set(auth, 'signOut', signOutStub),
    'SUPABASE_AUTH_STUB_INSTALL_FAILED',
  );

  let providerMountedObserved = false;
  let contextObserved = false;
  let staleRefreshRejected = false;
  let staleCallbackRejected = false;
  let validLoginAccepted = false;
  let logoutSuccessCleanup = false;
  let logoutErrorCleanup = false;
  let storageErrorHandled = false;
  const readAuthStateCallback = (): AuthStateCallback | null =>
    authStateCallback;

  try {
    clearTestStorages();
    const initialSessionDeferred = createDeferred<GetSessionResult>();
    getSessionImplementation = () => initialSessionDeferred.promise;
    const initialSession = createSyntheticSession('initial-session');
    let initialContext: AuthContextValue | null = null;
    const initialSnapshots: AuthSnapshot[] = [];
    let initialHarness: MountedHarness | null = null;

    try {
      initialHarness = await mountAuthHarness((context, snapshot) => {
        initialContext = context;
        initialSnapshots.push(snapshot);
      });
      await waitForObserved(
        () => initialSnapshots.length > 0 && authStateCallback !== null,
        'AUTH_INITIAL_PROVIDER_NOT_READY',
      );

      const initialLoadingSnapshot = initialSnapshots[0];
      providerMountedObserved =
        initialHarness.container.childElementCount > 0 &&
        initialLoadingSnapshot.isLoading &&
        initialLoadingSnapshot.userId === null;
      expectObserved(providerMountedObserved, 'AUTH_PROVIDER_NOT_MOUNTED');

      await act(async () => {
        initialSessionDeferred.resolve({
          data: { session: initialSession },
          error: null,
        });
        await initialSessionDeferred.promise;
        await settleTasks();
      });

      const resolvedInitialContext = getCurrentAuthContext(initialContext);
      contextObserved =
        resolvedInitialContext.user?.id === initialSession.user.id &&
        resolvedInitialContext.session?.user.id === initialSession.user.id &&
        resolvedInitialContext.isAuthenticated &&
        !resolvedInitialContext.isLoading &&
        initialSnapshots.some(
          (snapshot) =>
            snapshot.userId === initialSession.user.id &&
            snapshot.sessionUserId === initialSession.user.id &&
            snapshot.isAuthenticated,
        );
      expectObserved(contextObserved, 'AUTH_INITIAL_SESSION_NOT_OBSERVED');
    } finally {
      cleanupHarness(initialHarness);
    }

    clearTestStorages();
    const staleSessionDeferred = createDeferred<GetSessionResult>();
    getSessionImplementation = () => staleSessionDeferred.promise;
    const staleSession = createSyntheticSession('stale-session');
    const latestSession = createSyntheticSession('latest-session');
    const validSession = createSyntheticSession('valid-session');
    signInSession = latestSession;
    signOutImplementation = async () => ({ error: null });
    let raceContext: AuthContextValue | null = null;
    const raceSnapshots: AuthSnapshot[] = [];
    let raceHarness: MountedHarness | null = null;

    try {
      raceHarness = await mountAuthHarness((context, snapshot) => {
        raceContext = context;
        raceSnapshots.push(snapshot);
      });
      await waitForObserved(
        () => raceContext !== null && authStateCallback !== null,
        'AUTH_RACE_PROVIDER_NOT_READY',
      );

      await act(async () => {
        await getCurrentAuthContext(raceContext).signIn(
          'runtime-access@example.invalid',
          'synthetic-password',
        );
        await settleTasks();
      });

      expectObserved(
        getCurrentAuthContext(raceContext).user?.id === latestSession.user.id,
        'AUTH_LATEST_LOGIN_NOT_OBSERVED',
      );

      await act(async () => {
        staleSessionDeferred.resolve({
          data: { session: staleSession },
          error: null,
        });
        await staleSessionDeferred.promise;
        await settleTasks();
      });

      staleRefreshRejected =
        signInCallCount === 1 &&
        getCurrentAuthContext(raceContext).user?.id === latestSession.user.id &&
        !raceSnapshots.some(
          (snapshot) => snapshot.userId === staleSession.user.id,
        );
      expectObserved(staleRefreshRejected, 'AUTH_STALE_REFRESH_ACCEPTED');

      const currentAuthCallback = readAuthStateCallback();
      expectObserved(currentAuthCallback, 'AUTH_CALLBACK_NOT_CAPTURED');
      await act(async () => {
        await currentAuthCallback('SIGNED_IN', validSession);
        await settleTasks();
      });

      validLoginAccepted =
        getCurrentAuthContext(raceContext).user?.id === validSession.user.id &&
        getCurrentAuthContext(raceContext).isAuthenticated;
      expectObserved(validLoginAccepted, 'AUTH_VALID_LOGIN_NOT_ACCEPTED');

      for (const storage of [window.localStorage, window.sessionStorage]) {
        storage.setItem('sb-fakeproject-auth-token', 'synthetic');
        storage.setItem(
          'sb-fakeproject-auth-token-code-verifier',
          'synthetic',
        );
        storage.setItem('xandeflix.licenseActivation', 'synthetic');
      }

      let successRevocationCount = 0;
      const successListener = () => {
        successRevocationCount += 1;
      };
      window.addEventListener(
        CLIENT_RUNTIME_ACCESS_REVOKED_EVENT,
        successListener,
      );
      try {
        await act(async () => {
          await getCurrentAuthContext(raceContext).signOut();
          await settleTasks();
        });
      } finally {
        window.removeEventListener(
          CLIENT_RUNTIME_ACCESS_REVOKED_EVENT,
          successListener,
        );
      }

      logoutSuccessCleanup =
        signOutCallCount === 1 &&
        successRevocationCount === 1 &&
        getCurrentAuthContext(raceContext).user === null &&
        getCurrentAuthContext(raceContext).session === null &&
        !getCurrentAuthContext(raceContext).isAuthenticated &&
        [window.localStorage, window.sessionStorage].every(
          (storage) =>
            storage.getItem('sb-fakeproject-auth-token') === null &&
            storage.getItem('sb-fakeproject-auth-token-code-verifier') ===
              null &&
            storage.getItem('xandeflix.licenseActivation') === null &&
            storage.getItem('xandeflix:access:signed-out') === 'true',
        );
      expectObserved(
        logoutSuccessCleanup,
        'AUTH_LOGOUT_SUCCESS_CLEANUP_FAILED',
      );

      await act(async () => {
        await currentAuthCallback('SIGNED_IN', validSession);
        await settleTasks();
      });
      staleCallbackRejected =
        getCurrentAuthContext(raceContext).user === null &&
        getCurrentAuthContext(raceContext).session === null &&
        !getCurrentAuthContext(raceContext).isAuthenticated;
      expectObserved(staleCallbackRejected, 'AUTH_STALE_CALLBACK_ACCEPTED');
    } finally {
      cleanupHarness(raceHarness);
    }

    clearTestStorages();
    const errorSession = createSyntheticSession('logout-error-session');
    getSessionImplementation = async () => ({
      data: { session: errorSession },
      error: null,
    });
    signOutImplementation = () =>
      Promise.reject(new Error('AUTH_SIGN_OUT_CONTROLLED_FAILURE'));
    let errorContext: AuthContextValue | null = null;
    let errorHarness: MountedHarness | null = null;

    try {
      errorHarness = await mountAuthHarness((context) => {
        errorContext = context;
      });
      await waitForObserved(
        () => errorContext?.user?.id === errorSession.user.id,
        'AUTH_ERROR_CASE_SESSION_NOT_READY',
      );

      window.localStorage.setItem(
        'sb-fakeproject-auth-token',
        'synthetic',
      );
      window.localStorage.setItem(
        'xandeflix.licenseActivation',
        'synthetic',
      );
      let errorRevocationCount = 0;
      const errorListener = () => {
        errorRevocationCount += 1;
      };
      window.addEventListener(
        CLIENT_RUNTIME_ACCESS_REVOKED_EVENT,
        errorListener,
      );
      try {
        await act(async () => {
          await getCurrentAuthContext(errorContext).signOut();
          await settleTasks();
        });
      } finally {
        window.removeEventListener(
          CLIENT_RUNTIME_ACCESS_REVOKED_EVENT,
          errorListener,
        );
      }

      logoutErrorCleanup =
        signOutCallCount === 2 &&
        errorRevocationCount === 1 &&
        getCurrentAuthContext(errorContext).user === null &&
        getCurrentAuthContext(errorContext).session === null &&
        window.localStorage.getItem('sb-fakeproject-auth-token') === null &&
        window.localStorage.getItem('xandeflix.licenseActivation') === null;
      expectObserved(
        logoutErrorCleanup,
        'AUTH_LOGOUT_ERROR_CLEANUP_FAILED',
      );
    } finally {
      cleanupHarness(errorHarness);
    }

    clearTestStorages();
    const storageSession = createSyntheticSession('storage-error-session');
    getSessionImplementation = async () => ({
      data: { session: storageSession },
      error: null,
    });
    signOutImplementation = async () => ({ error: null });
    let storageContext: AuthContextValue | null = null;
    let storageHarness: MountedHarness | null = null;
    const storagePrototype = Object.getPrototypeOf(
      window.localStorage,
    ) as Storage;
    const originalRemoveItem = storagePrototype.removeItem;
    let controlledStorageFailureCount = 0;

    try {
      storageHarness = await mountAuthHarness((context) => {
        storageContext = context;
      });
      await waitForObserved(
        () => storageContext?.user?.id === storageSession.user.id,
        'AUTH_STORAGE_CASE_SESSION_NOT_READY',
      );

      window.localStorage.setItem(
        'sb-fakeproject-auth-token',
        'synthetic',
      );
      storagePrototype.removeItem = function removeItemWithControlledFailure(
        key: string,
      ) {
        if (
          key === 'sb-fakeproject-auth-token' &&
          controlledStorageFailureCount === 0
        ) {
          controlledStorageFailureCount += 1;
          throw new DOMException(
            'CONTROLLED_STORAGE_FAILURE',
            'SecurityError',
          );
        }

        return originalRemoveItem.call(this, key);
      };

      let storageRevocationCount = 0;
      const storageListener = () => {
        storageRevocationCount += 1;
      };
      window.addEventListener(
        CLIENT_RUNTIME_ACCESS_REVOKED_EVENT,
        storageListener,
      );
      try {
        await act(async () => {
          await getCurrentAuthContext(storageContext).signOut();
          await settleTasks();
        });
      } finally {
        window.removeEventListener(
          CLIENT_RUNTIME_ACCESS_REVOKED_EVENT,
          storageListener,
        );
      }

      storageErrorHandled =
        controlledStorageFailureCount === 1 &&
        storageRevocationCount === 1 &&
        getCurrentAuthContext(storageContext).user === null &&
        getCurrentAuthContext(storageContext).session === null &&
        storageHarness.container.childElementCount > 0;
      expectObserved(
        storageErrorHandled,
        'AUTH_STORAGE_ERROR_NOT_HANDLED',
      );
    } finally {
      storagePrototype.removeItem = originalRemoveItem;
      cleanupHarness(storageHarness);
    }
  } finally {
    expectObserved(
      Reflect.set(auth, 'getSession', originalMethods.getSession) &&
        Reflect.set(
          auth,
          'onAuthStateChange',
          originalMethods.onAuthStateChange,
        ) &&
        Reflect.set(
          auth,
          'signInWithPassword',
          originalMethods.signInWithPassword,
        ) &&
        Reflect.set(auth, 'signOut', originalMethods.signOut),
      'SUPABASE_AUTH_STUB_RESTORE_FAILED',
    );
  }

  expectObserved(
    subscriptionUnsubscribeCount === 4,
    'AUTH_SUBSCRIPTION_CLEANUP_FAILED',
  );

  return {
    SUPABASE_STORAGE_ERROR_HANDLED: storageErrorHandled,
    AUTH_PROVIDER_MOUNTED: providerMountedObserved,
    AUTH_CONTEXT_OBSERVED: contextObserved,
    AUTH_STALE_REFRESH_REJECTED: staleRefreshRejected,
    AUTH_STALE_CALLBACK_REJECTED: staleCallbackRejected,
    AUTH_VALID_LOGIN_ACCEPTED: validLoginAccepted,
    AUTH_LOGOUT_SUCCESS_CLEANUP: logoutSuccessCleanup,
    AUTH_LOGOUT_ERROR_CLEANUP: logoutErrorCleanup,
  };
}

function getRequestedPlaylistMethod(init?: RequestInit) {
  const directMethod = init?.method?.toUpperCase();

  if (directMethod !== 'POST') {
    return directMethod ?? 'GET';
  }

  const requestBody = init?.body;
  if (typeof requestBody !== 'string') {
    return directMethod;
  }

  try {
    const payload = JSON.parse(requestBody) as {
      upstreamMethod?: unknown;
    };
    return payload.upstreamMethod === 'HEAD' ? 'HEAD' : 'GET';
  } catch {
    return directMethod;
  }
}

function createSyntheticPlaylistResponse(channelId: string) {
  const playlist = [
    '#EXTM3U',
    `#EXTINF:-1 tvg-id="${channelId}",Synthetic Channel`,
    `https://media.example.invalid/${channelId}`,
    '',
  ].join('\n');

  return new Response(playlist, {
    status: 200,
    headers: {
      'content-length': String(new TextEncoder().encode(playlist).byteLength),
      'content-type': 'application/x-mpegURL',
    },
  });
}

async function runPlaylistProviderAssertions() {
  const originalFetch = globalThis.fetch;
  const originalAddEventListener = window.addEventListener;
  const originalRemoveEventListener = window.removeEventListener;
  const addedRevocationListeners: EventListenerOrEventListenerObject[] = [];
  const removedRevocationListeners: EventListenerOrEventListenerObject[] = [];
  const pendingRequests: PendingPlaylistRequest[] = [];

  const trackedAddEventListener = (function trackedAddEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) {
    if (type === CLIENT_RUNTIME_ACCESS_REVOKED_EVENT) {
      addedRevocationListeners.push(listener);
    }
    originalAddEventListener.call(window, type, listener, options);
  }) as typeof window.addEventListener;
  const trackedRemoveEventListener = (function trackedRemoveEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ) {
    if (type === CLIENT_RUNTIME_ACCESS_REVOKED_EVENT) {
      removedRevocationListeners.push(listener);
    }
    originalRemoveEventListener.call(window, type, listener, options);
  }) as typeof window.removeEventListener;
  const fetchStub = (async (
    _input: URL | RequestInfo,
    init?: RequestInit,
  ) => {
    const requestedMethod = getRequestedPlaylistMethod(init);

    if (requestedMethod === 'HEAD') {
      return new Response(null, {
        status: 200,
        headers: { 'content-length': '128' },
      });
    }

    const deferred = createDeferred<Response>();
    pendingRequests.push({
      deferred,
      signal: init?.signal ?? null,
    });
    return deferred.promise;
  }) as typeof fetch;

  expectObserved(
    Reflect.set(window, 'addEventListener', trackedAddEventListener) &&
      Reflect.set(window, 'removeEventListener', trackedRemoveEventListener) &&
      Reflect.set(globalThis, 'fetch', fetchStub),
    'PLAYLIST_STUB_INSTALL_FAILED',
  );

  const snapshots: PlaylistSnapshot[] = [];
  let playlistContext: PlaylistRuntimeContextValue | null = null;
  let harness: MountedHarness | null = null;
  let providerMounted = false;
  let contextObserved = false;
  let channelsReady = false;
  let signalCaptured = false;
  let abortBeforeRevocation = false;
  let activeRequestAborted = false;
  let stateCleared = false;
  let staleResponseRejected = false;
  let unmountCleanup = false;
  let listenerCleanup = false;
  let unmountCallCount = 0;
  let firstLoadPromise: Promise<void> | null = null;
  let secondLoadPromise: Promise<void> | null = null;
  const loadPromises: Promise<void>[] = [];

  const syntheticSource: PlaylistSource = {
    url: 'https://source.example.invalid/synthetic.m3u',
    name: 'Synthetic Source',
    sourceType: 'manual',
  };
  const syntheticChannel: IptvChannel = {
    id: 'synthetic-loaded-channel',
    name: 'Synthetic Loaded Channel',
    url: 'https://media.example.invalid/loaded',
    groupTitle: 'Synthetic',
  };
  const syntheticDiagnostics: PlaylistDiagnostics = {
    contentLength: 128,
    totalLines: 3,
    startsWithExtM3u: true,
    extinfLines: 1,
    playableUrlLines: 1,
    firstNonEmptyLine: '#EXTM3U',
  };

  try {
    harness = await mountPlaylistHarness((context, snapshot) => {
      playlistContext = context;
      snapshots.push(snapshot);
    });
    await waitForObserved(
      () => playlistContext !== null && addedRevocationListeners.length > 0,
      'PLAYLIST_PROVIDER_NOT_READY',
    );

    providerMounted =
      harness.container.childElementCount > 0 &&
      addedRevocationListeners.length === 1;
    expectObserved(providerMounted, 'PLAYLIST_PROVIDER_NOT_MOUNTED');
    contextObserved =
      snapshots.length > 0 && snapshots[0].status === 'idle';
    expectObserved(contextObserved, 'PLAYLIST_CONTEXT_NOT_OBSERVED');

    await act(async () => {
      const context = getCurrentPlaylistContext(playlistContext);
      context.loadFromChannels({
        source: syntheticSource,
        channels: [syntheticChannel],
        diagnostics: syntheticDiagnostics,
      });
      context.selectChannel(syntheticChannel);
      await settleTasks();
    });

    const loadedContext = getCurrentPlaylistContext(playlistContext);
    channelsReady =
      loadedContext.status === 'ready' &&
      loadedContext.channels.length === 1 &&
      loadedContext.channels[0]?.id === syntheticChannel.id &&
      loadedContext.source?.url === syntheticSource.url &&
      loadedContext.selectedChannel?.id === syntheticChannel.id &&
      loadedContext.diagnostics?.extinfLines === 1;
    expectObserved(channelsReady, 'PLAYLIST_CHANNELS_NOT_READY');

    await act(async () => {
      firstLoadPromise = getCurrentPlaylistContext(
        playlistContext,
      ).loadFromSource(syntheticSource);
      loadPromises.push(firstLoadPromise);
      await waitForObserved(
        () => pendingRequests.length === 1,
        'PLAYLIST_FIRST_FETCH_NOT_CAPTURED',
      );
    });

    const firstRequest = pendingRequests[0];
    signalCaptured =
      firstRequest.signal instanceof AbortSignal &&
      Object.prototype.hasOwnProperty.call(firstRequest.signal, 'aborted') ===
        false;
    expectObserved(signalCaptured, 'PLAYLIST_ABORT_SIGNAL_NOT_CAPTURED');
    abortBeforeRevocation = firstRequest.signal?.aborted === false;
    expectObserved(
      abortBeforeRevocation,
      'PLAYLIST_SIGNAL_ABORTED_BEFORE_REVOCATION',
    );

    await act(async () => {
      notifyClientRuntimeAccessRevoked();
      await settleTasks();
    });

    activeRequestAborted = firstRequest.signal?.aborted === true;
    expectObserved(
      activeRequestAborted,
      'PLAYLIST_ACTIVE_REQUEST_NOT_ABORTED',
    );

    const revokedContext = getCurrentPlaylistContext(playlistContext);
    stateCleared =
      revokedContext.source === null &&
      revokedContext.channels.length === 0 &&
      revokedContext.selectedChannel === null &&
      revokedContext.diagnostics === null &&
      revokedContext.status === 'idle' &&
      revokedContext.progress === null &&
      revokedContext.error === null &&
      revokedContext.localCatalogScopeKey === null &&
      revokedContext.localCatalogGenerationId === null;
    expectObserved(stateCleared, 'PLAYLIST_STATE_NOT_CLEARED');

    const snapshotsBeforeStaleResponse = snapshots.length;
    const firstControlledLoad = firstLoadPromise;
    expectObserved(firstControlledLoad, 'PLAYLIST_FIRST_LOAD_PROMISE_MISSING');
    await act(async () => {
      firstRequest.deferred.resolve(
        createSyntheticPlaylistResponse('stale-after-revocation'),
      );
      await firstControlledLoad;
      await settleTasks();
    });

    const contextAfterStaleResponse = getCurrentPlaylistContext(
      playlistContext,
    );
    staleResponseRejected =
      contextAfterStaleResponse.status === 'idle' &&
      contextAfterStaleResponse.source === null &&
      contextAfterStaleResponse.channels.length === 0 &&
      snapshots
        .slice(snapshotsBeforeStaleResponse)
        .every(
          (snapshot) =>
            snapshot.channelCount === 0 && snapshot.status === 'idle',
        );
    expectObserved(
      staleResponseRejected,
      'PLAYLIST_STALE_RESPONSE_REPOPULATED_STATE',
    );

    await act(async () => {
      secondLoadPromise = getCurrentPlaylistContext(
        playlistContext,
      ).loadFromSource(syntheticSource);
      loadPromises.push(secondLoadPromise);
      await waitForObserved(
        () => pendingRequests.length === 2,
        'PLAYLIST_UNMOUNT_FETCH_NOT_CAPTURED',
      );
    });

    const secondRequest = pendingRequests[1];
    expectObserved(
      secondRequest.signal instanceof AbortSignal &&
        secondRequest.signal.aborted === false,
      'PLAYLIST_UNMOUNT_SIGNAL_INVALID',
    );
    const snapshotsBeforeUnmount = snapshots.length;

    await act(async () => {
      harness?.root.unmount();
      unmountCallCount += 1;
      await settleTasks();
    });

    const readSignalAborted = (signal: AbortSignal | null) =>
      signal?.aborted === true;
    unmountCleanup =
      unmountCallCount === 1 &&
      harness.container.childElementCount === 0 &&
      readSignalAborted(secondRequest.signal);
    expectObserved(unmountCleanup, 'PLAYLIST_UNMOUNT_CLEANUP_FAILED');

    listenerCleanup = addedRevocationListeners.every((addedListener) =>
      removedRevocationListeners.includes(addedListener),
    );
    expectObserved(listenerCleanup, 'PLAYLIST_LISTENER_CLEANUP_FAILED');

    const secondControlledLoad = secondLoadPromise;
    expectObserved(secondControlledLoad, 'PLAYLIST_SECOND_LOAD_PROMISE_MISSING');
    secondRequest.deferred.resolve(
      createSyntheticPlaylistResponse('stale-after-unmount'),
    );
    await secondControlledLoad;
    await settleTasks();
    notifyClientRuntimeAccessRevoked();
    await settleTasks();
    expectObserved(
      snapshots.length === snapshotsBeforeUnmount,
      'PLAYLIST_STATE_UPDATED_AFTER_UNMOUNT',
    );

    harness.container.remove();
    harness = null;
  } finally {
    if (harness) {
      cleanupHarness(harness);
    }
    Reflect.set(globalThis, 'fetch', originalFetch);
    Reflect.set(window, 'addEventListener', originalAddEventListener);
    Reflect.set(window, 'removeEventListener', originalRemoveEventListener);

    for (const pendingRequest of pendingRequests) {
      pendingRequest.deferred.reject(
        new DOMException('PLAYLIST_TEST_CLEANUP', 'AbortError'),
      );
    }

    await Promise.allSettled(loadPromises);
  }

  return {
    PLAYLIST_PROVIDER_MOUNTED: providerMounted,
    PLAYLIST_CONTEXT_OBSERVED: contextObserved,
    PLAYLIST_CHANNELS_READY: channelsReady,
    PLAYLIST_STATE_CLEARED_ON_REVOCATION: stateCleared,
    PLAYLIST_ABORT_SIGNAL_CAPTURED: signalCaptured,
    PLAYLIST_ABORT_BEFORE_REVOCATION: abortBeforeRevocation,
    PLAYLIST_ACTIVE_REQUEST_ABORTED: activeRequestAborted,
    PLAYLIST_STALE_RESPONSE_REJECTED: staleResponseRejected,
    PLAYLIST_UNMOUNT_CLEANUP: unmountCleanup,
    PLAYLIST_LISTENER_CLEANUP: listenerCleanup,
  };
}

function assertDomEnvironment() {
  const requiredGlobals = [
    window,
    document,
    navigator,
    Event,
    CustomEvent,
    EventTarget,
    Storage,
    localStorage,
    sessionStorage,
    DOMException,
    AbortController,
    AbortSignal,
    HTMLElement,
    Node,
    requestAnimationFrame,
    cancelAnimationFrame,
  ];

  expectObserved(
    requiredGlobals.every((value) => value !== undefined && value !== null),
    'RUNTIME_ACCESS_DOM_ENVIRONMENT_INCOMPLETE',
  );
  expectObserved(
    window.localStorage.length >= 0 &&
      window.localStorage.key(0) === null &&
      window.sessionStorage.length >= 0 &&
      window.sessionStorage.key(0) === null,
    'RUNTIME_ACCESS_STORAGE_API_INCOMPLETE',
  );
}

export async function runClientRuntimeAccessSmokeTest(): Promise<RuntimeAccessSmokeResult> {
  assertDomEnvironment();
  clearTestStorages();

  const actEnvironmentTarget = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  const previousActEnvironmentDescriptor = Object.getOwnPropertyDescriptor(
    actEnvironmentTarget,
    'IS_REACT_ACT_ENVIRONMENT',
  );
  Object.defineProperty(actEnvironmentTarget, 'IS_REACT_ACT_ENVIRONMENT', {
    configurable: true,
    writable: true,
    value: true,
  });

  const originalConsoleError = console.error;
  const originalConsoleInfo = console.info;
  const originalConsoleWarn = console.warn;
  const reactUnmountWarnings: string[] = [];
  console.info = () => undefined;
  console.warn = () => undefined;
  console.error = (...args: unknown[]) => {
    const message = args
      .map((value) => (value instanceof Error ? value.message : String(value)))
      .join(' ');
    if (/state update.+unmounted|unmounted component/i.test(message)) {
      reactUnmountWarnings.push(message);
    }
  };

  try {
    const eventResults = await runEventServiceAssertions();
    const storageResults = runSupabaseStorageAssertions();
    const bootstrapResults = runBootstrapAssertions();
    const authResults = await runAuthProviderAssertions();
    const playlistResults = await runPlaylistProviderAssertions();
    const reactWarningCount = reactUnmountWarnings.length;
    expectObserved(reactWarningCount === 0, 'REACT_UNMOUNT_WARNING_DETECTED');

    const behaviorResults = {
      ...eventResults,
      ...storageResults,
      ...authResults,
      ...bootstrapResults,
      ...playlistResults,
    };
    const ok =
      Object.values(behaviorResults).every((value) => value === true) &&
      reactWarningCount === 0;
    expectObserved(ok, 'RUNTIME_ACCESS_BEHAVIOR_CHECK_FAILED');

    return {
      ok,
      ...behaviorResults,
      REACT_WARNING_COUNT: reactWarningCount,
    };
  } finally {
    console.error = originalConsoleError;
    console.info = originalConsoleInfo;
    console.warn = originalConsoleWarn;
    await supabase.auth.stopAutoRefresh();
    clearTestStorages();
    if (previousActEnvironmentDescriptor) {
      Object.defineProperty(
        actEnvironmentTarget,
        'IS_REACT_ACT_ENVIRONMENT',
        previousActEnvironmentDescriptor,
      );
    } else {
      Reflect.deleteProperty(
        actEnvironmentTarget,
        'IS_REACT_ACT_ENVIRONMENT',
      );
    }
  }
}
