import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dynorun.app',
  appName: 'dynorun',
  webDir: 'dist',
  server: {
    // Android's webview defaults to the origin http://localhost, which the API
    // then has to accept as a CORS origin with credentials: true. Anything else
    // able to serve from http://localhost on a user's machine could then make
    // credentialed calls to production and read the replies. https://localhost
    // is not reachable that way. Safe to change only while the apps are
    // unpublished: the origin owns the webview's storage, so switching it wipes
    // localStorage for any existing install.
    androidScheme: 'https',
  },
};

export default config;
