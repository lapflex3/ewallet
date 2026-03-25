import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nasadef.ewallet.cryptoai',
  appName: 'EwalletCryptoAI',
  webDir: 'mobile-webapp',
  server: {
    androidScheme: 'https'
  }
};

export default config;
