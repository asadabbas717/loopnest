import type { SupabaseClient } from '@supabase/supabase-js';
import { uuid } from '../domain/validation.ts';
import { UserFacingError } from '../domain/user-errors.ts';
import { invokePrivate } from './private-function.ts';
export function createAvatarApi(client: () => SupabaseClient) {
  return {
    async upload(actor: string, bytes: ArrayBuffer) {
      uuid(actor);
      if (!bytes.byteLength || bytes.byteLength > 262144) throw new Error('Avatar image too large');
      const reservation = await client().rpc('reserve_avatar', { expected_actor: actor });
      if (reservation.error) throw reservation.error;
      const id = uuid(reservation.data);
      const data = await invokePrivate(
        client(),
        'profile-photo',
        actor,
        {
          body: bytes,
          headers: { 'Content-Type': 'image/jpeg', 'x-photo-id': id },
        },
        'avatar_unavailable',
      );
      if (data?.assetId !== id) throw new UserFacingError('avatar_unavailable');
    },
    async remove(actor: string) {
      uuid(actor);
      const data = await invokePrivate(
        client(),
        'profile-photo',
        actor,
        { method: 'DELETE' },
        'avatar_unavailable',
      );
      if (data?.removed !== true) throw new UserFacingError('avatar_unavailable');
    },
  };
}
