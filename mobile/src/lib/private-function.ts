import type { SupabaseClient } from '@supabase/supabase-js';
import { errorMessages, UserFacingError, type UserErrorCode } from '../domain/user-errors.ts';
export async function invokePrivate(
  client: SupabaseClient,
  name: string,
  actor: string,
  options: {
    body?: Record<string, unknown> | ArrayBuffer;
    headers?: Record<string, string>;
    method?: 'POST' | 'DELETE';
  },
  failure: UserErrorCode,
) {
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session) throw new UserFacingError('auth_required');
  if (sessionData.session.user.id !== actor) throw new Error('Session changed');
  const { data, error, response } = await client.functions.invoke(name, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${sessionData.session.access_token}` },
  });
  if (error) {
    const http = response ?? error.context;
    let code;
    try {
      code = (await http?.json())?.code;
    } catch {
      /* Do not reflect gateway diagnostics. */
    }
    if (typeof code === 'string' && Object.hasOwn(errorMessages, code))
      throw new UserFacingError(code as UserErrorCode);
    if (http?.status === 401) throw new UserFacingError('auth_required');
    if (http?.status === 403) throw new UserFacingError('request_forbidden');
    if (http?.status === 429) throw new UserFacingError('rate_limited');
    throw new UserFacingError(failure);
  }
  return data;
}
