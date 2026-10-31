import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Loopnest',
  slug: 'loopnest',
  owner: 'asadabbasbusiness',
  extra: { eas: { projectId: '43623fa3-850e-4e8a-9413-92a6088354d2' } },
  scheme: 'loopnest',
  version: '0.1.2',
  icon: './assets/brand/icon.png',
  userInterfaceStyle: 'dark',
  backgroundColor: '#080C11',
  orientation: 'portrait',
  platforms: ['android', 'ios'],
  ios: {
    bundleIdentifier: 'app.loopnest.mobile',
    supportsTablet: false,
    infoPlist: { NSAppTransportSecurity: { NSAllowsLocalNetworking: true } },
  },
  android: {
    versionCode: 3,
    package: 'app.loopnest.mobile',
    softwareKeyboardLayoutMode: 'resize',
    adaptiveIcon: {
      foregroundImage: './assets/brand/adaptive-foreground.png',
      monochromeImage: './assets/brand/adaptive-monochrome.png',
      backgroundColor: '#080C11',
    },
    blockedPermissions: [
      // DETECT_SCREEN_CAPTURE is deliberately retained: SDK 58 registers its
      // activity callback at module creation on Android 14+. FLAG_SECURE still
      // prevents capture; this normal permission grants no screenshot pixels.
      'android.permission.RECORD_AUDIO',
      'android.permission.CAMERA',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.WRITE_EXTERNAL_STORAGE',
    ],
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-system-ui',
    'expo-secure-store',
    'expo-image',
    [
      'expo-splash-screen',
      { image: './assets/brand/mark.png', imageWidth: 180, backgroundColor: '#080C11' },
    ],
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
