import { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'za.co.kotaconnect.app',
  appName: 'Kota Connect',
  webDir: 'www',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https'
  }
};
export default config;
