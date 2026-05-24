import { useEffect } from 'react';

import { getOrCreateDeviceIdentifier } from '@/features/playlists/lib/deviceIdentifier';
import { getDeviceProfile } from '@/platform/deviceProfile';

import {
  heartbeatAppInstallation,
  registerAppInstallation,
} from '../services/appInstallation.service';

const APP_VERSION = '0.0.0';
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

let hasStartedAppInstallationHeartbeat = false;

function getAppInstallationPlatform() {
  const profile = getDeviceProfile();

  return {
    platform: `${profile.runtime}:${profile.formFactor}`,
    manufacturer: profile.runtime,
    model: profile.playerStrategy,
    appVersion: APP_VERSION,
  };
}

function shouldDisableHeartbeatOnThisDevice() {
  const profile = getDeviceProfile();

  return profile.formFactor === 'tv' || profile.playerStrategy === 'native-android';
}

export function useAppInstallationHeartbeat() {
  useEffect(() => {
    if (window.location.pathname.startsWith('/admin')) {
      return;
    }

    if (shouldDisableHeartbeatOnThisDevice()) {
      return;
    }

    if (hasStartedAppInstallationHeartbeat) {
      return;
    }

    hasStartedAppInstallationHeartbeat = true;

    let isMounted = true;
    const deviceIdentifier = getOrCreateDeviceIdentifier();
    const installationMetadata = getAppInstallationPlatform();

    async function registerInstallation() {
      try {
        await registerAppInstallation({
          deviceIdentifier,
          ...installationMetadata,
        });
      } catch (error) {
        console.warn('[XANDEFLIX:APP_INSTALLATION] register failed', error);
      }
    }

    async function sendHeartbeat() {
      try {
        await heartbeatAppInstallation({
          deviceIdentifier,
          appVersion: installationMetadata.appVersion,
        });
      } catch (error) {
        console.warn('[XANDEFLIX:APP_INSTALLATION] heartbeat failed', error);
      }
    }

    void registerInstallation();

    const intervalId = window.setInterval(() => {
      if (!isMounted) {
        return;
      }

      void sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);
}
