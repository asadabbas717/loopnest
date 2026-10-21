import { useState } from 'react';
import { Text } from 'react-native';
import { saveProfile } from '../lib/api';
import { backend } from '../lib/client';
import { useSession } from '../providers/Session';
import { Button, Field, Heading, Notice, Page, styles, useAction } from './ui';
export function Onboarding() {
  const { session, refresh } = useSession();
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const { busy, error, run } = useAction();
  return (
    <Page>
      <Heading
        title="Make yourself at home."
        subtitle="Choose a name and a username you can share with people you know."
      />
      <Field
        label="Display name"
        value={name}
        onChangeText={setName}
        maxLength={60}
        editable={!busy}
      />
      <Field
        label="Username · 3–24 letters, numbers or underscores"
        value={handle}
        onChangeText={setHandle}
        autoCapitalize="none"
        maxLength={24}
        editable={!busy}
      />
      <Text style={[styles.copy, { marginBottom: 20 }]}>
        Usernames are permanent in this version. There is no public directory. Someone who knows
        your username can invite you.
      </Text>
      <Notice text={error} />
      <Button
        title="Save profile"
        disabled={busy}
        onPress={() =>
          run(async () => {
            if (!session) return;
            await saveProfile(session.user.id, handle, name);
            refresh();
          })
        }
      />
      <Button
        secondary
        title="Sign out"
        disabled={busy}
        onPress={() =>
          run(async () => {
            const { error: issue } = await backend().auth.signOut();
            if (issue) throw issue;
          })
        }
      />
    </Page>
  );
}
