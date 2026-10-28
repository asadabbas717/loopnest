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
  retention_seconds: number | null;
  retention_changed_at: string | null;
};
export type Message = {
  id: string;
  sender_id: string;
  body: string;
  photo_id: string | null;
  created_at: string;
  expires_at: string | null;
  view_once: boolean;
  expires_monotonic?: number;
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
      .select('id,initiator,recipient,status,created_at,retention_seconds,retention_changed_at')
      .neq('status', 'declined')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return data;
  }
  async function conversation(id: string): Promise<Conversation | null> {
    const { data, error } = await backend()
      .from('conversations')
      .select('id,initiator,recipient,status,created_at,retention_seconds,retention_changed_at')
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
    uuid(id);
    if (before) {
      uuid(before.id);
      if (!/^\d{4}-\d{2}-\d{2}T[0-9:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(before.created_at))
        throw new Error('Invalid history cursor.');
    }
    const started = performance.now();
    const { data, error } = await backend().rpc('message_history', {
      cid: id,
      before_time: before?.created_at ?? null,
      before_id: before?.id ?? null,
    });
    if (error) throw error;
    const received = performance.now();
    return (data as (Message & { server_time: string })[]).map((row) => ({
      ...row,
      expires_monotonic: row.expires_at
        ? received +
          Math.max(
            0,
            Date.parse(row.expires_at) - Date.parse(row.server_time) - (received - started),
          )
        : undefined,
    }));
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

  async function setRetention(id: string, seconds: number | null, actor: string) {
    const { error } = await backend().rpc('set_message_retention', {
      cid: uuid(id),
      seconds,
      expected_actor: uuid(actor),
    });
    if (error) throw error;
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
    setRetention,
  };
}
