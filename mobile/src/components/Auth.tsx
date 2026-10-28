import { useState } from 'react';
import { Text, View } from 'react-native';
import { backend } from '../lib/client';
import { credentials } from '../domain/validation';
import { Recovery } from './Recovery';
import { Button, Field, Heading, Notice, Page, styles, useAction } from './ui';
import { Badge, Logo, visual } from './visuals';
import { palette } from './theme';

export function Auth() {
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verification, setVerification] = useState(false);
  const [code, setCode] = useState('');
  const [recovering, setRecovering] = useState(false);
  const { busy, error, run, clearError } = useAction();
  if (recovering) return <Recovery onClose={() => setRecovering(false)} />;
  return (
    <Page>
      <View
        style={{
          marginTop: 15,
          marginBottom: 30,
          width: 84,
          height: 84,
          borderRadius: 28,
          backgroundColor: '#162824',
          borderWidth: 1,
          borderColor: '#35523B',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Logo size={50} />
      </View>
      <Heading
        eyebrow="LESS NOISE. MORE CONNECTION."
        title={register ? 'Find your\npeople.' : 'Closer.\nOn your terms.'}
        subtitle={
          register
            ? 'Create a little space for the people who matter.'
            : 'Welcome back to your corner of the internet.'
        }
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 26 }}>
        <Badge text="INVITATION ONLY" accent />
        <Badge text="NO TRACKING" icon="eye-off" />
      </View>
      <Field
        label="Email"
        defaultValue={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        keyboardType="email-address"
        autoComplete={register ? 'email' : 'username'}
        importantForAutofill="yes"
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
            key={register ? 'new-password' : 'current-password'}
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
            icon="arrow-right"
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
      <Text style={[visual.small, { textAlign: 'center', marginTop: 20, color: palette.dim }]}>
        Chats are access-controlled, not end-to-end encrypted. Only accepted participants can access
        your conversations.
      </Text>
      {!register && !verification && (
        <Button
          title="Forgot your password?"
          secondary
          disabled={busy}
          onPress={() => {
            clearError();
            setPassword('');
            setRecovering(true);
          }}
        />
      )}
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
          clearError();
          setRegister(!register && !verification);
          setVerification(false);
          setPassword('');
          setCode('');
        }}
      />
    </Page>
  );
}
