import { Capacitor } from '@capacitor/core';

import { openNativeAndroidPlayer } from './nativeAndroidPlayerBridge';
import type {
  UniversalPlayerAdapter,
  UniversalPlayerSource,
} from '../types/player';
import type { StreamKind } from '../types/stream';

type NativeAndroidPlayableKind = Extract<StreamKind, 'mpegts' | 'mp4'>;

export function isNativeAndroidPlayerAvailable(kind: StreamKind | undefined) {
  return (
    (kind === 'mpegts' || kind === 'mp4') &&
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === 'android'
  );
}

export function createNativeAndroidPlayerAdapter(
  kind: StreamKind,
): UniversalPlayerAdapter {
  if (kind !== 'mpegts' && kind !== 'mp4') {
    throw new Error(`Tipo de stream não suportado pelo player nativo Android: ${kind}`);
  }

  const nativeKind: NativeAndroidPlayableKind = kind;
  let currentSource: UniversalPlayerSource | null = null;

  return {
    kind: nativeKind,

    async load(source: UniversalPlayerSource) {
      if (!source.url.trim()) {
        throw new Error('URL do stream não informada para player nativo Android.');
      }

      currentSource = source;
    },

    async play() {
      if (!currentSource) {
        throw new Error('Fonte não carregada para player nativo Android.');
      }

      console.info('[XANDEFLIX_NATIVE_ANDROID_ADAPTER_OPEN_REQUEST]', {
        kind: nativeKind,
        title: currentSource.title ?? 'Xandeflix Player',
        hasUrl: Boolean(currentSource.url),
      });

      await openNativeAndroidPlayer({
        url: currentSource.url,
        title: currentSource.title ?? 'Xandeflix Player',
        kind: nativeKind,
      });

      console.info('[XANDEFLIX_NATIVE_ANDROID_ADAPTER_OPEN_SUCCESS]', {
        kind: nativeKind,
      });
    },

    async pause() {
      // O ciclo de pausa é controlado pela Activity nativa.
    },

    destroy() {
      currentSource = null;
    },
  };
}
