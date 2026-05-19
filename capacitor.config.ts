import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.xandeflix.app',
  appName: 'Xandeflix',
  webDir: 'dist',
  server: {
    url: 'http://127.0.0.1:5173',
    cleartext: true,
    androidScheme: 'http',
  },
  backgroundColor: '#050505',
  loggingBehavior: 'none',

  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    StatusBar: {
      backgroundColor: '#050505',
      style: 'DARK',
    },
  },
};

export default config;
