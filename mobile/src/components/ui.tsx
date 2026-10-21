import { useRef, useState, type PropsWithChildren } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const palette = {
  ink: '#162D2B',
  muted: '#536D67',
  paper: '#F5F7F1',
  accent: '#145E4B',
  line: '#D1DFD5',
  danger: '#A32938',
};
export function Page({ children }: PropsWithChildren) {
  return (
    <SafeAreaView style={styles.page} edges={['bottom', 'left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function Heading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ gap: 10, marginBottom: 24 }}>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {subtitle && <Text style={styles.copy}>{subtitle}</Text>}
    </View>
  );
}
export function Button({
  title,
  onPress,
  disabled = false,
  secondary = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        secondary && { backgroundColor: '#E3EDE3' },
        (disabled || pressed) && { opacity: 0.6 },
      ]}
    >
      <Text
        style={{ fontSize: 16, fontWeight: '600', color: secondary ? palette.accent : 'white' }}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 8, marginBottom: 18 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor={palette.muted}
        style={[
          styles.input,
          props.multiline && { minHeight: 90, textAlignVertical: 'top' },
          props.style,
        ]}
      />
    </View>
  );
}
export function Notice({ text }: { text: string }) {
  return text ? (
    <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.notice}>
      {text}
    </Text>
  ) : null;
}
export function Loading() {
  return (
    <View style={{ padding: 40 }}>
      <ActivityIndicator accessibilityLabel="Loading" color={palette.accent} size="large" />
    </View>
  );
}
export function useAction() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (work: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (e) {
      const code = e && typeof e === 'object' && 'code' in e ? e.code : '';
      const message = e && typeof e === 'object' && 'message' in e ? String(e.message) : '';
      if (code === '23505') setError('That username is already taken.');
      else if (code === 'invalid_credentials') setError('Email or password is incorrect.');
      else if (code === 'email_not_confirmed') setError('Verify your email first.');
      else if (/limit reached/i.test(message))
        setError('Your usage limit has been reached. Try again later.');
      else if (
        e instanceof Error &&
        /^(Use |Enter |Write |Choose |Your name |Messages can |This image |Photo size )/.test(
          message,
        )
      )
        setError(message);
      else setError('Could not complete this action. Check your connection and try again.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return { busy, error, run };
}
export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.paper },
  body: { padding: 24, paddingBottom: 48 },
  title: { fontSize: 32, fontWeight: '700', color: palette.ink, letterSpacing: -0.8 },
  copy: { fontSize: 16, lineHeight: 25, color: palette.muted },
  label: { fontWeight: '600', color: palette.ink, fontSize: 15 },
  input: {
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: 'white',
    padding: 14,
    borderRadius: 14,
    minHeight: 52,
    color: palette.ink,
    fontSize: 16,
  },
  button: {
    minHeight: 52,
    padding: 15,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.accent,
    marginBottom: 12,
  },
  notice: { color: palette.danger, lineHeight: 23, marginBottom: 16 },
  card: {
    padding: 18,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: 'white',
    borderRadius: 18,
    marginBottom: 14,
    gap: 12,
  },
});
