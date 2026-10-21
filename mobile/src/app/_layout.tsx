import { Stack } from 'expo-router';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider } from '../providers/Session';
import { PrivacyBoundary } from '../components/PrivacyBoundary';
export default function Layout() {
  return (
    <SafeAreaProvider>
      <PrivacyBoundary>
        <KeyboardProvider preload={false}>
          <SessionProvider>
            <Stack
              screenOptions={{
                headerTitle: 'Loopnest',
                headerStyle: { backgroundColor: '#F5F7F1' },
                headerShadowVisible: false,
                headerTintColor: '#162D2B',
              }}
            />
          </SessionProvider>
        </KeyboardProvider>
      </PrivacyBoundary>
    </SafeAreaProvider>
  );
}
