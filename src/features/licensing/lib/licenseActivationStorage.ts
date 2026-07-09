import type { StoredLicenseActivation } from '../types/license.types';

const LICENSE_ACTIVATION_STORAGE_KEY = 'xandeflix.licenseActivation';

export function getStoredLicenseActivation(): StoredLicenseActivation | null {
  if (typeof window === 'undefined') {
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
  window.localStorage.setItem(
    LICENSE_ACTIVATION_STORAGE_KEY,
    JSON.stringify(activation),
  );
}

export function clearStoredLicenseActivation() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(LICENSE_ACTIVATION_STORAGE_KEY);
  } catch {
    // Ativacao local ausente ou indisponivel ja equivale a sessao nao confiavel.
  }
}
