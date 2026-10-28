import type { SupabaseClient } from '@supabase/supabase-js';
import { credentials } from '../domain/validation.ts';

// Use a separate, non-persistent client: verifying recovery must never sign the
// main application in or expose chat before the password-reset flow completes.
export function createRecoveryApi(client: SupabaseClient) {
  let verifiedEmail: string | null = null;
  let passwordChanged = false;
  return {
    async request(email: string) {
      const normalized = credentials(email, 'placeholder', false).email;
      const { error } = await client.auth.resetPasswordForEmail(normalized);
      if (error) throw error;
      return normalized;
    },
    async verify(email: string, code: string) {
      if (!/^\d{6,10}$/.test(code.trim()))
        throw new Error('Enter the verification code from your email.');
      const { data, error } = await client.auth.verifyOtp({
        email,
        token: code.trim(),
        type: 'recovery',
      });
      if (error || !data.user?.email || !data.session)
        throw error ?? new Error('Recovery verification failed.');
      verifiedEmail = data.user.email;
    },
    async complete(password: string) {
      if (!verifiedEmail) throw new Error('Recovery verification is required.');
      if (!passwordChanged) {
        credentials(verifiedEmail, password, true);
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        passwordChanged = true;
      }
      // A retry after a lost sign-out response must not repeat the password change.
      const { error } = await client.auth.signOut({ scope: 'global' });
      if (error) throw error;
      verifiedEmail = null;
    },
    async dispose() {
      try {
        await client.auth.signOut({ scope: 'local' });
      } finally {
        client.auth.dispose?.();
      }
    },
  };
}
