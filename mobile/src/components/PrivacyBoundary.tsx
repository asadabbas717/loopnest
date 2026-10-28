import { useEffect, useState, type PropsWithChildren } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  allowScreenCaptureAsync,
  disableAppSwitcherProtectionAsync,
  enableAppSwitcherProtectionAsync,
  preventScreenCaptureAsync,
} from 'expo-screen-capture';
import { createScreenProtection } from '../domain/screen-protection';

const protectionKey = 'loopnest-private';
// Keep a single lease manager through Fast Refresh as well as normal mounts.
const runtime = globalThis as typeof globalThis & {
  __loopnestScreenProtection?: ReturnType<typeof createScreenProtection>;
};
const protection = (runtime.__loopnestScreenProtection ??= createScreenProtection({
  prevent: () => preventScreenCaptureAsync(protectionKey),
  allow: () => allowScreenCaptureAsync(protectionKey),
  enableOverlay: async () => {
    if (Platform.OS === 'ios') await enableAppSwitcherProtectionAsync(1);
  },
  disableOverlay: async () => {
    if (Platform.OS === 'ios') await disableAppSwitcherProtectionAsync();
  },
}));
export function PrivacyBoundary({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [revision, setRevision] = useState(0);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) =>
      setForeground(state === 'active'),
    );
    return () => listener.remove();
  }, []);
  useEffect(() => {
    let active = true;
    const lease = protection.acquire();
    lease.ready
      .then(() => {
        if (active) setStatus('ready');
      })
      .catch(() => {
        // Never mount private screens when native protection cannot be enabled.
        if (active) setStatus('failed');
      });
    return () => {
      active = false;
      void lease.release().catch(() => {});
    };
  }, [revision]);
  if (status !== 'ready')
    return (
      <View style={privacy.center}>
        <Text style={privacy.title}>Loopnest</Text>
        <Text style={privacy.copy}>
          {status === 'loading'
            ? 'Preparing privacy protection…'
            : 'Screen privacy protection could not be enabled. Private screens are hidden.'}
        </Text>
        {status === 'failed' && (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setStatus('loading');
              setRevision((value) => value + 1);
            }}
            style={privacy.retry}
          >
            <Text style={privacy.copy}>Retry privacy protection</Text>
          </Pressable>
        )}
      </View>
    );
  return (
    <View style={{ flex: 1 }}>
      <View
        style={{ flex: 1 }}
        accessibilityElementsHidden={!foreground}
        importantForAccessibility={foreground ? 'auto' : 'no-hide-descendants'}
      >
        {children}
      </View>
      {!foreground && (
        <View style={[StyleSheet.absoluteFill, privacy.center]}>
          <Text style={privacy.title}>Loopnest</Text>
          <Text style={privacy.copy}>Private content hidden</Text>
        </View>
      )}
    </View>
  );
}
const privacy = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 16,
    backgroundColor: '#080C11',
  },
  title: { fontSize: 28, fontWeight: '700', color: '#C3F773' },
  copy: { fontSize: 16, lineHeight: 24, textAlign: 'center', color: '#F1F5F2' },
  retry: {
    minHeight: 52,
    justifyContent: 'center',
    padding: 16,
    borderWidth: 1,
    borderColor: '#C3F773',
    borderRadius: 12,
  },
});
