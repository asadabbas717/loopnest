import type { SupabaseClient } from '@supabase/supabase-js';
import { uuid } from '../domain/validation.ts';
import { UserFacingError, type UserErrorCode } from '../domain/user-errors.ts';
export function createPhotoUploadApi(client: () => SupabaseClient) {
  return {
    async upload(
      conversationId: string,
      bytes: ArrayBuffer,
      expectedActor: string,
    ): Promise<string> {
      if (bytes.byteLength < 1 || bytes.byteLength > 1048576)
        throw new UserFacingError('invalid_photo');
      uuid(expectedActor);
      const sessionResult = await client().auth.getSession();
      if (sessionResult.error) throw sessionResult.error;
      const session = sessionResult.data.session;
      if (!session) throw new UserFacingError('auth_required');
      if (session.user.id !== expectedActor) throw new Error('Session changed');
      const reserved = await client()
        .rpc('reserve_photo', { cid: uuid(conversationId) })
        .single();
      if (reserved.error) throw reserved.error;
      const asset = reserved.data as { id: string; owner_id: string } | null;
      if (!asset || typeof asset.id !== 'string')
        throw new UserFacingError('photo_upload_unavailable');
      if (asset.owner_id !== expectedActor) throw new Error('Session changed');
      const assetId = uuid(asset.id);
      const { data, error, response } = await client().functions.invoke('upload-photo', {
        headers: {
          'Content-Type': 'image/jpeg',
          'x-photo-id': assetId,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: bytes,
      });
      if (error) {
        const http = response ?? error.context;
        if (http && typeof http.json === 'function') {
          let code: unknown;
          try {
            code = (await http.json())?.code;
          } catch {
            /* Do not forward raw diagnostics. */
          }
          const allowed: UserErrorCode[] = [
            'invalid_photo',
            'photo_unavailable',
            'photo_upload_unavailable',
            'auth_required',
            'request_forbidden',
          ];
          if (typeof code === 'string' && allowed.includes(code as UserErrorCode))
            throw new UserFacingError(code as UserErrorCode);
        }
        throw error;
      }
      if (data?.assetId !== assetId) throw new UserFacingError('photo_upload_unavailable');
      return assetId;
    },
  };
}
