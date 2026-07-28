import {
  mapAuthorizedIptvSourceToPlaylistSource,
  mapAuthorizedIptvSourceToRuntimeAuthorizationContext,
  type AuthorizedIptvSource,
} from './authorizedIptvSource.service';

export type AuthorizedIptvSourceRuntimeContextSmokeTestResult = {
  ok: boolean;
  internalLicenseIdForwarded: boolean;
  rawLicenseCodeAbsent: boolean;
  legacyWithoutLicenseReturnsNull: boolean;
  playlistSourceUnchanged: boolean;
  sourceMappingPreserved: boolean;
  contextDeterministic: boolean;
};

const SYNTHETIC_INTERNAL_LICENSE_ID = 'synthetic-internal-license-id';
const SYNTHETIC_RAW_LICENSE_CODE = 'SYNTHETIC-RAW-LICENSE-CODE';

function createSyntheticAuthorizedSource(
  license: AuthorizedIptvSource['license'],
): AuthorizedIptvSource {
  return {
    mode: license ? 'license' : 'legacy',
    license,
    device: {
      id: 'synthetic-device-id',
      platform: 'synthetic',
    },
    source: {
      id: 'synthetic-source-id',
      name: 'Synthetic source',
      type: 'm3u',
      url: 'https://synthetic.invalid/playlist.m3u',
    },
  };
}

export async function runAuthorizedIptvSourceRuntimeContextSmokeTest(): Promise<AuthorizedIptvSourceRuntimeContextSmokeTestResult> {
  const storageLengthsBefore =
    typeof window === 'undefined'
      ? null
      : [window.localStorage.length, window.sessionStorage.length];
  const databasesBefore = await globalThis.indexedDB?.databases?.();
  const authorizedSource = createSyntheticAuthorizedSource({
    id: `  ${SYNTHETIC_INTERNAL_LICENSE_ID}  `,
    code: SYNTHETIC_RAW_LICENSE_CODE,
    status: 'active',
    expiresAt: null,
  });
  const context =
    mapAuthorizedIptvSourceToRuntimeAuthorizationContext(authorizedSource);
  const repeatedContext =
    mapAuthorizedIptvSourceToRuntimeAuthorizationContext(authorizedSource);
  const playlistSource =
    mapAuthorizedIptvSourceToPlaylistSource(authorizedSource);
  const legacyContext = mapAuthorizedIptvSourceToRuntimeAuthorizationContext(
    createSyntheticAuthorizedSource(undefined),
  );
  const serializedContext = JSON.stringify(context);
  const storageLengthsAfter =
    typeof window === 'undefined'
      ? null
      : [window.localStorage.length, window.sessionStorage.length];
  const databasesAfter = await globalThis.indexedDB?.databases?.();
  const noPersistence =
    JSON.stringify(storageLengthsAfter) === JSON.stringify(storageLengthsBefore) &&
    JSON.stringify(databasesAfter) === JSON.stringify(databasesBefore);

  const result: AuthorizedIptvSourceRuntimeContextSmokeTestResult = {
    internalLicenseIdForwarded:
      context?.internalLicenseId === SYNTHETIC_INTERNAL_LICENSE_ID,
    rawLicenseCodeAbsent:
      !serializedContext.includes(SYNTHETIC_RAW_LICENSE_CODE) &&
      !Object.prototype.hasOwnProperty.call(context ?? {}, 'licenseCode'),
    legacyWithoutLicenseReturnsNull: legacyContext === null,
    playlistSourceUnchanged:
      !Object.prototype.hasOwnProperty.call(playlistSource, 'internalLicenseId'),
    sourceMappingPreserved:
      playlistSource.url === authorizedSource.source.url &&
      playlistSource.name === authorizedSource.source.name &&
      playlistSource.sourceId === authorizedSource.source.id &&
      playlistSource.sourceType === authorizedSource.source.type,
    contextDeterministic:
      JSON.stringify(context) === JSON.stringify(repeatedContext) &&
      noPersistence,
    ok: false,
  };

  result.ok = Object.entries(result).every(
    ([key, value]) => key === 'ok' || value === true,
  );

  return result;
}
