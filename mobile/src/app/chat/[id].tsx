import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { randomUUID } from 'expo-crypto';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { backend } from '../../lib/client';
import { captureTesting } from '../../lib/privacy-config';
import { messageChannel } from '../../lib/message-channel';
import { createRefreshQueue } from '../../lib/refresh-queue';
import {
  blockUser,
  conversation,
  messages,
  peerProfile,
  respond,
  send,
  setRetention,
  type Conversation,
  type Message,
} from '../../lib/api';
import { choosePhoto, discardPhoto, uploadPhoto, type Photo } from '../../lib/photos';
import { useSession } from '../../providers/Session';
import { PrivatePhoto } from '../../components/PrivatePhoto';
import { OneTimeCard } from '../../components/OneTimeCard';
import { RetentionSettings, retentionLabel } from '../../components/RetentionSettings';
import { Avatar, Badge, Icon, IconButton, visual } from '../../components/visuals';
import { fonts, palette } from '../../components/theme';
import { userErrorMessage } from '../../domain/user-errors';
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
  const [handle, setHandle] = useState('');
  const [tools, setTools] = useState(false);
  const [oneTime, setOneTime] = useState(false);
  const [rows, setRows] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<Photo | null>(null);
  const photoRef = useRef<Photo | null>(null);
  const refreshRef = useRef<(() => void) | null>(null);
  const attempt = useRef<{ id: string; text: string; photoId?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [connectionRevision, setConnectionRevision] = useState(0);
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
    refreshRef.current?.();
  }, [id]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      setForeground(state === 'active');
      if (state !== 'active') {
        setRows([]);
        setText('');
        attempt.current = null;
        discardPhoto(photoRef.current);
        photoRef.current = null;
        setPhoto(null);
        setOneTime(false);
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
          if (!current) {
            setChat(null);
            setRows([]);
            return;
          }
          const other = current.initiator === actor ? current.recipient : current.initiator;
          const peer = await peerProfile(other);
          if (active) setName(peer?.display_name ?? 'Conversation');
          if (active) setHandle(peer?.username ?? '');
          if (current.status === 'accepted') {
            const history = await messages(id);
            if (active) setRows(history);
          }
          if (active) setChat(current);
        })
        .catch((issue) => {
          if (active) {
            setRows([]);
            setChat(null);
            setLoadError(userErrorMessage(issue));
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
        setOneTime(false);
      };
    }, [id, actor, validProfile]),
  );
  useEffect(() => {
    if (!foreground) return;
    const deadlines = rows.flatMap((message) =>
      message.expires_monotonic === undefined ? [] : [message.expires_monotonic],
    );
    if (!deadlines.length) return;
    const next = Math.min(...deadlines);
    let timer: ReturnType<typeof setTimeout>;
    const expire = () => {
      if (performance.now() < next) {
        timer = setTimeout(expire, Math.min(60000, next - performance.now()));
        return;
      }
      setRows((current) =>
        current.filter(
          (message) =>
            message.expires_monotonic === undefined ||
            message.expires_monotonic > performance.now(),
        ),
      );
    };
    timer = setTimeout(expire, Math.max(0, Math.min(60000, next - performance.now())));
    return () => clearTimeout(timer);
  }, [foreground, rows]);
  useEffect(() => {
    if (chat?.status !== 'accepted' || !actor || !foreground) return;
    let active = true;
    const disconnected = 'Live updates disconnected. Tap Refresh to reconnect.';
    let connectionWarning = 'Connecting live updates…';
    const queue = createRefreshQueue({
      read: () => messages(id),
      onValue: (next) => {
        setRows(next);
        setLoadError(connectionWarning);
      },
      onError: (issue) => {
        setRows([]);
        setLoadError(userErrorMessage(issue));
      },
    });
    const channel = messageChannel(backend(), id, queue.request)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversations', filter: `id=eq.${id}` },
        () => {
          conversation(id)
            .then((current) => {
              if (active) setChat(current);
            })
            .catch((issue) => {
              if (active) setLoadError(userErrorMessage(issue));
            });
        },
      )
      .subscribe((status) => {
        if (!active) return;
        if (status === 'SUBSCRIBED') {
          connectionWarning = '';
          queue.request();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          connectionWarning = disconnected;
          setLoadError(disconnected);
        }
      });
    refreshRef.current = queue.request;
    queue.request();
    return () => {
      active = false;
      if (refreshRef.current === queue.request) refreshRef.current = null;
      queue.dispose();
      void backend().removeChannel(channel);
    };
  }, [id, actor, chat?.status, foreground, connectionRevision]);
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
      <View style={[visual.between, { marginBottom: 20 }]}>
        <View style={[visual.row, { flex: 1 }]}>
          <Avatar name={name} />
          <View style={{ flex: 1, gap: 5 }}>
            <Text
              numberOfLines={1}
              style={{ fontFamily: fonts.semibold, color: palette.ink, fontSize: 23 }}
            >
              {name}
            </Text>
            <Text style={visual.small}>
              {handle ? `@${handle}` : 'Invitation-only conversation'}
            </Text>
          </View>
        </View>
        <IconButton
          icon="more-horizontal"
          label="Conversation settings"
          onPress={() => setTools((value) => !value)}
        />
      </View>
      <View style={[visual.between, { marginBottom: 20 }]}>
        <Badge
          text={
            chat?.retention_seconds
              ? `DISAPPEARS · ${retentionLabel(chat.retention_seconds).toUpperCase()}`
              : captureTesting
                ? 'UI CAPTURE TESTING'
                : 'SCREEN PROTECTED'
          }
          icon={chat?.retention_seconds ? 'clock' : 'shield'}
          accent
        />
        <IconButton
          icon="refresh-cw"
          label="Refresh conversation"
          disabled={busy}
          onPress={() =>
            run(async () => {
              setConnectionRevision((revision) => revision + 1);
              await reload();
            })
          }
        />
      </View>
      <Text style={[visual.small, { marginBottom: 18 }]}>
        Access-controlled · Not end-to-end encrypted
      </Text>
      {tools && chat?.status === 'accepted' && (
        <RetentionSettings
          seconds={chat.retention_seconds}
          busy={busy}
          onSave={(seconds) =>
            run(async () => {
              await setRetention(id, seconds, actor!);
              await reload();
              setTools(false);
            })
          }
        />
      )}
      <Notice text={loadError || error} />
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
                    const older = await messages(id, oldest);
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
                style={[
                  styles.card,
                  {
                    maxWidth: '94%',
                    alignSelf: message.sender_id === actor ? 'flex-end' : 'flex-start',
                    minWidth: 150,
                    backgroundColor: message.sender_id === actor ? '#22311F' : '#14212A',
                    borderColor: message.sender_id === actor ? '#3A4C30' : '#283A47',
                    borderBottomRightRadius: message.sender_id === actor ? 5 : 20,
                    borderBottomLeftRadius: message.sender_id === actor ? 20 : 5,
                    padding: 16,
                    gap: 9,
                  },
                ]}
              >
                <View style={visual.between}>
                  <Text style={{ fontFamily: fonts.mono, color: palette.muted, fontSize: 10 }}>
                    {message.sender_id === actor ? 'YOU' : name.toUpperCase()}
                  </Text>
                  {message.sender_id !== actor && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Report message from ${name}`}
                      onPress={() =>
                        router.push({ pathname: '/report/[id]', params: { id: message.id } })
                      }
                      style={{
                        minWidth: 40,
                        minHeight: 36,
                        alignItems: 'flex-end',
                        justifyContent: 'center',
                      }}
                    >
                      <Icon name="flag" size={12} />
                    </Pressable>
                  )}
                </View>
                {!!message.body && (
                  <Text
                    selectable={!message.expires_at}
                    style={[styles.copy, { color: palette.ink, fontSize: 16 }]}
                  >
                    {message.body}
                  </Text>
                )}
                {message.view_once ? (
                  <OneTimeCard id={message.photo_id} sender={message.sender_id} />
                ) : (
                  message.photo_id && <PrivatePhoto id={message.photo_id} />
                )}
                <View style={visual.between}>
                  <Text style={{ color: palette.dim, fontFamily: fonts.mono, fontSize: 9 }}>
                    {new Date(message.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                  {message.expires_at && <Icon name="clock" size={12} color={palette.accent} />}
                </View>
              </View>
            ))}
          {!rows.length && (
            <Text style={[styles.copy, { marginBottom: 20 }]}>
              Say hello. This is the beginning of your conversation.
            </Text>
          )}
          <Field
            label="YOUR MESSAGE"
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
              <Pressable
                accessibilityRole="checkbox"
                accessibilityLabel="Send photo as one-time view"
                accessibilityState={{ checked: oneTime, disabled: busy }}
                disabled={busy}
                onPress={() => {
                  setOneTime((value) => !value);
                  attempt.current = null;
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  minHeight: 52,
                  padding: 12,
                  borderRadius: 14,
                  backgroundColor: oneTime ? '#2A4020' : palette.raised,
                }}
              >
                <Icon
                  name={oneTime ? 'check-circle' : 'circle'}
                  color={oneTime ? palette.accent : palette.muted}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>One-time view</Text>
                  <Text style={visual.small}>Recipient opens once. No ordinary download.</Text>
                </View>
                <Icon name="eye" color={palette.accent} />
              </Pressable>
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
          <Text style={[visual.small, { marginBottom: 16 }]}>
            Photos are resized and stripped of submitted metadata. Share only what you have
            permission to share.
          </Text>
          <Button
            title={busy ? 'Sending…' : 'Send message'}
            icon="send"
            disabled={busy}
            onPress={() =>
              run(async () => {
                if (!attempt.current) attempt.current = { id: randomUUID(), text };
                const submission = attempt.current;
                if (photo && !submission.photoId)
                  submission.photoId = await uploadPhoto(id, photo, actor!, oneTime);
                await send(id, submission.id, submission.text, actor!, submission.photoId);
                attempt.current = null;
                setText('');
                discardPhoto(photoRef.current);
                photoRef.current = null;
                setPhoto(null);
                setOneTime(false);
                await reload();
              })
            }
          />
        </>
      )}
      {chat && tools && (
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
