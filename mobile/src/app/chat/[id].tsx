import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { randomUUID } from 'expo-crypto';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { backend } from '../../lib/client';
import {
  blockUser,
  conversation,
  messages,
  peerProfile,
  respond,
  send,
  type Conversation,
  type Message,
} from '../../lib/api';
import { choosePhoto, discardPhoto, uploadPhoto, type Photo } from '../../lib/photos';
import { useSession } from '../../providers/Session';
import { PrivatePhoto } from '../../components/PrivatePhoto';
import {
  Button,
  Field,
  Heading,
  Loading,
  Notice,
  Page,
  styles,
  useAction,
} from '../../components/ui';

export default function Chat() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const { session, profile } = useSession();
  const [chat, setChat] = useState<Conversation | null>(null);
  const [name, setName] = useState('Conversation');
  const [rows, setRows] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<Photo | null>(null);
  const photoRef = useRef<Photo | null>(null);
  const attempt = useRef<{ id: string; text: string; photoId?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const { busy, error, run } = useAction();
  const actor = session?.user.id;
  const validProfile = profile?.id === actor;
  const reload = useCallback(async () => {
    const current = await conversation(id);
    setChat(current);
    if (!current || current.status !== 'accepted') {
      setRows([]);
      return;
    }
    setRows(await messages(id));
  }, [id]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      setForeground(state === 'active');
      if (state !== 'active') {
        setRows([]);
        setText('');
        discardPhoto(photoRef.current);
        photoRef.current = null;
        setPhoto(null);
      }
    });
    return () => listener.remove();
  }, []);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!actor || !validProfile) {
        router.replace('/');
        return;
      }
      setLoading(true);
      setLoadError('');
      conversation(id)
        .then(async (current) => {
          if (!active) return;
          setChat(current);
          if (!current) {
            setRows([]);
            return;
          }
          const other = current.initiator === actor ? current.recipient : current.initiator;
          const peer = await peerProfile(other);
          if (active) setName(peer?.display_name ?? 'Conversation');
          if (current.status === 'accepted') {
            const history = await messages(id);
            if (active) setRows(history);
          }
        })
        .catch(() => {
          if (active) {
            setRows([]);
            setChat(null);
            setLoadError('Could not load this conversation.');
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
        setRows([]);
        setChat(null);
        setText('');
        discardPhoto(photoRef.current);
        photoRef.current = null;
        setPhoto(null);
        attempt.current = null;
      };
    }, [id, actor, validProfile]),
  );
  useEffect(() => {
    if (chat?.status !== 'accepted' || !actor || !foreground) return;
    let active = true;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        messages(id)
          .then((next) => {
            if (active) setRows(next);
          })
          .catch(() => {
            if (active) {
              setRows([]);
              setLoadError('Connection lost. Refresh to reconnect.');
            }
          });
      }, 300);
    };
    const channel = backend()
      .channel(`conversation-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${id}`,
        },
        refresh,
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') refresh();
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          if (active) setLoadError('Live updates disconnected. Refresh to reconnect.');
        }
      });
    return () => {
      active = false;
      if (refreshTimer) clearTimeout(refreshTimer);
      void backend().removeChannel(channel);
    };
  }, [id, actor, chat?.status, foreground]);
  if (!session || !validProfile)
    return (
      <Page>
        <Loading />
      </Page>
    );
  if (!foreground)
    return (
      <Page>
        <Heading title="Conversation hidden" />
      </Page>
    );
  if (loading)
    return (
      <Page>
        <Loading />
      </Page>
    );
  return (
    <Page>
      <Heading title={name} subtitle="Invitation-only · Not end-to-end encrypted" />
      <Notice text={loadError || error} />
      <Button
        secondary
        title="Refresh"
        disabled={busy}
        onPress={() =>
          run(async () => {
            await reload();
            setLoadError('');
          })
        }
      />
      {!chat && <Text style={styles.copy}>This conversation is unavailable.</Text>}
      {chat?.status === 'pending' && (
        <View style={styles.card}>
          <Text style={styles.copy}>
            {chat.recipient === actor
              ? 'Accept this invitation to exchange messages and photos.'
              : 'Waiting for the other person to accept. Messages and photos are disabled until then.'}
          </Text>
          {chat.recipient === actor && (
            <>
              <Button
                title="Accept invitation"
                disabled={busy}
                onPress={() =>
                  run(async () => {
                    await respond(id, true);
                    await reload();
                  })
                }
              />
              <Button
                title="Decline"
                secondary
                disabled={busy}
                onPress={() =>
                  run(async () => {
                    await respond(id, false);
                    router.replace('/');
                  })
                }
              />
            </>
          )}
        </View>
      )}
      {chat?.status === 'accepted' && (
        <>
          {!!rows.length && (
            <Button
              title="Load earlier messages"
              secondary
              disabled={busy}
              onPress={() =>
                run(async () => {
                  const oldest = rows[rows.length - 1];
                  if (oldest) {
                    const older = await messages(id, oldest.created_at);
                    setRows((current) => [
                      ...current,
                      ...older.filter(
                        (item) => !current.some((existing) => existing.id === item.id),
                      ),
                    ]);
                  }
                })
              }
            />
          )}
          {rows
            .slice()
            .reverse()
            .map((message) => (
              <View
                key={message.id}
                style={[styles.card, message.sender_id === actor && { backgroundColor: '#E5EEE3' }]}
              >
                <Text style={styles.label}>{message.sender_id === actor ? 'You' : name}</Text>
                {!!message.body && (
                  <Text selectable style={styles.copy}>
                    {message.body}
                  </Text>
                )}
                {message.photo_id && <PrivatePhoto id={message.photo_id} />}
                <Text style={{ color: '#536D67', fontSize: 12 }}>
                  {new Date(message.created_at).toLocaleString()}
                </Text>
              </View>
            ))}
          {!rows.length && (
            <Text style={[styles.copy, { marginBottom: 20 }]}>
              Say hello. This is the beginning of your conversation.
            </Text>
          )}
          <Field
            label="Message"
            multiline
            value={text}
            onChangeText={(value) => {
              setText(value);
              attempt.current = null;
            }}
            maxLength={4000}
            editable={!busy}
          />
          {photo && (
            <View style={styles.card}>
              <Image
                source={{ uri: photo.uri }}
                cachePolicy="none"
                accessibilityLabel="Selected photo"
                style={{ width: '100%', height: 200 }}
              />
              <Button
                title="Remove photo"
                secondary
                disabled={busy}
                onPress={() => {
                  discardPhoto(photo);
                  photoRef.current = null;
                  setPhoto(null);
                  attempt.current = null;
                }}
              />
            </View>
          )}
          <Button
            title="Choose photo"
            secondary
            disabled={busy}
            onPress={() =>
              run(async () => {
                const selected = await choosePhoto();
                if (selected) {
                  discardPhoto(photoRef.current);
                  photoRef.current = selected;
                  setPhoto(selected);
                  attempt.current = null;
                }
              })
            }
          />
          <Text style={[styles.copy, { marginBottom: 16 }]}>
            Photos are resized before upload. Only share content you have permission to share;
            recipients can save a copy.
          </Text>
          <Button
            title={busy ? 'Sending…' : 'Send message'}
            disabled={busy}
            onPress={() =>
              run(async () => {
                if (!attempt.current) attempt.current = { id: randomUUID(), text };
                if (photo && !attempt.current.photoId)
                  attempt.current.photoId = await uploadPhoto(id, photo);
                await send(id, attempt.current.id, attempt.current.text, attempt.current.photoId);
                attempt.current = null;
                setText('');
                discardPhoto(photoRef.current);
                photoRef.current = null;
                setPhoto(null);
                await reload();
              })
            }
          />
        </>
      )}
      {chat && (
        <Button
          title="Block this person"
          secondary
          disabled={busy}
          onPress={() =>
            Alert.alert(
              'Block this person?',
              'Both people will lose access to this conversation in the app. Copies already saved cannot be removed.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Block',
                  style: 'destructive',
                  onPress: () =>
                    run(async () => {
                      await blockUser(
                        actor!,
                        chat.initiator === actor ? chat.recipient : chat.initiator,
                      );
                      setRows([]);
                      setChat(null);
                      router.replace('/');
                    }),
                },
              ],
            )
          }
        />
      )}
    </Page>
  );
}
