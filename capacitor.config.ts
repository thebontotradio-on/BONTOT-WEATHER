import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.thebontotradio.weather',
  appName: 'BONTOT WEATHER',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
