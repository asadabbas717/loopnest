import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Loopnest',
  slug: 'loopnest',
  scheme: 'loopnest',
  version: '0.1.0',
  orientation: 'portrait',
  platforms: ['android', 'ios'],
  ios: {
    bundleIdentifier: 'app.loopnest.mobile',
    supportsTablet: false,
    infoPlist: { NSAppTransportSecurity: { NSAllowsLocalNetworking: true } },
  },
  android: {
    package: 'app.loopnest.mobile',
    softwareKeyboardLayoutMode: 'resize',
    blockedPermissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.CAMERA',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
    ],
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-image',
    [
      'expo-image-picker',
      {
        photosPermission: 'Choose a photo to share in an accepted conversation.',
        cameraPermission: false,
        microphonePermission: false,
      },
    ],
  ],
};
export default config;
