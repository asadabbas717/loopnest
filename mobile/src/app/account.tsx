import { useCallback, useState } from 'react';
import { Alert, Text } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSession } from '../providers/Session';
import { backend } from '../lib/client';
import { deleteAccount } from '../lib/api';
import { createModerationApi } from '../lib/moderation-api';
import { Button, Field, Heading, Loading, Notice, Page, styles, useAction } from '../components/ui';

export default function Account() {
  const { session, loading, refresh, accountState } = useSession();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [moderator, setModerator] = useState(false);
  const { busy, error, run } = useAction();
  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!loading && !session) router.replace('/');
      if (session)
        createModerationApi(backend)
          .isModerator()
          .then((value) => {
            if (active) setModerator(value);
          })
          .catch(() => {
            if (active) setModerator(false);
          });
      return () => {
        active = false;
        setPassword('');
        setConfirmation('');
      };
    }, [loading, session]),
  );
  if (loading || !session)
    return (
      <Page>
        <Loading />
      </Page>
    );
  return (
    <Page>
      <Heading title="Account and privacy" subtitle={session.user.email} />
      {moderator && (
        <Button
          title="Review reported messages"
          secondary
          onPress={() => router.push('/moderation')}
        />
      )}
      <Text style={[styles.copy, { marginBottom: 20 }]}>
        Chats are access-controlled, not end-to-end encrypted. Recipients can save copies. No
        advertising or analytics SDKs are included.
      </Text>
      <Heading
        title="Delete your account"
        subtitle={
          accountState === 'erasing'
            ? 'Deletion is pending. You can retry safely.'
            : 'This action is permanent.'
        }
      />
      <Text style={[styles.copy, { marginBottom: 20 }]}>
        Deletion removes your profile and all your conversations from both participants’ accounts,
        including photos shared by either person in those conversations. Saved copies and backup
        retention are outside this operation. You must verify your current password.
      </Text>
      <Field
        label="Current password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        editable={!busy}
      />
      <Field
        label="Type DELETE to confirm"
        value={confirmation}
        onChangeText={setConfirmation}
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!busy}
      />
      <Notice text={error} />
      <Button
        title={busy ? 'Deleting…' : 'Delete account permanently'}
        disabled={busy || !password || confirmation !== 'DELETE'}
        onPress={() =>
          Alert.alert(
            'Delete your account permanently?',
            'Your conversations and their shared photos will be erased for both participants.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete permanently',
                style: 'destructive',
                onPress: () =>
                  run(async () => {
                    try {
                      await deleteAccount(password, confirmation);
                      setPassword('');
                      setConfirmation('');
                      const { error: issue } = await backend().auth.signOut({ scope: 'local' });
                      if (issue) throw issue;
                      router.replace('/');
                    } finally {
                      refresh();
                    }
                  }),
              },
            ],
          )
        }
      />
      <Button
        title="Sign out"
        secondary
        disabled={busy}
        onPress={() =>
          run(async () => {
            const { error: issue } = await backend().auth.signOut();
            if (issue) throw issue;
            router.replace('/');
          })
        }
      />
    </Page>
  );
}
