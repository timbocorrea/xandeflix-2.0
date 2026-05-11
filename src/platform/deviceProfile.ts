export type DeviceRuntime =
  | 'web'
  | 'capacitor-android'
  | 'tizen'
  | 'webos';

export type DeviceFormFactor =
  | 'mobile'
  | 'tablet'
  | 'tv'
  | 'desktop';

export type DeviceInputMode =
  | 'touch'
  | 'keyboard'
  | 'dpad'
  | 'mixed';

export type PlayerStrategy =
  | 'html5'
  | 'native-android'
  | 'tizen-avplay'
  | 'webos-media';

export interface DeviceProfile {
  runtime: DeviceRuntime;
  formFactor: DeviceFormFactor;
  inputMode: DeviceInputMode;
  playerStrategy: PlayerStrategy;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
  aspectRatio: number;
}

function getRuntime(userAgent: string): DeviceRuntime {
  const normalizedUserAgent = userAgent.toLowerCase();

  if (normalizedUserAgent.includes('tizen')) {
    return 'tizen';
  }

  if (
    normalizedUserAgent.includes('web0s') ||
    normalizedUserAgent.includes('webos') ||
    normalizedUserAgent.includes('lg browser')
  ) {
    return 'webos';
  }

  if (normalizedUserAgent.includes('android')) {
    return 'capacitor-android';
  }

  return 'web';
}

function getFormFactor(params: {
  runtime: DeviceRuntime;
  userAgent: string;
  viewportWidth: number;
  viewportHeight: number;
}): DeviceFormFactor {
  const { runtime, userAgent, viewportWidth, viewportHeight } = params;
  const normalizedUserAgent = userAgent.toLowerCase();
  const shortestSide = Math.min(viewportWidth, viewportHeight);

  if (
    normalizedUserAgent.includes('aft') ||
    normalizedUserAgent.includes('fire tv') ||
    normalizedUserAgent.includes('smart-tv') ||
    normalizedUserAgent.includes('smarttv') ||
    normalizedUserAgent.includes('android tv') ||
    runtime === 'tizen' ||
    runtime === 'webos'
  ) {
    return 'tv';
  }

  if (normalizedUserAgent.includes('mobile') && shortestSide < 768) {
    return 'mobile';
  }

  if (shortestSide >= 768 && normalizedUserAgent.includes('android')) {
    return 'tablet';
  }

  if (viewportWidth >= 1280 && viewportHeight >= 720) {
    return 'desktop';
  }

  return 'mobile';
}

function getInputMode(formFactor: DeviceFormFactor): DeviceInputMode {
  if (formFactor === 'tv') {
    return 'dpad';
  }

  if (formFactor === 'tablet' || formFactor === 'mobile') {
    return 'touch';
  }

  return 'mixed';
}

function getPlayerStrategy(runtime: DeviceRuntime): PlayerStrategy {
  if (runtime === 'capacitor-android') {
    return 'native-android';
  }

  if (runtime === 'tizen') {
    return 'tizen-avplay';
  }

  if (runtime === 'webos') {
    return 'webos-media';
  }

  return 'html5';
}

export function getDeviceProfile(): DeviceProfile {
  if (typeof window === 'undefined') {
    return {
      runtime: 'web',
      formFactor: 'desktop',
      inputMode: 'keyboard',
      playerStrategy: 'html5',
      viewportWidth: 0,
      viewportHeight: 0,
      devicePixelRatio: 1,
      aspectRatio: 16 / 9,
    };
  }

  const userAgent = window.navigator.userAgent;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const devicePixelRatio = window.devicePixelRatio || 1;
  const runtime = getRuntime(userAgent);
  const formFactor = getFormFactor({
    runtime,
    userAgent,
    viewportWidth,
    viewportHeight,
  });

  return {
    runtime,
    formFactor,
    inputMode: getInputMode(formFactor),
    playerStrategy: getPlayerStrategy(runtime),
    viewportWidth,
    viewportHeight,
    devicePixelRatio,
    aspectRatio: viewportHeight > 0 ? viewportWidth / viewportHeight : 16 / 9,
  };
}
