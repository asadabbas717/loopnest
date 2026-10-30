import type { SupabaseClient } from '@supabase/supabase-js';
import { uuid } from '../domain/validation.ts';
export type Delivery = 'sent' | 'delivered' | 'seen' | 'unknown';
export function createReceiptApi(client: () => SupabaseClient) {
  return {
    async pending(actor: string): Promise<string[]> {
      const { data, error } = await client().rpc('pending_delivery_ids', {
        expected_actor: uuid(actor),
      });
      if (error) throw error;
      return data ?? [];
    },
    async acknowledge(ids: string[], reading: boolean, actor: string) {
      if (!ids.length) return;
      if (ids.length > 100) throw new Error('Invalid receipt request');
      const { error } = await client().rpc('ack_message_receipts', {
        message_ids: ids.map(uuid),
        reading,
        expected_actor: uuid(actor),
      });
      if (error) throw error;
    },
    async statuses(cid: string, ids: string[]): Promise<Map<string, Delivery>> {
      if (!ids.length) return new Map();
      const { data, error } = await client().rpc('message_delivery_status', {
        cid: uuid(cid),
        message_ids: ids.map(uuid),
      });
      if (error) throw error;
      return new Map(
        (data ?? []).map((r: { message_id: string; delivery: Delivery }) => [
          r.message_id,
          r.delivery,
        ]),
      );
    },
    async setSharing(actor: string, enabled: boolean) {
      const { error } = await client().rpc('set_read_receipts', {
        enabled,
        expected_actor: uuid(actor),
      });
      if (error) throw error;
    },
  };
}
