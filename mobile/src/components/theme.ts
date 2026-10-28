import { Platform } from 'react-native';
export const palette = {
  paper: '#080C11',
  surface: '#111920',
  raised: '#17232B',
  ink: '#F1F5F2',
  muted: '#9AACB5',
  dim: '#78909B',
  accent: '#C3F773',
  accentInk: '#14210E',
  cyan: '#65D6D0',
  line: '#26353D',
  danger: '#FF9C9C',
};
export const fonts = {
  regular: 'SpaceGrotesk_400Regular',
  medium: 'SpaceGrotesk_500Medium',
  semibold: 'SpaceGrotesk_600SemiBold',
  bold: 'SpaceGrotesk_700Bold',
  mono: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
};
