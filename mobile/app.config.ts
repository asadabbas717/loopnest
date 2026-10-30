import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Loopnest',
  slug: 'loopnest',
  scheme: 'loopnest',
  version: '0.1.0',
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
    package: 'app.loopnest.mobile',
    softwareKeyboardLayoutMode: 'resize',
    adaptiveIcon: {
      foregroundImage: './assets/brand/adaptive-foreground.png',
      monochromeImage: './assets/brand/adaptive-monochrome.png',
      backgroundColor: '#080C11',
    },
    blockedPermissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.CAMERA',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.DETECT_SCREEN_CAPTURE',
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
