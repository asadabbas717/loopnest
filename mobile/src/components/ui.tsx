import {
  useCallback,
  useContext,
  createContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Keyboard,
  Platform,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewRef,
} from 'react-native-keyboard-controller';
import { userErrorMessage } from '../domain/user-errors';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, usePathname, useRouter } from 'expo-router';
import { ScrollMemory } from '../providers/ScrollMemory';
import { createScrollIntent } from '../domain/scroll-intent';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { fonts, palette } from './theme';
import { Icon, IconButton, Logo, Reveal, type IconName } from './visuals';
export { palette } from './theme';
const FocusedFieldScroll = createContext<(() => void) | null>(null);

export function Page({
  children,
  dock,
  scrollReady = true,
  startAtEnd = false,
  bottomRevision = 0,
}: PropsWithChildren<{
  dock?: 'chats' | 'friends' | 'account';
  scrollReady?: boolean;
  startAtEnd?: boolean;
  bottomRevision?: number;
}>) {
  const router = useRouter();
  const activePath = usePathname();
  // usePathname changes even in screens underneath the current stack route.
  // Bind the bookmark to this Page rather than the page pushed above it.
  const [path] = useState(activePath);
  const memory = useContext(ScrollMemory);
  const scroll = useRef<KeyboardAwareScrollViewRef>(null);
  const [scrolling] = useState(() =>
    createScrollIntent({
      startAtEnd,
      scrollTo: () => undefined,
      save: (position) => memory?.set(path, position),
    }),
  );
  useLayoutEffect(() => {
    scrolling.setScrollTo((y) => scroll.current?.scrollTo({ y, animated: false }));
  }, [scrolling]);
  const measureFrame = useRef<number | null>(null);
  const measure = useCallback(() => {
    if (measureFrame.current !== null) return;
    measureFrame.current = requestAnimationFrame(() => {
      measureFrame.current = null;
      const ticket = scrolling.ticket();
      scroll.current
        ?.getInnerViewRef()
        ?.measure((_x, _y, _width, height) => scrolling.layout(height, ticket));
    });
  }, [scrolling]);
  useFocusEffect(
    useCallback(() => {
      scrolling.focus(memory?.get(path));
      measure();
      return () => scrolling.blur();
    }, [scrolling, memory, path, measure]),
  );
  useLayoutEffect(() => {
    scrolling.ready(scrollReady);
    if (scrollReady) measure();
  }, [scrollReady, scrolling, measure]);
  useLayoutEffect(() => {
    if (bottomRevision > 0) {
      scrolling.jumpToEnd();
      measure();
    }
  }, [bottomRevision, scrolling, measure]);
  useEffect(
    () => () => {
      if (measureFrame.current !== null) cancelAnimationFrame(measureFrame.current);
    },
    [],
  );
  const assureField = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrolling.isFocused()) scroll.current?.assureFocusedInputVisible();
    });
  }, [scrolling]);
  const [keyboard, setKeyboard] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        scrolling.keyboard(true);
        setKeyboard(true);
      },
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      scrolling.keyboard(false);
      setKeyboard(false);
      measure();
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [scrolling, measure]);
  return (
    <FocusedFieldScroll.Provider value={assureField}>
      <SafeAreaView style={styles.page} edges={['top', 'bottom', 'left', 'right']}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <LinearGradient
            colors={['#102123', '#080C11', '#0C1119']}
            locations={[0, 0.48, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={{
              position: 'absolute',
              top: 65,
              right: -125,
              width: 290,
              height: 290,
              borderRadius: 145,
              borderWidth: 1,
              borderColor: '#1D363A',
              opacity: 0.65,
            }}
          />
          <View
            style={{
              position: 'absolute',
              top: 100,
              right: -90,
              width: 220,
              height: 220,
              borderRadius: 110,
              borderWidth: 1,
              borderColor: '#1D363A',
              opacity: 0.5,
            }}
          />
        </View>
        <View style={styles.brandRow}>
          {path !== '/' ? (
            <IconButton
              icon="arrow-left"
              label="Go back"
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            />
          ) : (
            <Logo />
          )}
          <Text
            style={{
              fontFamily: fonts.semibold,
              color: palette.ink,
              fontSize: 23,
              letterSpacing: -1,
              flex: 1,
            }}
          >
            loopnest<Text style={{ color: palette.accent }}>.</Text>
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="lock" size={11} color={palette.accent} />
            <Text
              style={{
                color: palette.muted,
                fontFamily: fonts.mono,
                fontSize: 9,
                letterSpacing: 1,
              }}
            >
              INVITE ONLY
            </Text>
          </View>
        </View>
        <KeyboardAwareScrollView
          ref={scroll}
          onLayout={(event) => {
            scrolling.viewport(event.nativeEvent.layout.height);
            measure();
          }}
          onContentSizeChange={measure}
          onScroll={(event) => scrolling.observe(event.nativeEvent.contentOffset.y)}
          onScrollBeginDrag={() => scrolling.beginGesture()}
          onScrollEndDrag={(event) => {
            scrolling.observe(event.nativeEvent.contentOffset.y);
            scrolling.endGesture();
          }}
          onMomentumScrollBegin={() => scrolling.beginGesture()}
          onMomentumScrollEnd={(event) => {
            scrolling.observe(event.nativeEvent.contentOffset.y);
            scrolling.endGesture();
          }}
          maintainVisibleContentPosition={
            startAtEnd && scrollReady ? { minIndexForVisible: 0 } : undefined
          }
          mode={Platform.OS === 'ios' ? 'layout' : 'insets'}
          automaticallyAdjustContentInsets={false}
          automaticallyAdjustKeyboardInsets={false}
          contentInsetAdjustmentBehavior="never"
          disableScrollOnKeyboardHide={Platform.OS === 'ios'}
          scrollEventThrottle={32}
          style={{ flex: 1 }}
          contentContainerStyle={[styles.body, dock && { paddingBottom: 115 }]}
          bottomOffset={24}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {children}
        </KeyboardAwareScrollView>
        {dock && !keyboard && (
          <View style={styles.dock}>
            {(
              [
                { key: 'chats', icon: 'message-circle', label: 'Chats', href: '/' },
                { key: 'friends', icon: 'users', label: 'Friends', href: '/friends' },
                { key: 'account', icon: 'sliders', label: 'You', href: '/account' },
              ] as const
            ).map((item) => (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                accessibilityState={{ selected: dock === item.key }}
                onPress={() => {
                  if (dock !== item.key) router.replace(item.href);
                }}
                style={({ pressed }) => ({
                  flex: 1,
                  minHeight: 52,
                  borderRadius: 17,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  backgroundColor: dock === item.key ? '#26381E' : 'transparent',
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Icon
                  name={item.icon}
                  size={20}
                  color={dock === item.key ? palette.accent : palette.muted}
                />
                <Text
                  style={{
                    fontFamily: fonts.medium,
                    color: dock === item.key ? palette.accent : palette.muted,
                    fontSize: 11,
                  }}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </SafeAreaView>
    </FocusedFieldScroll.Provider>
  );
}
export function Heading({
  title,
  subtitle,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
}) {
  return (
    <Reveal>
      <View style={{ gap: 10, marginBottom: 28, marginTop: 8 }}>
        {eyebrow && (
          <Text
            style={{
              fontFamily: fonts.mono,
              fontSize: 10,
              color: palette.accent,
              letterSpacing: 2,
            }}
          >
            {eyebrow}
          </Text>
        )}
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {subtitle && <Text style={styles.copy}>{subtitle}</Text>}
      </View>
    </Reveal>
  );
}
export function Button({
  title,
  onPress,
  disabled = false,
  secondary = false,
  icon,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  icon?: IconName;
}) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Animated.View style={animated}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        onPress={onPress}
        disabled={disabled}
        onPressIn={() => {
          scale.set(withTiming(0.975, { duration: 100, reduceMotion: ReduceMotion.System }));
        }}
        onPressOut={() => {
          scale.set(withTiming(1, { duration: 150, reduceMotion: ReduceMotion.System }));
        }}
        style={({ pressed }) => [
          styles.button,
          secondary && {
            backgroundColor: palette.surface,
            borderWidth: 1,
            borderColor: palette.line,
          },
          (disabled || pressed) && { opacity: 0.6 },
        ]}
      >
        {icon && <Icon name={icon} size={18} color={secondary ? palette.ink : palette.accentInk} />}
        <Text
          style={{
            fontSize: 15,
            fontFamily: fonts.semibold,
            color: secondary ? palette.ink : palette.accentInk,
            flexShrink: 1,
            textAlign: 'center',
          }}
        >
          {title}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
export function Field({
  label,
  secureTextEntry = false,
  ...props
}: TextInputProps & { label: string }) {
  const assureVisible = useContext(FocusedFieldScroll);
  const [revealed, setRevealed] = useState(false);
  const [focused, setFocused] = useState(false);
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
      <View
        style={
          secureTextEntry
            ? [styles.passwordRow, focused && { borderColor: palette.accent }]
            : undefined
        }
      >
        <TextInput
          {...props}
          secureTextEntry={secureTextEntry && !revealed}
          autoCorrect={secureTextEntry ? false : props.autoCorrect}
          spellCheck={secureTextEntry ? false : props.spellCheck}
          onBlur={(event) => {
            setFocused(false);
            setRevealed(false);
            props.onBlur?.(event);
          }}
          onFocus={(event) => {
            setFocused(true);
            props.onFocus?.(event);
            assureVisible?.();
          }}
          selectionColor={palette.accent}
          keyboardAppearance="dark"
          accessibilityLabel={label}
          placeholderTextColor={palette.muted}
          style={[
            styles.input,
            focused && !secureTextEntry && { borderColor: palette.accent },
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
            <Icon name={revealed ? 'eye-off' : 'eye'} color={palette.muted} size={19} />
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
      setError(userErrorMessage(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return { busy, error, run, clearError: () => setError('') };
}
export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.paper },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 24,
  },
  dock: {
    position: 'absolute',
    bottom: 18,
    left: 22,
    right: 22,
    flexDirection: 'row',
    gap: 6,
    padding: 7,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#34443F',
    backgroundColor: '#101B1C',
    boxShadow: '0 12px 28px rgba(0,0,0,.35)',
  },
  body: {
    paddingHorizontal: 24,
    paddingTop: 6,
    paddingBottom: 48,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  title: {
    fontSize: 36,
    fontFamily: fonts.bold,
    color: palette.ink,
    letterSpacing: -1.5,
    lineHeight: 43,
  },
  copy: { fontSize: 15, fontFamily: fonts.regular, lineHeight: 24, color: palette.muted },
  label: { fontFamily: fonts.medium, color: palette.ink, fontSize: 13, letterSpacing: 0.2 },
  input: {
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    padding: 17,
    borderRadius: 17,
    minHeight: 56,
    color: palette.ink,
    fontSize: 16,
    fontFamily: fonts.regular,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    borderRadius: 17,
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
    minHeight: 55,
    padding: 16,
    borderRadius: 17,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.accent,
    marginBottom: 12,
  },
  notice: {
    color: palette.danger,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 21,
    marginBottom: 16,
    padding: 14,
    backgroundColor: '#291C21',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#4C2E38',
  },
  card: {
    padding: 18,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    borderRadius: 22,
    marginBottom: 14,
    gap: 12,
  },
});
