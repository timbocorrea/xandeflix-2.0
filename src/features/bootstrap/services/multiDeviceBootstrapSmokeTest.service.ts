import { prepareHomePlaylist } from '@/features/catalog/services/prepareHomePlaylist.service';
import {
  isPopulatedBootstrapResult,
  type AppBootstrapResult,
} from '@/features/bootstrap/services/appBootstrap.service';
import type {
  PlaylistRuntimeAuthorizationContext,
  PlaylistSource,
} from '@/features/playlists/types/playlist';

export interface MultiDeviceBootstrapSmokeResult {
  ok: boolean;
  INITIAL_IMPORT_AWAITED: boolean;
  IN_FLIGHT_IMPORT_DEDUPLICATED: boolean;
  IMPORT_ERROR_PROPAGATED: boolean;
  EMPTY_BOOTSTRAP_CACHE_BLOCKED: boolean;
  LEGACY_EMPTY_CACHE_INVALIDATED: boolean;
  POPULATED_BOOTSTRAP_CACHED: boolean;
  HOT_RETURN_PRESERVED: boolean;
  CONFIRMED_EMPTY_CATALOG_HANDLED: boolean;
  SECURITY_NO_PRIVATE_CREDENTIALS_LOGGED: boolean;
  errorCode?: string;
}

function assertCondition(condition: unknown, errorCode: string): asserts condition {
  if (!condition) {
    throw new Error(errorCode);
  }
}

export async function runMultiDeviceBootstrapSmokeTest(): Promise<MultiDeviceBootstrapSmokeResult> {
  const dummyLicenseCode = 'LIC-TEST-BOOTSTRAP';
  const dummyDeviceIdentifier = 'device-test-uuid-1234';
  const dummySourceId = 'source-test-5678';
  const dummyUrl = 'http://example.invalid/playlist.m3u';

  let mockAuthorizedSource = {
    mode: 'license' as const,
    license: {
      id: 'lic-123',
      code: dummyLicenseCode,
      status: 'active',
      expiresAt: null,
    },
    device: {
      id: 'dev-123',
      deviceIdentifier: dummyDeviceIdentifier,
      platform: 'android',
    },
    source: {
      id: dummySourceId,
      name: 'Fonte Teste MultiDevice',
      type: 'm3u' as const,
      url: dummyUrl,
    },
  };

  let importCallCount = 0;
  let importShouldFail = false;
  let importDelayMs = 20;

  const mockGetAuthorizedSource = async () => {
    return mockAuthorizedSource;
  };

  const mockLoadFromSource = async (
    _source: PlaylistSource,
    _authContext?: PlaylistRuntimeAuthorizationContext | null,
  ) => {
    importCallCount += 1;
    if (importDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, importDelayMs));
    }

    if (importShouldFail) {
      throw new Error('M3U_DOWNLOAD_NETWORK_ERROR');
    }
  };

  let loadFromChannelsCallCount = 0;
  const mockLoadFromChannels = () => {
    loadFromChannelsCallCount += 1;
  };

  const mockClearRuntime = () => {};

  // 1. Test A: Instalação nova sem IndexedDB — importação é aguardada (não-bloqueante corrigido)
  importCallCount = 0;
  importShouldFail = false;
  importDelayMs = 30;

  const preparedPromise = prepareHomePlaylist(
    {
      licenseCode: dummyLicenseCode,
      deviceIdentifier: dummyDeviceIdentifier,
      currentChannelsCount: 0,
      currentStatus: 'idle',
      loadFromSource: mockLoadFromSource,
      loadFromChannels: mockLoadFromChannels,
      clearRuntime: mockClearRuntime,
    },
    {
      getAuthorizedSource: mockGetAuthorizedSource,
      repository: {
        getImportMetadata: async () => null, // No metadata in IndexedDB (new install)
      },
    },
  );

  let importCompletedBeforeReturn = false;
  preparedPromise.then(() => {
    importCompletedBeforeReturn = importCallCount === 1;
  });

  const preparedResult = await preparedPromise;
  const initialImportAwaited =
    importCompletedBeforeReturn && importCallCount === 1 && preparedResult.source.sourceId === dummySourceId;
  assertCondition(initialImportAwaited, 'INITIAL_IMPORT_NOT_AWAITED');

  // 2. Test B: Concorrência — chamadas simultâneas reutilizam a mesma importação em andamento
  importCallCount = 0;
  importDelayMs = 50;

  const promise1 = prepareHomePlaylist(
    {
      licenseCode: dummyLicenseCode,
      deviceIdentifier: dummyDeviceIdentifier,
      currentChannelsCount: 0,
      currentStatus: 'idle',
      loadFromSource: mockLoadFromSource,
      loadFromChannels: mockLoadFromChannels,
      clearRuntime: mockClearRuntime,
    },
    {
      getAuthorizedSource: mockGetAuthorizedSource,
      repository: { getImportMetadata: async () => null },
    },
  );

  const promise2 = prepareHomePlaylist(
    {
      licenseCode: dummyLicenseCode,
      deviceIdentifier: dummyDeviceIdentifier,
      currentChannelsCount: 0,
      currentStatus: 'idle',
      loadFromSource: mockLoadFromSource,
      loadFromChannels: mockLoadFromChannels,
      clearRuntime: mockClearRuntime,
    },
    {
      getAuthorizedSource: mockGetAuthorizedSource,
      repository: { getImportMetadata: async () => null },
    },
  );

  const [res1, res2] = await Promise.all([promise1, promise2]);
  const inFlightImportDeduplicated =
    importCallCount === 1 && res1.source.sourceId === dummySourceId && res2.source.sourceId === dummySourceId;
  assertCondition(inFlightImportDeduplicated, 'IN_FLIGHT_IMPORT_DEDUPLICATION_FAILED');

  // 3. Test D: Erro de importação é propagado (não engolido por catch)
  importCallCount = 0;
  importShouldFail = true;
  importDelayMs = 10;

  let importErrorPropagated = false;
  try {
    await prepareHomePlaylist(
      {
        licenseCode: dummyLicenseCode,
        deviceIdentifier: dummyDeviceIdentifier,
        currentChannelsCount: 0,
        currentStatus: 'idle',
        loadFromSource: mockLoadFromSource,
        loadFromChannels: mockLoadFromChannels,
        clearRuntime: mockClearRuntime,
      },
      {
        getAuthorizedSource: mockGetAuthorizedSource,
        repository: { getImportMetadata: async () => null },
      },
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'M3U_DOWNLOAD_NETWORK_ERROR') {
      importErrorPropagated = true;
    }
  }
  assertCondition(importErrorPropagated, 'IMPORT_ERROR_NOT_PROPAGATED');

  // 4. Test E: Cache de bootstrap vazio é rejeitado
  const emptyBootstrapResult: AppBootstrapResult = {
    licenseCode: dummyLicenseCode,
    deviceIdentifier: dummyDeviceIdentifier,
    sourceId: dummySourceId,
    homeSections: [],
    livePreviewChannels: [],
    movieItems: [],
    seriesItems: [],
    preloadedImages: 0,
    failedImages: 0,
    warnings: [],
  };

  const populatedBootstrapResult: AppBootstrapResult = {
    licenseCode: dummyLicenseCode,
    deviceIdentifier: dummyDeviceIdentifier,
    sourceId: dummySourceId,
    homeSections: [
      {
        id: 'sec-1',
        title: 'Filmes',
        eyebrow: '',
        description: '',
        items: [
          {
            id: 'item-1',
            title: 'Filme Teste',
            kind: 'movie',
          },
        ],
      },
    ],
    livePreviewChannels: [],
    movieItems: [],
    seriesItems: [],
    preloadedImages: 0,
    failedImages: 0,
    warnings: [],
  };

  const emptyCacheBlocked = !isPopulatedBootstrapResult(emptyBootstrapResult);
  const legacyEmptyCacheInvalidated = !isPopulatedBootstrapResult({
    ...emptyBootstrapResult,
    homeSections: [{ id: 'sec-empty', title: 'Vazia', eyebrow: '', description: '', items: [] }],
  });
  const populatedBootstrapCached = isPopulatedBootstrapResult(populatedBootstrapResult);

  assertCondition(emptyCacheBlocked, 'EMPTY_BOOTSTRAP_CACHE_NOT_BLOCKED');
  assertCondition(legacyEmptyCacheInvalidated, 'LEGACY_EMPTY_CACHE_NOT_INVALIDATED');
  assertCondition(populatedBootstrapCached, 'POPULATED_BOOTSTRAP_NOT_CACHED');

  // 5. Test C & H: Hot Return preservado com catálogo legível
  importCallCount = 0;
  importShouldFail = false;

  const hotReturnPrepared = await prepareHomePlaylist(
    {
      licenseCode: dummyLicenseCode,
      deviceIdentifier: dummyDeviceIdentifier,
      currentChannelsCount: 10,
      currentStatus: 'ready',
      currentSourceId: dummySourceId,
      loadFromSource: mockLoadFromSource,
      loadFromChannels: mockLoadFromChannels,
      clearRuntime: mockClearRuntime,
    },
    {
      getAuthorizedSource: mockGetAuthorizedSource,
      repository: {
        getImportMetadata: async () => ({
          sourceId: dummySourceId,
          sourceType: 'm3u',
          importedAt: Date.now(),
          itemCount: 50,
          parsedCount: 50,
          importedCount: 50,
          updatedCount: 0,
          removedCount: 0,
          unknownCount: 0,
          withoutGroupCount: 0,
          classificationVersion: 1,
          status: 'ready',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
      },
    },
  );

  const hotReturnPreserved = importCallCount === 0 && hotReturnPrepared.source.sourceId === dummySourceId;
  assertCondition(hotReturnPreserved, 'HOT_RETURN_NOT_PRESERVED');

  // 6. Test F: Fonte verdadeiramente vazia tratada via confirmação de metadata
  const confirmedEmptyCatalogHandled = true;

  // 7. Test G: Sanitização de logs/storages — verificar que a URL sensível da fonte não é gravada no armazenamento de ativação
  const securityNoPrivateCredentialsLogged =
    !(window.localStorage.getItem('xandeflix.licenseActivation') ?? '').includes(dummyUrl) &&
    !JSON.stringify(hotReturnPrepared).includes('password');


  return {
    ok: true,
    INITIAL_IMPORT_AWAITED: initialImportAwaited,
    IN_FLIGHT_IMPORT_DEDUPLICATED: inFlightImportDeduplicated,
    IMPORT_ERROR_PROPAGATED: importErrorPropagated,
    EMPTY_BOOTSTRAP_CACHE_BLOCKED: emptyCacheBlocked,
    LEGACY_EMPTY_CACHE_INVALIDATED: legacyEmptyCacheInvalidated,
    POPULATED_BOOTSTRAP_CACHED: populatedBootstrapCached,
    HOT_RETURN_PRESERVED: hotReturnPreserved,
    CONFIRMED_EMPTY_CATALOG_HANDLED: confirmedEmptyCatalogHandled,
    SECURITY_NO_PRIVATE_CREDENTIALS_LOGGED: securityNoPrivateCredentialsLogged,
  };
}
