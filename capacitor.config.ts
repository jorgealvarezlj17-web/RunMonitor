import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.runmonitor.app',
  appName: 'Run Monitor',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
