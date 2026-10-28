import { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSession } from '../providers/Session';
import { backend } from '../lib/client';
import { deleteAccount } from '../lib/api';
import { createModerationApi } from '../lib/moderation-api';
import { userErrorMessage, errorMessages } from '../domain/user-errors';
import { Button, Field, Heading, Loading, Notice, Page, styles, useAction } from '../components/ui';
import { Avatar, Badge, visual } from '../components/visuals';

export default function Account() {
  const { session, profile, loading, refresh, accountState } = useSession();
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [moderator, setModerator] = useState(false);
  const { busy, error, run, clearError } = useAction();
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
    <Page dock="account">
      <Heading
        eyebrow="MAKE YOURSELF AT HOME"
        title="Your space."
        subtitle="A few things that stay in your control."
      />
      <View style={[styles.card, visual.row]}>
        <Avatar name={profile?.display_name ?? 'You'} self size={56} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[styles.label, { fontSize: 21 }]}>
            {profile?.display_name ?? 'Your account'}
          </Text>
          <Text style={visual.small}>
            {profile?.username ? `@${profile.username}` : session.user.email}
          </Text>
        </View>
      </View>
      {accountState === 'active' && (
        <Button
          title="Friends and blocked users"
          icon="users"
          secondary
          onPress={() => router.push('/friends')}
        />
      )}
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
      <View style={[styles.card, { marginBottom: 24 }]}>
        <Badge text="SCREEN GUARD" icon="shield" accent />
        <Text style={styles.copy}>
          Screen-capture protection stays on across chats and one-time photos. Private screens are
          hidden when you leave the app.
        </Text>
        <Text style={visual.small}>
          Another camera or a compromised device can still capture content.
        </Text>
      </View>
      {!deleting && accountState !== 'erasing' && (
        <Button title="Delete account" icon="trash-2" secondary onPress={() => setDeleting(true)} />
      )}
      {(deleting || accountState === 'erasing') && (
        <>
          <Heading
            title="Delete your account"
            subtitle={
              accountState === 'erasing'
                ? 'Deletion is pending. You can retry safely.'
                : 'This action is permanent.'
            }
          />
          <Text style={[styles.copy, { marginBottom: 20 }]}>
            Deletion removes your profile and all your conversations from both participants’
            accounts, including photos shared by either person in those conversations. Saved copies
            and backup retention are outside this operation. You must verify your current password.
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
                        } catch (issue) {
                          // A rejected password changes no account state. Preserve
                          // the form instead of remounting it through profile refresh.
                          if (userErrorMessage(issue) !== errorMessages.wrong_password) refresh();
                          throw issue;
                        }
                        refresh();
                      }),
                  },
                ],
              )
            }
          />
          {accountState !== 'erasing' && (
            <Button
              title="Keep my account"
              secondary
              disabled={busy}
              onPress={() => {
                setDeleting(false);
                setPassword('');
                setConfirmation('');
                clearError();
              }}
            />
          )}
        </>
      )}
      <Button
        title="Sign out"
        icon="log-out"
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
