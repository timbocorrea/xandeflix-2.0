import { useEffect, useMemo, useState } from 'react';

import { ENABLE_SPATIAL_DEBUG } from '../lib/spatial/spatialDebug';

import { getDeviceProfile, type DeviceProfile } from './deviceProfile';

function logDeviceProfile(profile: DeviceProfile) {
  if (!ENABLE_SPATIAL_DEBUG || typeof window === 'undefined') {
    return;
  }

  window.requestAnimationFrame(() => {
    const root = document.getElementById('root');
    const app = document.querySelector('.xf-app');

    console.info('[XANDEFLIX:DEVICE_PROFILE]', {
      profile,
      visualViewport: window.visualViewport
        ? {
            width: window.visualViewport.width,
            height: window.visualViewport.height,
            scale: window.visualViewport.scale,
          }
        : null,
      documentElement: {
        clientWidth: document.documentElement.clientWidth,
        clientHeight: document.documentElement.clientHeight,
      },
      body: {
        clientWidth: document.body.clientWidth,
        clientHeight: document.body.clientHeight,
      },
      rootRect: root?.getBoundingClientRect().toJSON(),
      appRect: app?.getBoundingClientRect().toJSON(),
      userAgent: window.navigator.userAgent,
    });
  });
}

export function useDeviceProfile(): DeviceProfile {
  const initialProfile = useMemo(() => getDeviceProfile(), []);
  const [profile, setProfile] = useState<DeviceProfile>(initialProfile);

  useEffect(() => {
    logDeviceProfile(profile);
  }, [profile]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    function handleResize() {
      setProfile(getDeviceProfile());
    }

    window.addEventListener('resize', handleResize);
    window.visualViewport?.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('resize', handleResize);
    };
  }, []);

  return profile;
}
