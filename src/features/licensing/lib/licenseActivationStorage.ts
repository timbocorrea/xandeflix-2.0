import type { StoredLicenseActivation } from '../types/license.types';
import { clearPersistedLicenseSessionLease } from './licenseSessionLeaseStorage';

const LICENSE_ACTIVATION_STORAGE_KEY = 'xandeflix.licenseActivation';
const ACCESS_SIGNED_OUT_STORAGE_KEY = 'xandeflix:access:signed-out';

type ClearStoredLicenseActivationOptions = {
  markSignedOut?: boolean;
};

function getBrowserStorages() {
  if (typeof window === 'undefined') {
    return [];
  }

  return [window.localStorage, window.sessionStorage];
}

function removeStoredLicenseActivationKeys() {
  for (const storage of getBrowserStorages()) {
    try {
      storage.removeItem(LICENSE_ACTIVATION_STORAGE_KEY);
    } catch {
      // Storage indisponivel ja equivale a ativacao local nao confiavel.
    }
  }
}

export function isClientAccessSignedOut() {
  for (const storage of getBrowserStorages()) {
    try {
      if (storage.getItem(ACCESS_SIGNED_OUT_STORAGE_KEY) === 'true') {
        return true;
      }
    } catch {
      // Ignora storage indisponivel e continua bloqueando pela ausencia de licenca.
    }
  }

  return false;
}

export function markClientAccessSignedOut() {
  for (const storage of getBrowserStorages()) {
    try {
      storage.setItem(ACCESS_SIGNED_OUT_STORAGE_KEY, 'true');
    } catch {
      // Marcador best-effort; a remocao da licenca continua sendo a barreira principal.
    }
  }
}

export function clearClientAccessSignedOut() {
  for (const storage of getBrowserStorages()) {
    try {
      storage.removeItem(ACCESS_SIGNED_OUT_STORAGE_KEY);
    } catch {
      // Marcador ausente ou storage indisponivel nao deve bloquear nova ativacao.
    }
  }
}

export function getStoredLicenseActivation(): StoredLicenseActivation | null {
  if (typeof window === 'undefined') {
    return null;
  }

  if (isClientAccessSignedOut()) {
    removeStoredLicenseActivationKeys();
    return null;
  }

  try {
    const storedValue = window.localStorage.getItem(LICENSE_ACTIVATION_STORAGE_KEY);

    if (!storedValue) {
      return null;
    }

    const parsedValue = JSON.parse(storedValue) as StoredLicenseActivation;

    if (!parsedValue.licenseCode?.trim() || !parsedValue.deviceIdentifier?.trim()) {
      return null;
    }

    return parsedValue;
  } catch {
    return null;
  }
}

export function saveStoredLicenseActivation(
  activation: StoredLicenseActivation,
) {
  clearClientAccessSignedOut();
  window.localStorage.setItem(
    LICENSE_ACTIVATION_STORAGE_KEY,
    JSON.stringify(activation),
  );
}

export function clearStoredLicenseActivation(
  options: ClearStoredLicenseActivationOptions = {},
) {
  if (typeof window === 'undefined') {
    return;
  }

  removeStoredLicenseActivationKeys();
  clearPersistedLicenseSessionLease();

  if (options.markSignedOut) {
    markClientAccessSignedOut();
  }
}
