import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

type NativeAndroidPlayerOpenOptions = {
  url: string;
  title?: string;
  kind?: string;
  startPositionMs?: number;
};

type NativeAndroidPlayerOpenResult = {
  opened: boolean;
};

type NativeAndroidInlinePreviewOptions = {
  url: string;
  title?: string;
  kind?: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type NativeAndroidInlinePreviewStartResult = {
  started: boolean;
};

type NativeAndroidInlinePreviewStopResult = {
  stopped: boolean;
};

type NativeAndroidPlayerResumeEvent = {
  source?: string;
  timestamp?: number;
  positionMs?: number;
  streamUrl?: string;
};

type NativeAndroidPlayerPlugin = {
  open: (
    options: NativeAndroidPlayerOpenOptions,
  ) => Promise<NativeAndroidPlayerOpenResult>;
  startPreview: (
    options: NativeAndroidInlinePreviewOptions,
  ) => Promise<NativeAndroidInlinePreviewStartResult>;
  stopPreview: () => Promise<NativeAndroidInlinePreviewStopResult>;
  addListener: (
    eventName: 'resume',
    listenerFunc: (event: NativeAndroidPlayerResumeEvent) => void,
  ) => Promise<PluginListenerHandle>;
};

const NativeAndroidPlayer = registerPlugin<NativeAndroidPlayerPlugin>(
  'NativeAndroidPlayer',
);

export async function openNativeAndroidPlayer(
  options: NativeAndroidPlayerOpenOptions,
) {
  return NativeAndroidPlayer.open(options);
}

export async function startNativeAndroidInlinePreview(
  options: NativeAndroidInlinePreviewOptions,
) {
  return NativeAndroidPlayer.startPreview(options);
}

export async function stopNativeAndroidInlinePreview() {
  return NativeAndroidPlayer.stopPreview();
}

export function addNativeAndroidPlayerResumeListener(
  listener: (event: NativeAndroidPlayerResumeEvent) => void,
) {
  return NativeAndroidPlayer.addListener('resume', listener);
}
