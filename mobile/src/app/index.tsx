import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { configured, backend } from '../lib/client';
import { conversations, invite, type ConversationSummary } from '../lib/api';
import { useSession } from '../providers/Session';
import { userErrorMessage } from '../domain/user-errors';
import { Auth } from '../components/Auth';
import { Onboarding } from '../components/Onboarding';
import { Button, Field, Heading, Loading, Notice, Page, styles, useAction } from '../components/ui';
import { Avatar, Badge, Icon, IconButton, Reveal, visual } from '../components/visuals';
import { fonts, palette } from '../components/theme';

export default function Home() {
  const router = useRouter();
  const { session, profile, loading, failed, refresh, accountState } = useSession();
  const [listed, setListed] = useState<{ actor: string; rows: ConversationSummary[] } | null>(null);
  const [inviting, setInviting] = useState(false);
  const [listError, setListError] = useState('');
  const [handle, setHandle] = useState('');
  const { busy, error, run } = useAction();
  const userId = session?.user.id;
  const items = listed && listed.actor === userId ? listed.rows : [];
  const setItems = useCallback(
    (rows: ConversationSummary[]) => setListed(userId ? { actor: userId, rows } : null),
    [userId],
  );
  const profileId = profile?.id;
  const reload = useCallback(async () => {
    if (!userId || !profileId) return;
    try {
      setItems(await conversations());
      setListError('');
    } catch (issue) {
      setItems([]);
      setListError(userErrorMessage(issue));
    }
  }, [userId, profileId, setItems]);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (userId && profileId)
        conversations()
          .then((rows) => {
            if (active) {
              setItems(rows);
              setListError('');
            }
          })
          .catch((issue) => {
            if (active) {
              setItems([]);
              setListError(userErrorMessage(issue));
            }
          });
      else setItems([]);
      return () => {
        active = false;
        setItems([]);
      };
    }, [userId, profileId, setItems]),
  );
  if (!configured)
    return (
      <Page>
        <Heading title="Loopnest" subtitle="Your private space starts here." />
        <Text style={styles.copy}>
          Backend setup is required. Copy mobile/.env.example to mobile/.env, configure a Supabase
          Free project, and apply the database migration. No demo accounts or data are loaded.
        </Text>
      </Page>
    );
  if (loading)
    return (
      <Page>
        <Loading />
      </Page>
    );
  if (failed)
    return (
      <Page>
        <Notice text="Your session or profile could not be loaded." />
        <Button title="Try again" onPress={refresh} />
        <Button
          secondary
          title="Clear this session"
          onPress={() =>
            run(async () => {
              await backend().auth.signOut({ scope: 'local' });
            })
          }
        />
        <Notice text={error} />
      </Page>
    );
  if (!session) return <Auth />;
  if (accountState === 'suspended')
    return (
      <Page>
        <Heading
          title="Account suspended"
          subtitle="Messaging and photo access are disabled. Contact the project maintainer privately to request a review."
        />
        <Button title="Account and privacy" onPress={() => router.push('/account')} />
      </Page>
    );
  if (accountState === 'erasing')
    return (
      <Page>
        <Heading
          title="Account deletion pending"
          subtitle="Your conversations and uploads are frozen while deletion finishes."
        />
        <Button title="Retry account deletion" onPress={() => router.push('/account')} />
      </Page>
    );
  if (!profile) return <Onboarding />;
  return (
    <Page dock="chats">
      <View style={[visual.between, { marginBottom: 24 }]}>
        <View style={visual.row}>
          <Avatar name={profile.display_name} size={42} self />
          <View>
            <Text style={visual.eyebrow}>YOUR SPACE</Text>
            <Text style={{ color: palette.ink, fontFamily: fonts.medium, fontSize: 15 }}>
              {profile.display_name}
            </Text>
          </View>
        </View>
        <IconButton
          icon="plus"
          label={inviting ? 'Close invitation form' : 'Invite someone'}
          onPress={() => setInviting((value) => !value)}
        />
      </View>
      <Heading
        title={'Your inner\ncircle.'}
        subtitle="Good conversations start with people you choose."
      />
      <View
        style={[
          styles.card,
          { backgroundColor: '#13251F', borderColor: '#304735', padding: 17, marginBottom: 28 },
        ]}
      >
        <View style={visual.between}>
          <View style={visual.row}>
            <Icon name="shield" color={palette.accent} size={18} />
            <Text style={{ fontFamily: fonts.medium, color: palette.ink, fontSize: 13 }}>
              A little space. Just for you.
            </Text>
          </View>
          <Icon name="arrow-up-right" size={15} color={palette.accent} />
        </View>
        <Text style={visual.small}>Invitation-only chats. No ads. No analytics.</Text>
      </View>
      {inviting && (
        <Reveal>
          <View style={styles.card}>
            <Text style={[styles.label, { fontSize: 18 }]}>Bring someone closer</Text>
            <Text style={visual.small}>
              Your username is @{profile.username}. Invite a friend by their exact username.
            </Text>
            <Field
              label="Invite someone by username"
              value={handle}
              onChangeText={setHandle}
              autoCapitalize="none"
              maxLength={24}
              editable={!busy}
            />
            <Button
              title="Send invitation"
              icon="arrow-up-right"
              disabled={busy}
              onPress={() =>
                run(async () => {
                  const id = await invite(handle);
                  setHandle('');
                  router.push({ pathname: '/chat/[id]', params: { id } });
                })
              }
            />
          </View>
        </Reveal>
      )}
      <Notice text={error || listError} />
      <View style={[visual.between, { marginBottom: 18 }]}>
        <View style={visual.row}>
          <Text style={visual.section}>CONVERSATIONS</Text>
          <Text style={{ fontFamily: fonts.mono, fontSize: 10, color: palette.accent }}>
            {items.length}
          </Text>
        </View>
        <IconButton
          icon="refresh-cw"
          label="Refresh conversations"
          disabled={busy}
          onPress={() => run(reload)}
        />
      </View>
      {!items.length && (
        <View style={[styles.card, { alignItems: 'center', paddingVertical: 36 }]}>
          <Icon name="message-circle" color={palette.cyan} size={36} />
          <Text style={[styles.label, { fontSize: 20, marginTop: 8 }]}>
            Your next good conversation
          </Text>
          <Text style={[styles.copy, { textAlign: 'center' }]}>
            Share @{profile.username} with someone you trust, or send your first invitation.
          </Text>
          <Button title="Invite a friend" icon="plus" onPress={() => setInviting(true)} />
        </View>
      )}
      {items.map((item, index) => (
        <Reveal key={item.id} delay={index * 35}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open conversation with ${item.peer_display_name}`}
            onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.id } })}
            style={({ pressed }) => [
              styles.card,
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                padding: 17,
                opacity: pressed ? 0.65 : 1,
              },
            ]}
          >
            <Avatar name={item.peer_display_name} />
            <View style={{ flex: 1, gap: 5 }}>
              <Text
                numberOfLines={1}
                style={{ color: palette.ink, fontFamily: fonts.semibold, fontSize: 17 }}
              >
                {item.peer_display_name}
              </Text>
              <Text style={visual.small}>
                {item.status === 'pending'
                  ? item.recipient === userId
                    ? 'Invitation waiting for you'
                    : 'Invitation sent'
                  : item.peer_username
                    ? `@${item.peer_username}`
                    : 'Open conversation'}
              </Text>
            </View>
            {item.retention_seconds ? (
              <Icon name="clock" size={15} color={palette.accent} />
            ) : (
              <Icon name="chevron-right" size={18} />
            )}
          </Pressable>
        </Reveal>
      ))}
      <View style={{ marginTop: 12, alignItems: 'center' }}>
        <Badge text="YOUR PEOPLE. YOUR PACE." icon="heart" />
      </View>
    </Page>
  );
}
