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

function normalizeDeviceText(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(' ').toLowerCase();
}

function getRuntime(deviceText: string): DeviceRuntime {
  if (deviceText.includes('tizen')) {
    return 'tizen';
  }

  if (
    deviceText.includes('web0s') ||
    deviceText.includes('webos') ||
    deviceText.includes('lg browser')
  ) {
    return 'webos';
  }

  if (deviceText.includes('android')) {
    return 'capacitor-android';
  }

  return 'web';
}

function getFormFactor(params: {
  runtime: DeviceRuntime;
  deviceText: string;
  viewportWidth: number;
  viewportHeight: number;
}): DeviceFormFactor {
  const { runtime, deviceText, viewportWidth, viewportHeight } = params;
  const shortestSide = Math.min(viewportWidth, viewportHeight);
  const aspectRatio = viewportHeight > 0 ? viewportWidth / viewportHeight : 16 / 9;

  if (
    deviceText.includes('aft') ||
    deviceText.includes('aftsss') ||
    deviceText.includes('sheldon') ||
    deviceText.includes('fire tv') ||
    deviceText.includes('firetv') ||
    deviceText.includes('android tv') ||
    deviceText.includes('smart-tv') ||
    deviceText.includes('smarttv') ||
    runtime === 'tizen' ||
    runtime === 'webos'
  ) {
    return 'tv';
  }

  if (
    runtime === 'capacitor-android' &&
    viewportWidth >= 900 &&
    viewportHeight >= 500 &&
    aspectRatio >= 1.7 &&
    shortestSide <= 720
  ) {
    return 'tv';
  }

  if (deviceText.includes('mobile') && shortestSide < 768) {
    return 'mobile';
  }

  if (shortestSide >= 768 && runtime === 'capacitor-android') {
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

  const deviceText = normalizeDeviceText(
    window.navigator.userAgent,
    window.navigator.platform,
    window.navigator.vendor,
  );
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const devicePixelRatio = window.devicePixelRatio || 1;
  const runtime = getRuntime(deviceText);
  const formFactor = getFormFactor({
    runtime,
    deviceText,
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
