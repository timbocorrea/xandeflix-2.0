export type NetworkMode = 'wifi' | 'mobile' | 'unknown';

export type NetworkStatus = {
  mode: NetworkMode;
  isOnline: boolean;
  effectiveType?: string;
};

type NetworkInformation = EventTarget & {
  type?: string;
  effectiveType?: string;
  saveData?: boolean;
  onchange?: EventListener;
  addEventListener?: (type: string, listener: EventListener) => void;
  removeEventListener?: (type: string, listener: EventListener) => void;
};

function getNetworkConnection(): NetworkInformation | null {
  if (typeof navigator === 'undefined') {
    return null;
  }

  const nav = navigator as unknown as {
    connection?: NetworkInformation;
    mozConnection?: NetworkInformation;
    webkitConnection?: NetworkInformation;
  };

  return nav.connection ?? nav.mozConnection ?? nav.webkitConnection ?? null;
}

export function detectNetworkMode(): NetworkMode {
  if (typeof navigator === 'undefined') {
    return 'unknown';
  }

  if (navigator.onLine === false) {
    return 'unknown';
  }

  const connection = getNetworkConnection();

  if (!connection) {
    return 'unknown';
  }

  const connType = (connection.type ?? '').toLowerCase();
  const effectiveType = (connection.effectiveType ?? '').toLowerCase();

  if (connType === 'wifi' || connType === 'ethernet') {
    return 'wifi';
  }

  if (
    connType === 'cellular' ||
    connType === 'mobile' ||
    effectiveType === '2g' ||
    effectiveType === '3g' ||
    effectiveType === '4g' ||
    effectiveType === 'slow-2g'
  ) {
    return 'mobile';
  }

  if (effectiveType) {
    return 'unknown';
  }

  return 'unknown';
}

export function getNetworkStatus(): NetworkStatus {
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
  const connection = getNetworkConnection();
  const effectiveType = connection?.effectiveType;
  const mode = isOnline ? detectNetworkMode() : 'unknown';

  return {
    mode,
    isOnline,
    effectiveType,
  };
}

export function subscribeNetworkStatus(
  callback: (status: NetworkStatus) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleStatusChange = () => {
    callback(getNetworkStatus());
  };

  window.addEventListener('online', handleStatusChange);
  window.addEventListener('offline', handleStatusChange);

  const connection = getNetworkConnection();
  if (connection && typeof connection.addEventListener === 'function') {
    connection.addEventListener('change', handleStatusChange);
  }

  return () => {
    window.removeEventListener('online', handleStatusChange);
    window.removeEventListener('offline', handleStatusChange);

    if (connection && typeof connection.removeEventListener === 'function') {
      connection.removeEventListener('change', handleStatusChange);
    }
  };
}
