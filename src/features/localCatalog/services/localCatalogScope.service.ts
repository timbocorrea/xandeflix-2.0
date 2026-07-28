const TENANT_SCOPE_DOMAIN = 'xandeflix:local-catalog-scope:v1:';
const SCOPE_KEY_DOMAIN = 'xandeflix:local-catalog-scope-key:v1:';
const MAX_IDENTIFIER_LENGTH = 256;

function validateIdentifier(value: string, errorCode: string) {
  const normalized = value.trim();
  const containsControlCharacter = Array.from(normalized).some((character) => {
    const characterCode = character.charCodeAt(0);
    return characterCode <= 31 || characterCode === 127;
  });

  if (
    !normalized ||
    normalized.length > MAX_IDENTIFIER_LENGTH ||
    containsControlCharacter
  ) {
    throw new Error(errorCode);
  }

  return normalized;
}

async function sha256(value: string) {
  if (!globalThis.crypto?.subtle) {
    throw new Error('LOCAL_CATALOG_SCOPE_CRYPTO_UNAVAILABLE');
  }

  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export async function deriveLocalCatalogScope(input: {
  internalLicenseId: string;
  sourceId: string;
}) {
  const internalLicenseId = validateIdentifier(
    input.internalLicenseId,
    'LOCAL_CATALOG_INTERNAL_LICENSE_ID_INVALID',
  );
  const sourceId = validateIdentifier(
    input.sourceId,
    'LOCAL_CATALOG_SOURCE_ID_INVALID',
  );
  const tenantDigest = await sha256(`${TENANT_SCOPE_DOMAIN}${internalLicenseId}`);
  const tenantScopeId = `tenant_v1_${tenantDigest}`;
  const scopeDigest = await sha256(
    `${SCOPE_KEY_DOMAIN}${tenantScopeId}:${sourceId}`,
  );

  return {
    tenantScopeId,
    scopeKey: `scope_v1_${scopeDigest}`,
    sourceId,
  };
}
