import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { backend } from '../lib/client';
import { useSession } from '../providers/Session';
import { Button, styles } from './ui';
import { Icon, visual } from './visuals';
import { palette } from './theme';

export function OneTimeCard({ id, sender }: { id: string | null; sender: string }) {
  const router = useRouter();
  const { session } = useSession();
  const [opened, setOpened] = useState(!id);
  const [checked, setChecked] = useState(!id);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let active = true;
    if (id)
      backend()
        .from('photo_assets')
        .select('opened_at')
        .eq('id', id)
        .maybeSingle()
        .then(
          (result) => {
            if (active) {
              setUnavailable(!!result.error || !result.data);
              setOpened(!!result.data?.opened_at);
              setChecked(true);
            }
          },
          () => {
            if (active) {
              setUnavailable(true);
              setChecked(true);
            }
          },
        );
    return () => {
      active = false;
    };
  }, [id]);
  const own = session?.user.id === sender;
  return (
    <View style={{ gap: 12, paddingVertical: 8, width: '100%' }}>
      <View style={visual.row}>
        <View
          style={{
            width: 43,
            height: 43,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: palette.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name={opened ? 'check' : 'eye'} color={palette.accent} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.label}>
            {unavailable
              ? 'One-time photo unavailable'
              : opened
                ? 'One-time photo opened'
                : 'A moment. Just once.'}
          </Text>
          <Text style={visual.small}>
            {unavailable
              ? 'Refresh the conversation to check access.'
              : own
                ? 'Only the recipient can open this photo.'
                : 'One opening. No replay.'}
          </Text>
        </View>
      </View>
      {!own && checked && !opened && !unavailable && id && (
        <Button
          title="Open once"
          icon="eye"
          onPress={() => router.push({ pathname: '/photo/[id]', params: { id } })}
        />
      )}
    </View>
  );
}
