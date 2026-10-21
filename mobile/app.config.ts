import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Loopnest',
  slug: 'loopnest',
  scheme: 'loopnest',
  version: '0.1.0',
  orientation: 'portrait',
  platforms: ['android', 'ios'],
  ios: { bundleIdentifier: 'app.loopnest.mobile', supportsTablet: false },
  android: {
    package: 'app.loopnest.mobile',
    blockedPermissions: ['android.permission.RECORD_AUDIO', 'android.permission.CAMERA'],
  },
  plugins: ['expo-router'],
};
export default config;
