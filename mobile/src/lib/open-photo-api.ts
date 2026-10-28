import type { SupabaseClient } from '@supabase/supabase-js';
import { uuid } from '../domain/validation.ts';
import { UserFacingError } from '../domain/user-errors.ts';
export function createOpenPhotoApi(
  client: () => SupabaseClient,
  url: string,
  publicKey: string,
  request: typeof fetch = fetch,
) {
  return async (
    id: string,
    actor: string,
    signal: AbortSignal,
  ): Promise<{ blob: Blob; deadline: number }> => {
    uuid(id);
    uuid(actor);
    const { data, error } = await client().auth.getSession();
    if (error) throw error;
    if (!data.session) throw new UserFacingError('auth_required');
    if (data.session.user.id !== actor) throw new Error('Session changed');
    if (signal.aborted) throw new Error('Photo closed');
    // The captured bearer binds this opening to its initiating account. Never
    // use the generic SDK function helper, which treats image/jpeg as text.
    const started = performance.now();
    const response = await request(`${url}/functions/v1/open-photo`, {
      method: 'POST',
      signal,
      headers: {
        apikey: publicKey,
        Authorization: `Bearer ${data.session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ asset_id: id }),
    });
    if (!response.ok) {
      if (response.status === 401) throw new UserFacingError('auth_required');
      if (response.status === 404) throw new UserFacingError('one_time_unavailable');
      if (response.status === 429) throw new UserFacingError('rate_limited');
      throw new UserFacingError('photo_delivery_unavailable');
    }
    if (!response.headers.get('content-type')?.toLowerCase().startsWith('image/jpeg'))
      throw new UserFacingError('photo_delivery_unavailable');
    const remaining = Number(response.headers.get('x-photo-view-ms'));
    if (!Number.isInteger(remaining) || remaining < 1 || remaining > 60000)
      throw new UserFacingError('photo_delivery_unavailable');
    const blob = await response.blob();
    if (signal.aborted) throw new Error('Photo closed');
    if (blob.size < 1 || blob.size > 1048576)
      throw new UserFacingError('photo_delivery_unavailable');
    const received = performance.now();
    const deadline = received + Math.max(0, remaining - (received - started));
    if (deadline <= received) throw new UserFacingError('one_time_unavailable');
    return { blob, deadline };
  };
}

// React Native FileReader supports readAsDataURL. Nothing is written to disk.
export function privateImageData(blob: Blob, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const abort = () => {
      reader.abort();
      reject(new Error('Photo closed'));
    };
    const cleanup = () => signal.removeEventListener('abort', abort);
    reader.onload = () => {
      cleanup();
      if (
        !signal.aborted &&
        typeof reader.result === 'string' &&
        reader.result.startsWith('data:image/jpeg;base64,')
      )
        resolve(reader.result);
      else reject(new UserFacingError('photo_delivery_unavailable'));
    };
    reader.onerror = () => {
      cleanup();
      reject(new UserFacingError('photo_delivery_unavailable'));
    };
    reader.onabort = () => {
      cleanup();
      reject(new Error('Photo closed'));
    };
    if (signal.aborted) {
      reject(new Error('Photo closed'));
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
    reader.readAsDataURL(blob);
  });
}
