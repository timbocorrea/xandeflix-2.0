import { Capacitor } from '@capacitor/core';

import { openNativeAndroidPlayer } from './nativeAndroidPlayerBridge';
import type {
  UniversalPlayerAdapter,
  UniversalPlayerSource,
} from '../types/player';
import type { StreamKind } from '../types/stream';

export function isNativeAndroidPlayerAvailable(kind: StreamKind | undefined) {
  return (
    kind === 'mpegts' &&
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === 'android'
  );
}

export function createNativeAndroidPlayerAdapter(): UniversalPlayerAdapter {
  let currentSource: UniversalPlayerSource | null = null;

  return {
    kind: 'mpegts',

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

      await openNativeAndroidPlayer({
        url: currentSource.url,
        title: currentSource.title ?? 'Xandeflix Player',
        kind: 'mpegts',
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
