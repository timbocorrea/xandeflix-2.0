import { useEffect, useState } from 'react';

type DeviceType = 'mobile' | 'tablet' | 'desktop' | 'tv';

interface DeviceTypeResult {
  deviceType: DeviceType;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isTv: boolean;
}

function detectDeviceType(): DeviceType {
  if (typeof window === 'undefined') {
    return 'desktop';
  }

  const userAgent = window.navigator.userAgent.toLowerCase();
  const width = window.innerWidth;

  const isTvUserAgent =
    userAgent.includes('smart-tv') ||
    userAgent.includes('smarttv') ||
    userAgent.includes('tizen') ||
    userAgent.includes('webos') ||
    userAgent.includes('netcast') ||
    userAgent.includes('appletv') ||
    userAgent.includes('android tv') ||
    userAgent.includes('aft');

  if (isTvUserAgent || width >= 1280) {
    return 'tv';
  }

  if (width < 768) {
    return 'mobile';
  }

  if (width < 1024) {
    return 'tablet';
  }

  return 'desktop';
}

export function useDeviceType(): DeviceTypeResult {
  const [deviceType, setDeviceType] = useState<DeviceType>(() =>
    detectDeviceType(),
  );

  useEffect(() => {
    function handleResize() {
      setDeviceType(detectDeviceType());
    }

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  return {
    deviceType,
    isMobile: deviceType === 'mobile',
    isTablet: deviceType === 'tablet',
    isDesktop: deviceType === 'desktop',
    isTv: deviceType === 'tv',
  };
}