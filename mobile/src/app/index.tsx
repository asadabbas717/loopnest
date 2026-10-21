import { useCallback, useState } from 'react';
import { Text } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { configured, backend } from '../lib/client';
import { conversations, invite, type Conversation } from '../lib/api';
import { useSession } from '../providers/Session';
import { userErrorMessage } from '../domain/user-errors';
import { Auth } from '../components/Auth';
import { Onboarding } from '../components/Onboarding';
import { Button, Field, Heading, Loading, Notice, Page, styles, useAction } from '../components/ui';

export default function Home() {
  const { session, profile, loading, failed, refresh, accountState } = useSession();
  const [items, setItems] = useState<Conversation[]>([]);
  const [listError, setListError] = useState('');
  const [handle, setHandle] = useState('');
  const { busy, error, run } = useAction();
  const userId = session?.user.id;
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
  }, [userId, profileId]);
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
    }, [userId, profileId]),
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
    <Page>
      <Heading
        title={`Hello, ${profile.display_name}.`}
        subtitle={`@${profile.username} · Your conversations, by invitation.`}
      />
      <Button title="Account and privacy" secondary onPress={() => router.push('/account')} />
      <Button title="Friends" secondary onPress={() => router.push('/friends')} />
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
        disabled={busy}
        onPress={() =>
          run(async () => {
            const id = await invite(handle);
            setHandle('');
            router.push({ pathname: '/chat/[id]', params: { id } });
          })
        }
      />
      <Notice text={error || listError} />
      <Button secondary title="Refresh conversations" disabled={busy} onPress={() => run(reload)} />
      {!items.length && (
        <Text style={[styles.copy, { marginVertical: 20 }]}>
          No conversations yet. Share your username with someone you trust.
        </Text>
      )}
      {items.map((item) => (
        <Button
          key={item.id}
          secondary
          title={`${item.status === 'pending' ? (item.recipient === userId ? 'Incoming invitation' : 'Invitation sent') : 'Conversation'} · ${new Date(item.created_at).toLocaleDateString()}`}
          onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.id } })}
        />
      ))}
      <Button
        secondary
        title="Sign out"
        disabled={busy}
        onPress={() =>
          run(async () => {
            const { error: issue } = await backend().auth.signOut();
            if (issue) throw issue;
            setItems([]);
          })
        }
      />
    </Page>
  );
}
