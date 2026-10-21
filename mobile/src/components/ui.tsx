import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import {
  ActivityIndicator,
  AppState,
  Keyboard,
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
const FocusedField = createContext<(input: TextInput | null) => void>(() => {});
export function Page({ children }: PropsWithChildren) {
  const root = useRef<View>(null);
  const scroll = useRef<ScrollView>(null);
  const focused = useRef<TextInput | null>(null);
  const [top, setTop] = useState(0);
  const revealField = useCallback(() => {
    if (focused.current?.isFocused() && Keyboard.isVisible()) {
      scroll.current?.scrollResponderScrollNativeHandleToKeyboard(focused.current, 24, true);
    }
  }, []);
  const focusField = useCallback(
    (input: TextInput | null) => {
      focused.current = input;
      revealField();
    },
    [revealField],
  );
  useEffect(() => {
    let frame: number | undefined;
    const subscription = Keyboard.addListener('keyboardDidShow', () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(revealField);
    });
    return () => {
      subscription.remove();
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [revealField]);
  return (
    <SafeAreaView style={styles.page} edges={['bottom', 'left', 'right']}>
      <View
        ref={root}
        style={{ flex: 1 }}
        onLayout={() => {
          root.current?.measureInWindow((_x, y) => setTop(y));
        }}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={top}
        >
          <ScrollView
            ref={scroll}
            style={{ flex: 1 }}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onLayout={revealField}
            onContentSizeChange={revealField}
          >
            <FocusedField.Provider value={focusField}>{children}</FocusedField.Provider>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
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
export function Field({
  label,
  secureTextEntry = false,
  ...props
}: TextInputProps & { label: string }) {
  const input = useRef<TextInput>(null);
  const focusField = useContext(FocusedField);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!secureTextEntry) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') setRevealed(false);
    });
    return () => subscription.remove();
  }, [secureTextEntry]);
  return (
    <View style={{ gap: 8, marginBottom: 18 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={secureTextEntry ? styles.passwordRow : undefined}>
        <TextInput
          {...props}
          ref={input}
          secureTextEntry={secureTextEntry && !revealed}
          autoCorrect={secureTextEntry ? false : props.autoCorrect}
          spellCheck={secureTextEntry ? false : props.spellCheck}
          onFocus={(event) => {
            focusField(input.current);
            props.onFocus?.(event);
          }}
          onBlur={(event) => {
            setRevealed(false);
            focusField(null);
            props.onBlur?.(event);
          }}
          accessibilityLabel={label}
          placeholderTextColor={palette.muted}
          style={[
            styles.input,
            secureTextEntry && styles.passwordInput,
            props.multiline && { minHeight: 90, textAlignVertical: 'top' },
            props.style,
          ]}
        />
        {secureTextEntry && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            accessibilityState={{ disabled: props.editable === false }}
            disabled={props.editable === false}
            onPress={() => setRevealed((value) => !value)}
            style={({ pressed }) => [
              styles.passwordToggle,
              (pressed || props.editable === false) && { opacity: 0.6 },
            ]}
          >
            <Text style={styles.passwordToggleText}>{revealed ? 'Hide' : 'Show'}</Text>
          </Pressable>
        )}
      </View>
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
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: 'white',
    borderRadius: 14,
  },
  passwordInput: { flex: 1, minWidth: 0, borderWidth: 0, backgroundColor: 'transparent' },
  passwordToggle: {
    minWidth: 64,
    minHeight: 52,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  passwordToggleText: { color: palette.accent, fontWeight: '600', fontSize: 15 },
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
