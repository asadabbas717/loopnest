import { createClient, processLock } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { randomUUID } from 'expo-crypto';
import { Platform } from 'react-native';
import { createSessionStorage } from '../domain/secure-storage';
import { backendConfiguration } from '../domain/backend-config';

export const backendUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const publicKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
export const configured =
  Platform.OS !== 'web' &&
  !!backendConfiguration({
    url: backendUrl,
    key: publicKey,
    development: __DEV__,
    allowLocal: process.env.EXPO_PUBLIC_USE_LOCAL_BACKEND === 'true',
  });
const storage = createSessionStorage(
  {
    getItem: (key) => SecureStore.getItemAsync(key),
    setItem: (key, value) =>
      SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      }),
    removeItem: (key) => SecureStore.deleteItemAsync(key),
  },
  randomUUID,
);
export const client = configured
  ? createClient(backendUrl, publicKey, {
      auth: {
        storage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        lock: processLock,
      },
    })
  : null;
export function backend() {
  if (!client) throw new Error('Configure the backend before signing in.');
  return client;
}
