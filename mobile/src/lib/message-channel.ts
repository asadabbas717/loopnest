import type { SupabaseClient, RealtimePostgresInsertPayload } from '@supabase/supabase-js';
import type { Message } from './chat-api.ts';
import { uuid } from '../domain/validation.ts';

export function messageChannel(
  client: SupabaseClient,
  conversationId: string,
  onMessage: (payload: RealtimePostgresInsertPayload<Message>) => void,
  topic = `conversation-${conversationId}`,
) {
  return client
    .channel(topic, {
      // A WebSocket join alone does not establish Postgres replication. Wait for
      // the server's CDC readiness before reporting SUBSCRIBED and catching up.
      config: { postgres_changes_options: { wait: true, timeout: 15000 } },
    })
    .on<Message>(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${uuid(conversationId)}`,
      },
      onMessage,
    );
}
