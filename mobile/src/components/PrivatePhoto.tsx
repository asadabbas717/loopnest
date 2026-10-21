import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { Image } from 'expo-image';
import { backendUrl, publicKey } from '../lib/client';
import { photoPath } from '../lib/photos';
import { useSession } from '../providers/Session';
import { styles } from './ui';

export function PrivatePhoto({ id }: { id: string }) {
  const { session } = useSession();
  const [result, setResult] = useState<{ id: string; path: string | null } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    photoPath(id)
      .then((value) => {
        if (active) {
          setResult({ id, path: value });
          setFailed(false);
        }
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [id]);
  const path = result?.id === id ? result.path : null;
  if (!path || !session || failed) return <Text style={styles.copy}>Photo unavailable</Text>;
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
      onError={() => setFailed(true)}
      style={{ width: '100%', height: 240, borderRadius: 12 }}
    />
  );
}
