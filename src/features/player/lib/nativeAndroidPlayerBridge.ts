import { registerPlugin } from '@capacitor/core';

type NativeAndroidPlayerOpenOptions = {
  url: string;
  title?: string;
  kind?: string;
};

type NativeAndroidPlayerOpenResult = {
  opened: boolean;
};

type NativeAndroidPlayerPlugin = {
  open: (
    options: NativeAndroidPlayerOpenOptions,
  ) => Promise<NativeAndroidPlayerOpenResult>;
};

const NativeAndroidPlayer = registerPlugin<NativeAndroidPlayerPlugin>(
  'NativeAndroidPlayer',
);

export async function openNativeAndroidPlayer(
  options: NativeAndroidPlayerOpenOptions,
) {
  return NativeAndroidPlayer.open(options);
}
