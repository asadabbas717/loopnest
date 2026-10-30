import type { SupabaseClient } from '@supabase/supabase-js';
import { displayName, messageText, username, uuid } from '../domain/validation.ts';
import { createFriendsApi } from './friends-api.ts';
import { UserFacingError } from '../domain/user-errors.ts';
import { expirationDeadline } from '../domain/ephemeral.ts';
import { invokePrivate } from './private-function.ts';
import { createReceiptApi, type Delivery } from './receipt-api.ts';
export type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_id: string | null;
  read_receipts: boolean;
};
export type Conversation = {
  id: string;
  initiator: string;
  recipient: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  retention_seconds: number | null;
  retention_changed_at: string | null;
  clearing_at: string | null;
  cleared_at: string | null;
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
  delivery?: Delivery;
};
export type ConversationSummary = Conversation & {
  peer_display_name: string;
  peer_username: string;
  peer_avatar_id: string | null;
};

export function createChatApi(backend: () => SupabaseClient) {
  async function ownProfile(id: string): Promise<Profile | null> {
    const { data, error } = await backend()
      .from('profiles')
      .select('id,username,display_name,avatar_id,read_receipts')
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
  async function conversations(): Promise<ConversationSummary[]> {
    const sessionResult = await backend().auth.getSession();
    if (sessionResult.error) throw sessionResult.error;
    const session = sessionResult.data.session;
    if (!session) return [];
    const { data, error } = await backend()
      .from('conversations')
      .select(
        'id,initiator,recipient,status,created_at,retention_seconds,retention_changed_at,clearing_at,cleared_at',
      )
      .neq('status', 'declined')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    const rows = data as Conversation[];
    if (!rows.length) return [];
    const peerIds = rows.map((row) =>
      row.initiator === session.user.id ? row.recipient : row.initiator,
    );
    const profiles = await backend()
      .from('profiles')
      .select('id,username,display_name,avatar_id')
      .in('id', peerIds);
    if (profiles.error) throw profiles.error;
    const names = new Map((profiles.data as Profile[]).map((peer) => [peer.id, peer]));
    return rows.map((row, index) => ({
      ...row,
      peer_display_name: names.get(peerIds[index]!)?.display_name ?? 'Unavailable contact',
      peer_username: names.get(peerIds[index]!)?.username ?? '',
      peer_avatar_id: names.get(peerIds[index]!)?.avatar_id ?? null,
    }));
  }
  async function conversation(id: string): Promise<Conversation | null> {
    const { data, error } = await backend()
      .from('conversations')
      .select(
        'id,initiator,recipient,status,created_at,retention_seconds,retention_changed_at,clearing_at,cleared_at',
      )
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
    // A receipt outage must not hide successfully fetched private messages.
    const statuses = await createReceiptApi(backend)
      .statuses(
        id,
        data.map((row: Message) => row.id),
      )
      .catch(() => new Map<string, Delivery>());
    return (data as (Message & { server_time: string })[])
      .map((row) => ({
        ...row,
        delivery: statuses.get(row.id) ?? 'unknown',
        expires_monotonic: expirationDeadline(row.expires_at, row.server_time, started, received),
      }))
      .filter(
        (row) => row.expires_monotonic === undefined || row.expires_monotonic > performance.now(),
      );
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
    if (
      seconds !== null &&
      (!Number.isInteger(seconds) || seconds < 3600 || seconds > 2592000 || seconds % 3600 !== 0)
    )
      throw new Error('Invalid disappearing duration');
    const { error } = await backend().rpc('set_message_retention', {
      cid: uuid(id),
      seconds,
      expected_actor: uuid(actor),
    });
    if (error) throw error;
  }

  return {
    async deleteMessage(id: string, messageId: string, actor: string) {
      const data = await invokePrivate(
        backend(),
        'delete-message',
        actor,
        {
          body: { conversation_id: uuid(id), message_id: uuid(messageId), confirmation: 'DELETE' },
        },
        'message_delete_unavailable',
      );
      if (data?.deleted !== true) throw new UserFacingError('message_delete_unavailable');
    },
    async pendingMessageDeletions(id: string, actor: string): Promise<string[]> {
      const { data, error } = await backend().rpc('pending_message_deletions', {
        cid: uuid(id),
        expected_actor: uuid(actor),
      });
      if (error) throw error;
      return data ?? [];
    },
    async clearChat(id: string, actor: string, requestId: string) {
      const data = await invokePrivate(
        backend(),
        'clear-chat',
        actor,
        {
          body: { conversation_id: uuid(id), request_id: uuid(requestId), confirmation: 'CLEAR' },
        },
        'clear_unavailable',
      );
      if (data?.cleared !== true) throw new UserFacingError('clear_unavailable');
    },
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
