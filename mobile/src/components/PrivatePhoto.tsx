import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { Image } from 'expo-image';
import { backendUrl, publicKey } from '../lib/client';
import { photoPath } from '../lib/photos';
import { useSession } from '../providers/Session';
import { styles } from './ui';
import { userErrorMessage } from '../domain/user-errors';

export function PrivatePhoto({ id }: { id: string }) {
  const { session } = useSession();
  const [result, setResult] = useState<{ id: string; path: string | null } | null>(null);
  const [failure, setFailure] = useState('');
  useEffect(() => {
    let active = true;
    photoPath(id)
      .then((value) => {
        if (active) {
          setResult({ id, path: value });
          setFailure('');
        }
      })
      .catch((issue) => {
        if (active) setFailure(userErrorMessage(issue));
      });
    return () => {
      active = false;
    };
  }, [id]);
  const path = result?.id === id ? result.path : null;
  if (failure) return <Text style={styles.copy}>{failure}</Text>;
  if (!session) return <Text style={styles.copy}>Sign in to view this photo.</Text>;
  if (result?.id !== id) return <Text style={styles.copy}>Loading photo…</Text>;
  if (!path)
    return <Text style={styles.copy}>This photo is unavailable or no longer shared with you.</Text>;
  return (
    <Image
      accessibilityLabel="Photo shared in this conversation"
      accessible
      source={{
        uri: `${backendUrl}/storage/v1/object/authenticated/chat-photos/${path}`,
        headers: { Authorization: `Bearer ${session.access_token}`, apikey: publicKey },
      }}
      cachePolicy="none"
      recyclingKey={id}
      contentFit="contain"
      onError={() =>
        setFailure('This photo could not be loaded. Refresh the conversation to try again.')
      }
      style={{ width: '100%', height: 240, borderRadius: 12 }}
    />
  );
}
