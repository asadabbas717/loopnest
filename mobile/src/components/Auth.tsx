import { useState } from 'react';
import { Text } from 'react-native';
import { backend } from '../lib/client';
import { credentials } from '../domain/validation';
import { Button, Field, Heading, Notice, Page, styles, useAction } from './ui';

export function Auth() {
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verification, setVerification] = useState(false);
  const [code, setCode] = useState('');
  const { busy, error, run } = useAction();
  return (
    <Page>
      <Heading
        title="A little closer."
        subtitle="Welcome to Loopnest. Conversations start with an invitation."
      />
      <Text style={[styles.copy, { marginBottom: 24 }]}>
        Messages are private to accepted participants. This version is not end-to-end encrypted.
      </Text>
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        editable={!busy && !verification}
      />
      {verification ? (
        <>
          <Text style={[styles.copy, { marginBottom: 16 }]}>
            Enter the verification code from your email.
          </Text>
          <Field
            label="Verification code"
            value={code}
            onChangeText={setCode}
            autoComplete="one-time-code"
            keyboardType="number-pad"
            editable={!busy}
          />
          <Button
            title="Verify email"
            disabled={busy}
            onPress={() =>
              run(async () => {
                const { error: issue } = await backend().auth.verifyOtp({
                  email: email.trim(),
                  token: code.trim(),
                  type: 'signup',
                });
                if (issue) throw issue;
                setCode('');
              })
            }
          />
        </>
      ) : (
        <>
          <Field
            label={register ? 'Password · at least 12 characters' : 'Password'}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete={register ? 'new-password' : 'current-password'}
            editable={!busy}
          />
          <Button
            title={busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}
            disabled={busy}
            onPress={() =>
              run(async () => {
                const input = credentials(email, password, register);
                const { error: issue } = register
                  ? await backend().auth.signUp(input)
                  : await backend().auth.signInWithPassword(input);
                if (issue) throw issue;
                setPassword('');
                if (register) setVerification(true);
              })
            }
          />
        </>
      )}
      <Notice text={error} />
      <Button
        title={
          verification
            ? 'Back to sign in'
            : register
              ? 'Already have an account?'
              : 'Create an account'
        }
        disabled={busy}
        secondary
        onPress={() => {
          setRegister(!register && !verification);
          setVerification(false);
          setPassword('');
          setCode('');
        }}
      />
    </Page>
  );
}
