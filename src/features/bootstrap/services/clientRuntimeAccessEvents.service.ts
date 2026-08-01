export const CLIENT_RUNTIME_ACCESS_REVOKED_EVENT =
  'xandeflix:client-runtime-access-revoked';

export function notifyClientRuntimeAccessRevoked(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(CLIENT_RUNTIME_ACCESS_REVOKED_EVENT));
}
