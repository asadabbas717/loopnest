import { useState, type ComponentProps, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { fonts, palette } from './theme';
import { Image } from 'expo-image';
import { backendUrl, publicKey } from '../lib/client';
import { useSession } from '../providers/Session';

export type IconName = ComponentProps<typeof Feather>['name'];
export function Icon({
  name,
  size = 20,
  color = palette.muted,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return <Feather name={name} size={size} color={color} accessible={false} />;
}
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <Image
      source={require('../../assets/brand/mark.png')}
      style={{ width: size, height: size }}
      contentFit="contain"
      accessible={false}
    />
  );
}
export function Avatar({
  name,
  size = 48,
  self = false,
  userId,
  photoId,
}: {
  name: string;
  size?: number;
  self?: boolean;
  userId?: string;
  photoId?: string | null;
}) {
  const letters = [...name.trim()][0]?.toUpperCase() ?? '?';
  const { session } = useSession();
  const [failed, setFailed] = useState('');
  const path = userId && photoId ? `${userId}/${photoId}.jpg` : '';
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.35,
        backgroundColor: self ? '#263A20' : '#173039',
        borderWidth: 1,
        borderColor: self ? '#425B31' : '#2A4D55',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <Text
        style={{
          color: self ? palette.accent : palette.cyan,
          fontFamily: fonts.semibold,
          fontSize: size * 0.34,
        }}
      >
        {letters || '?'}
      </Text>
      {!!path && session && failed !== path && (
        <Image
          source={{
            uri: `${backendUrl}/storage/v1/object/authenticated/profile-photos/${path}`,
            headers: { Authorization: `Bearer ${session.access_token}`, apikey: publicKey },
          }}
          style={StyleSheet.absoluteFill}
          cachePolicy="none"
          recyclingKey={path}
          contentFit="cover"
          accessibilityLabel={`${name}'s profile photo`}
          onError={() => setFailed(path)}
        />
      )}
    </View>
  );
}
export function Reveal({ children, delay = 0 }: PropsWithChildren<{ delay?: number }>) {
  return (
    <Animated.View
      entering={FadeInDown.duration(330)
        .delay(Math.min(delay, 200))
        .reduceMotion(ReduceMotion.System)}
    >
      {children}
    </Animated.View>
  );
}
export function Badge({
  text,
  icon = 'shield',
  accent = false,
}: {
  text: string;
  icon?: IconName;
  accent?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        alignSelf: 'flex-start',
        backgroundColor: accent ? '#22321A' : '#14212A',
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: 9,
        borderWidth: 1,
        borderColor: accent ? '#3F562B' : palette.line,
      }}
    >
      <Icon name={icon} size={12} color={accent ? palette.accent : palette.muted} />
      <Text
        style={{
          fontFamily: fonts.mono,
          color: accent ? palette.accent : palette.muted,
          fontSize: 10,
          letterSpacing: 1,
        }}
      >
        {text}
      </Text>
    </View>
  );
}
export function IconButton({
  icon,
  label,
  onPress,
  disabled = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 46,
        height: 46,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: palette.line,
        backgroundColor: pressed ? palette.raised : palette.surface,
        opacity: disabled ? 0.45 : 1,
      })}
    >
      <Icon name={icon} color={palette.ink} />
    </Pressable>
  );
}
export const visual = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  eyebrow: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 2,
    color: palette.dim,
    lineHeight: 18,
  },
  small: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 19, color: palette.muted },
  section: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 2, color: palette.muted },
});
