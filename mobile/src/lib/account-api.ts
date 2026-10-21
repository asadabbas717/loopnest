import type { SupabaseClient } from '@supabase/supabase-js';
import { UserFacingError, type UserErrorCode } from '../domain/user-errors.ts';
export function createAccountApi(client: () => SupabaseClient) {
  return {
    async deleteAccount(password: string, confirmation: string) {
      const { data, error } = await client().functions.invoke('delete-account', {
        body: { password, confirmation },
      });
      if (error) {
        // HTTP invocation errors carry the function's Response, not its JSON body.
        // Parse only approved codes; never display arbitrary response text.
        if (error.name === 'FunctionsHttpError' && error.context instanceof Response) {
          try {
            const body = await error.context.clone().json();
            const allowed: UserErrorCode[] = [
              'wrong_password',
              'auth_required',
              'deletion_unavailable',
              'invalid_confirmation',
              'rate_limited',
              'request_forbidden',
            ];
            if (allowed.includes(body?.code)) throw new UserFacingError(body.code);
          } catch (issue) {
            if (issue instanceof UserFacingError) throw issue;
          }
          if (error.context.status === 401) throw new UserFacingError('auth_required');
          if (error.context.status === 403) throw new UserFacingError('request_forbidden');
          if (error.context.status === 400) throw new UserFacingError('invalid_confirmation');
          if (error.context.status === 429) throw new UserFacingError('rate_limited');
          if (error.context.status >= 500) throw new UserFacingError('deletion_unavailable');
        }
        throw error;
      }
      if (data?.deleted !== true) throw new UserFacingError('deletion_protocol');
    },
  };
}
