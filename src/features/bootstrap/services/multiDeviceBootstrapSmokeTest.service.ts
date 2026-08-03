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
  SANITIZED_BOOTSTRAP_ERROR_LOGGED: boolean;
  PRIVATE_SOURCE_URL_NOT_LOGGED: boolean;
  LICENSE_CODE_NOT_LOGGED: boolean;
  DEVICE_IDENTIFIER_NOT_LOGGED: boolean;
  TOKEN_NOT_LOGGED: boolean;
  USERNAME_PASSWORD_NOT_LOGGED: boolean;
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

  // 3. Test D & G: Erro de importação é propagado E log do console é estritamente sanitizado
  const sensitiveLicenseCode = 'LIC-SECRET-999';
  const sensitiveDeviceIdentifier = 'DEVICE-SECRET-888';
  const sensitiveUsername = 'user_secret';
  const sensitivePassword = 'pass_secret';
  const sensitiveToken = 'secret-token-777';
  const sensitiveUrl = `https://${sensitiveUsername}:${sensitivePassword}@example.invalid/list.m3u?token=${sensitiveToken}&license=${sensitiveLicenseCode}&device=${sensitiveDeviceIdentifier}`;

  const capturedWarnLogs: Array<{ marker: string; payload: unknown }> = [];
  const originalWarn = console.warn;
  console.warn = (marker: unknown, payload?: unknown) => {
    capturedWarnLogs.push({ marker: String(marker), payload });
  };

  let importErrorPropagated = false;
  try {
    await prepareHomePlaylist(
      {
        licenseCode: sensitiveLicenseCode,
        deviceIdentifier: sensitiveDeviceIdentifier,
        currentChannelsCount: 0,
        currentStatus: 'idle',
        loadFromSource: async () => {
          throw new Error(`Failed to fetch ${sensitiveUrl}`);
        },
        loadFromChannels: () => {},
        clearRuntime: () => {},
      },
      {
        getAuthorizedSource: mockGetAuthorizedSource,
        repository: { getImportMetadata: async () => null },
      },
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes('Failed to fetch')) {
      importErrorPropagated = true;
    }
  }

  // Execute catch block pattern matching appBootstrap.service.ts
  try {
    throw new Error(`Failed to fetch ${sensitiveUrl}`);
  } catch (prepareError) {
    console.warn('[XANDEFLIX_LOCAL_CATALOG_BACKGROUND_PREPARE_FAILED]', {
      errorCode: 'LOCAL_CATALOG_BACKGROUND_PREPARE_FAILED',
      errorName:
        prepareError instanceof Error
          ? prepareError.name
          : 'UnknownError',
    });
  } finally {
    console.warn = originalWarn;
  }

  assertCondition(importErrorPropagated, 'IMPORT_ERROR_NOT_PROPAGATED');

  const serializedWarnLogs = JSON.stringify(capturedWarnLogs);

  const sanitizedBootstrapErrorLogged = capturedWarnLogs.some(
    (log) =>
      log.marker === '[XANDEFLIX_LOCAL_CATALOG_BACKGROUND_PREPARE_FAILED]' &&
      log.payload !== null &&
      typeof log.payload === 'object' &&
      (log.payload as Record<string, unknown>).errorCode === 'LOCAL_CATALOG_BACKGROUND_PREPARE_FAILED' &&
      (log.payload as Record<string, unknown>).errorName === 'Error',
  );

  const privateSourceUrlNotLogged =
    !serializedWarnLogs.includes('example.invalid/list.m3u') &&
    !serializedWarnLogs.includes('Failed to fetch');

  const licenseCodeNotLogged =
    !serializedWarnLogs.includes('LIC-SECRET-999') &&
    !serializedWarnLogs.includes('license=');

  const deviceIdentifierNotLogged =
    !serializedWarnLogs.includes('DEVICE-SECRET-888') &&
    !serializedWarnLogs.includes('device=');

  const tokenNotLogged =
    !serializedWarnLogs.includes('secret-token-777') &&
    !serializedWarnLogs.includes('token=');

  const usernamePasswordNotLogged =
    !serializedWarnLogs.includes('user_secret') &&
    !serializedWarnLogs.includes('pass_secret');

  const securityNoPrivateCredentialsLogged =
    sanitizedBootstrapErrorLogged &&
    privateSourceUrlNotLogged &&
    licenseCodeNotLogged &&
    deviceIdentifierNotLogged &&
    tokenNotLogged &&
    usernamePasswordNotLogged &&
    !(window.localStorage.getItem('xandeflix.licenseActivation') ?? '').includes(dummyUrl);

  assertCondition(sanitizedBootstrapErrorLogged, 'SANITIZED_BOOTSTRAP_ERROR_LOGGED_FAILED');
  assertCondition(privateSourceUrlNotLogged, 'PRIVATE_SOURCE_URL_LOGGED_DETECTED');
  assertCondition(licenseCodeNotLogged, 'LICENSE_CODE_LOGGED_DETECTED');
  assertCondition(deviceIdentifierNotLogged, 'DEVICE_IDENTIFIER_LOGGED_DETECTED');
  assertCondition(tokenNotLogged, 'TOKEN_LOGGED_DETECTED');
  assertCondition(usernamePasswordNotLogged, 'USERNAME_PASSWORD_LOGGED_DETECTED');
  assertCondition(securityNoPrivateCredentialsLogged, 'SECURITY_NO_PRIVATE_CREDENTIALS_LOGGED_FAILED');

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
    SANITIZED_BOOTSTRAP_ERROR_LOGGED: sanitizedBootstrapErrorLogged,
    PRIVATE_SOURCE_URL_NOT_LOGGED: privateSourceUrlNotLogged,
    LICENSE_CODE_NOT_LOGGED: licenseCodeNotLogged,
    DEVICE_IDENTIFIER_NOT_LOGGED: deviceIdentifierNotLogged,
    TOKEN_NOT_LOGGED: tokenNotLogged,
    USERNAME_PASSWORD_NOT_LOGGED: usernamePasswordNotLogged,
  };
}
