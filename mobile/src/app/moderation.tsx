import { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { backend } from '../lib/client';
import { createModerationApi, type ModerationItem } from '../lib/moderation-api';
import { PrivatePhoto } from '../components/PrivatePhoto';
import { userErrorMessage } from '../domain/user-errors';
import { Button, Heading, Notice, Page, styles, useAction } from '../components/ui';

export default function Moderation() {
  const [rows, setRows] = useState<ModerationItem[]>([]);
  const [loadError, setLoadError] = useState('');
  const { busy, error, run } = useAction();
  const reload = async () => setRows(await createModerationApi(backend).queue());
  useFocusEffect(
    useCallback(() => {
      let active = true;
      createModerationApi(backend)
        .queue()
        .then((data) => {
          if (active) setRows(data);
        })
        .catch((issue) => {
          if (active) setLoadError(userErrorMessage(issue));
        });
      return () => {
        active = false;
        setRows([]);
      };
    }, []),
  );
  return (
    <Page>
      <Heading
        title="Moderation queue"
        subtitle="Review only the reported message. Do not copy or share private content."
      />
      <Notice text={loadError || error} />
      <Button
        title="Refresh queue"
        secondary
        disabled={busy}
        onPress={() =>
          run(async () => {
            await reload();
            setLoadError('');
          })
        }
      />
      {!rows.length && !loadError && <Text style={styles.copy}>No open reports.</Text>}
      {rows.map((item) => (
        <View key={item.id} style={styles.card}>
          <Text style={styles.label}>{item.reason.replaceAll('_', ' ')}</Text>
          <Text selectable style={styles.copy}>
            {item.body}
          </Text>
          {item.photo_id && <PrivatePhoto id={item.photo_id} />}
          <Button
            title="Dismiss report"
            secondary
            disabled={busy}
            onPress={() =>
              run(async () => {
                await createModerationApi(backend).resolve(item.id, 'dismiss');
                await reload();
              })
            }
          />
          <Button
            title="Resolve without suspension"
            secondary
            disabled={busy}
            onPress={() =>
              run(async () => {
                await createModerationApi(backend).resolve(item.id, 'resolve');
                await reload();
              })
            }
          />
          <Button
            title="Suspend sender"
            disabled={busy}
            onPress={() =>
              Alert.alert(
                'Suspend this sender?',
                'This blocks their access to messages and uploads until the operator reviews the suspension.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Suspend',
                    style: 'destructive',
                    onPress: () =>
                      run(async () => {
                        await createModerationApi(backend).resolve(item.id, 'suspend');
                        await reload();
                      }),
                  },
                ],
              )
            }
          />
        </View>
      ))}
    </Page>
  );
}
