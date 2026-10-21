import type { SupabaseClient } from '@supabase/supabase-js';
import { UserFacingError, type UserErrorCode } from '../domain/user-errors.ts';
export function createAccountApi(client: () => SupabaseClient) {
  return {
    async deleteAccount(password: string, confirmation: string) {
      const { data, error, response } = await client().functions.invoke('delete-account', {
        body: { password, confirmation },
      });
      if (error) {
        // HTTP invocation errors carry the function's Response, not its JSON body.
        // Parse only approved codes; never display arbitrary response text.
        // React Native fetch/Expo polyfills need not share the global Response
        // constructor or implement clone(). Consume the error body just once.
        const http = response ?? error.context;
        if (http && typeof http.status === 'number' && typeof http.json === 'function') {
          let body: { code?: unknown } | null = null;
          try {
            body = await http.json();
          } catch {
            /* Gateway/non-JSON failures use status-based messages. */
          }
          const allowed: UserErrorCode[] = [
            'wrong_password',
            'auth_required',
            'deletion_unavailable',
            'invalid_confirmation',
            'rate_limited',
            'request_forbidden',
          ];
          if (typeof body?.code === 'string' && allowed.includes(body.code as UserErrorCode))
            throw new UserFacingError(body.code as UserErrorCode);
          if (http.status === 401) throw new UserFacingError('auth_required');
          if (http.status === 403) throw new UserFacingError('request_forbidden');
          if (http.status === 400) throw new UserFacingError('invalid_confirmation');
          if (http.status === 429) throw new UserFacingError('rate_limited');
          if (http.status >= 500) throw new UserFacingError('deletion_unavailable');
        }
        throw error;
      }
      if (data?.deleted !== true) throw new UserFacingError('deletion_protocol');
    },
  };
}
