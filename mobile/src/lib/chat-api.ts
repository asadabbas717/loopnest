import type { SupabaseClient } from '@supabase/supabase-js';
import { displayName, messageText, username, uuid } from '../domain/validation.ts';
import { createFriendsApi } from './friends-api.ts';
import { UserFacingError } from '../domain/user-errors.ts';
export type Profile = { id: string; username: string; display_name: string };
export type Conversation = {
  id: string;
  initiator: string;
  recipient: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
};
export type Message = {
  id: string;
  sender_id: string;
  body: string;
  photo_id: string | null;
  created_at: string;
};

export function createChatApi(backend: () => SupabaseClient) {
  async function ownProfile(id: string): Promise<Profile | null> {
    const { data, error } = await backend()
      .from('profiles')
      .select('id,username,display_name')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }
  async function saveProfile(id: string, handle: string, name: string) {
    const { error } = await backend()
      .from('profiles')
      .insert({ id, username: username(handle), display_name: displayName(name) });
    if (error?.code === '23505') throw new UserFacingError('username_taken');
    if (error) throw error;
  }
  async function conversations(): Promise<Conversation[]> {
    const { data, error } = await backend()
      .from('conversations')
      .select('id,initiator,recipient,status,created_at')
      .neq('status', 'declined')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return data;
  }
  async function conversation(id: string): Promise<Conversation | null> {
    const { data, error } = await backend()
      .from('conversations')
      .select('id,initiator,recipient,status,created_at')
      .eq('id', uuid(id))
      .maybeSingle();
    if (error) throw error;
    return data;
  }
  async function peerProfile(id: string): Promise<Profile | null> {
    return ownProfile(id);
  }
  async function invite(handle: string): Promise<string> {
    const { data, error } = await backend().rpc('invite', { recipient_username: username(handle) });
    if (error) throw error;
    return data as string;
  }
  async function respond(id: string, accept: boolean) {
    const { error } = await backend().rpc('respond_to_invite', {
      cid: uuid(id),
      accept_invite: accept,
    });
    if (error) throw error;
  }
  async function messages(
    id: string,
    before?: Pick<Message, 'created_at' | 'id'>,
  ): Promise<Message[]> {
    let query = backend()
      .from('messages')
      .select('id,sender_id,body,photo_id,created_at')
      .eq('conversation_id', uuid(id))
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(40);
    if (before) {
      uuid(before.id);
      if (!/^\d{4}-\d{2}-\d{2}T[0-9:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(before.created_at))
        throw new Error('Invalid history cursor.');
      query = query.or(
        `created_at.lt.${before.created_at},and(created_at.eq.${before.created_at},id.lt.${before.id})`,
      );
    }
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }
  async function send(
    id: string,
    messageId: string,
    text: string,
    expectedSender: string,
    photoId?: string,
  ) {
    const { error } = await backend().rpc('send_message', {
      cid: uuid(id),
      message_id: uuid(messageId),
      content: messageText(text, !!photoId),
      asset_id: photoId ?? null,
      expected_sender: uuid(expectedSender),
    });
    if (error) throw error;
  }
  async function blockUser(self: string, other: string) {
    await createFriendsApi(backend).setBlocked(self, other, true);
  }

  return {
    ownProfile,
    saveProfile,
    conversations,
    conversation,
    peerProfile,
    invite,
    respond,
    messages,
    send,
    blockUser,
  };
}
