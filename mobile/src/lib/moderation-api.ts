import type { SupabaseClient } from '@supabase/supabase-js';
import { uuid } from '../domain/validation.ts';
import { reportReason } from '../domain/reports.ts';

export type ModerationItem = {
  id: string;
  reason: string;
  sender_id: string;
  body: string;
  photo_id: string | null;
  created_at: string;
};
export function createModerationApi(client: () => SupabaseClient) {
  return {
    async isModerator(): Promise<boolean> {
      const { data, error } = await client().rpc('is_moderator');
      if (error) throw error;
      return data === true;
    },
    async report(messageId: string, reason: string): Promise<string> {
      const { data, error } = await client().rpc('report_message', {
        mid: uuid(messageId),
        category: reportReason(reason),
      });
      if (error) throw error;
      return data as string;
    },
    async queue(): Promise<ModerationItem[]> {
      const { data, error } = await client().rpc('moderation_queue');
      if (error) throw error;
      return data as ModerationItem[];
    },
    async resolve(id: string, decision: 'dismiss' | 'resolve' | 'suspend') {
      const { error } = await client().rpc('resolve_report', { rid: uuid(id), decision });
      if (error) throw error;
    },
  };
}
