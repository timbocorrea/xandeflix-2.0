const DEVICE_IDENTIFIER_STORAGE_KEY = 'xandeflix.deviceIdentifier';

function createFallbackDeviceIdentifier() {
  const cryptoApi = globalThis.crypto;

  if (cryptoApi?.randomUUID) {
    return `xf-${cryptoApi.randomUUID()}`;
  }

  return `xf-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function getOrCreateDeviceIdentifier() {
  const storedIdentifier = window.localStorage.getItem(
    DEVICE_IDENTIFIER_STORAGE_KEY,
  );

  if (storedIdentifier?.trim()) {
    return storedIdentifier;
  }

  const nextIdentifier = createFallbackDeviceIdentifier();

  window.localStorage.setItem(
    DEVICE_IDENTIFIER_STORAGE_KEY,
    nextIdentifier,
  );

  return nextIdentifier;
}

export function resetDeviceIdentifierForDiagnostics() {
  window.localStorage.removeItem(DEVICE_IDENTIFIER_STORAGE_KEY);
}
