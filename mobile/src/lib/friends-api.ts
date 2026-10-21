import type { SupabaseClient } from '@supabase/supabase-js';
import { username, uuid } from '../domain/validation.ts';
export type FriendKind = 'active' | 'blocked';
export type FriendConnection = {
  user_id: string;
  username: string;
  display_name: string;
  conversation_id: string;
};
export function createFriendsApi(client: () => SupabaseClient) {
  return {
    async list(kind: FriendKind, after?: string): Promise<FriendConnection[]> {
      const { data, error } = await client().rpc('friend_connections', {
        list_kind: kind,
        after_username: after ? username(after) : null,
      });
      if (error) throw error;
      return data;
    },
    async setBlocked(actor: string, peer: string, blocked: boolean) {
      const { error } = await client().rpc('set_user_block', {
        peer: uuid(peer),
        blocked,
        expected_actor: uuid(actor),
      });
      if (error) throw error;
    },
  };
}
