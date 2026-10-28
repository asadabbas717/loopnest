import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Text } from 'react-native';
import { backendUrl, publicKey } from '../lib/client';
import { createRecoveryApi } from '../lib/recovery-api';
import { Button, Field, Heading, Notice, Page, styles, useAction } from './ui';

export function Recovery({ onClose }: { onClose: () => void }) {
  const recovery = useMemo(
    () =>
      createRecoveryApi(
        createClient(backendUrl, publicKey, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        }),
      ),
    [],
  );
  const [step, setStep] = useState<'email' | 'code' | 'password' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, run } = useAction();
  const pendingCleanup = useRef<{
    api: typeof recovery;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  useEffect(() => {
    // Strict Mode's immediate setup/cleanup/setup must not dispose the same
    // client while it is still in use. A different API instance still closes.
    if (pendingCleanup.current?.api === recovery) clearTimeout(pendingCleanup.current.timer);
    return () => {
      const timer = setTimeout(() => void recovery.dispose().catch(() => undefined), 0);
      pendingCleanup.current = { api: recovery, timer };
    };
  }, [recovery]);
  return (
    <Page>
      <Heading
        title="Find your way back."
        subtitle="Reset your password using a code sent to your email."
      />
      {step === 'email' && (
        <>
          <Field
            label="Email"
            defaultValue={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            keyboardType="email-address"
            autoComplete="email"
            editable={!busy}
          />
          <Button
            title="Send recovery code"
            disabled={busy}
            onPress={() =>
              run(async () => {
                setEmail(await recovery.request(email));
                setStep('code');
              })
            }
          />
        </>
      )}
      {step === 'code' && (
        <>
          <Text style={[styles.copy, { marginBottom: 20 }]}>
            If an account exists for that email, a recovery code has been sent. Check your inbox.
          </Text>
          <Field
            label="Recovery code"
            value={code}
            onChangeText={setCode}
            autoComplete="one-time-code"
            keyboardType="number-pad"
            maxLength={10}
            editable={!busy}
          />
          <Button
            title="Verify code"
            disabled={busy}
            onPress={() =>
              run(async () => {
                await recovery.verify(email, code);
                setCode('');
                setStep('password');
              })
            }
          />
        </>
      )}
      {step === 'password' && (
        <>
          <Field
            label="New password · at least 12 characters"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            editable={!busy}
          />
          <Button
            title="Save new password"
            disabled={busy}
            onPress={() =>
              run(async () => {
                await recovery.complete(password);
                setPassword('');
                setStep('done');
              })
            }
          />
        </>
      )}
      {step === 'done' && (
        <Text style={[styles.copy, { marginBottom: 20 }]}>
          Your password has been changed. Sign in again with your new password.
        </Text>
      )}
      <Notice text={error} />
      <Button title="Back to sign in" secondary disabled={busy} onPress={onClose} />
    </Page>
  );
}
