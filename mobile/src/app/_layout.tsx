import { Stack } from 'expo-router';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from '../providers/Session';
import { PrivacyBoundary } from '../components/PrivacyBoundary';
import { useFonts } from 'expo-font';
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';
import { palette } from '../components/theme';
function Navigator() {
  const { session } = useSession();
  const reduced = useReducedMotion();
  return (
    <Stack
      key={session?.user.id ?? 'signed-out'}
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: palette.paper },
        animation: reduced ? 'none' : 'slide_from_right',
        animationDuration: 240,
      }}
    />
  );
}
function Fonts({ retry }: { retry: () => void }) {
  const [ready, error] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });
  if (!ready)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: palette.paper,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 20,
        }}
      >
        <Text style={{ color: palette.accent, fontSize: 28, fontWeight: '700' }}>loopnest.</Text>
        {error ? (
          <Pressable accessibilityRole="button" onPress={retry} style={{ padding: 20 }}>
            <Text style={{ color: palette.ink }}>Try opening again</Text>
          </Pressable>
        ) : (
          <ActivityIndicator color={palette.accent} />
        )}
      </View>
    );
  return (
    <SessionProvider>
      <Navigator />
    </SessionProvider>
  );
}
export default function Layout() {
  const [fontRevision, setFontRevision] = useState(0);
  return (
    <SafeAreaProvider>
      <PrivacyBoundary>
        <StatusBar style="light" />
        <KeyboardProvider preload={false}>
          <Fonts key={fontRevision} retry={() => setFontRevision((value) => value + 1)} />
        </KeyboardProvider>
      </PrivacyBoundary>
    </SafeAreaProvider>
  );
}
