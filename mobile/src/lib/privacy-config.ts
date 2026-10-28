import { allowsTestCapture } from '../domain/capture-policy';

// Release builds ignore this flag, even if it accidentally enters their environment.
export const captureTesting = allowsTestCapture(
  __DEV__,
  process.env.EXPO_PUBLIC_ALLOW_TEST_SCREENSHOTS,
);
