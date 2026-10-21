import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider } from '../providers/Session';
export default function Layout() {
  return (
    <SafeAreaProvider>
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
    </SafeAreaProvider>
  );
}
