import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState } from 'react-native';
import { useSession } from './Session';
import { backend } from '../lib/client';
import { createReceiptApi } from '../lib/receipt-api';
import { createRefreshQueue } from '../lib/refresh-queue';

const Seen = createContext<(ids: string[]) => void>(() => {});
export const useSeenMessages = () => useContext(Seen);
export function ReceiptProvider({ children }: PropsWithChildren) {
  const { session, profile, accountState } = useSession();
  const actor = session?.user.id;
  const enabled = profile?.read_receipts === true;
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const marker = useRef<((ids: string[]) => void) | null>(null);
  const mark = useCallback((ids: string[]) => marker.current?.(ids), []);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setForeground(s === 'active'));
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!actor || !profile?.id || accountState !== 'active' || !foreground) return;
    let active = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const client = backend(),
      api = createReceiptApi(() => client);
    const pending = new Set<string>(),
      done = new Set<string>();
    const schedule = () => {
      if (retry !== undefined) return;
      retry = setTimeout(() => {
        retry = undefined;
        if (active) queue.request();
      }, 10000);
    };
    const queue = createRefreshQueue({
      read: async () => {
        const delivered = await api.pending(actor);
        if (!active) return false;
        if (delivered.length) await api.acknowledge(delivered, false, actor);
        if (!active) return false;
        const batch = enabled ? [...pending].slice(0, 100) : [];
        if (batch.length) {
          await api.acknowledge(batch, true, actor);
          if (active)
            for (const id of batch) {
              pending.delete(id);
              done.add(id);
            }
          // IDs only, scoped to this account/foreground lifetime; no message bytes.
          while (done.size > 500) done.delete(done.values().next().value!);
        }
        return delivered.length === 100 || pending.size > 0;
      },
      onValue: (more) => {
        if (more) queue.request();
      },
      onError: schedule,
    });
    const receive = (ids: string[]) => {
      if (!active || !enabled) return;
      for (const id of ids) if (!done.has(id) && pending.size < 500) pending.add(id);
      if (pending.size) queue.request();
    };
    marker.current = receive;
    const channel = client
      .channel(`receipts-${actor}`, {
        config: { postgres_changes_options: { wait: true, timeout: 15000 } },
      })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          if (payload.new.sender_id !== actor) queue.request();
        },
      )
      .subscribe((status) => {
        if (!active) return;
        if (status === 'SUBSCRIBED') queue.request();
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') schedule();
      });
    queue.request();
    return () => {
      active = false;
      queue.dispose();
      if (retry !== undefined) clearTimeout(retry);
      if (marker.current === receive) marker.current = null;
      pending.clear();
      done.clear();
      void client.removeChannel(channel);
    };
  }, [actor, profile?.id, enabled, foreground, accountState]);
  return <Seen.Provider value={mark}>{children}</Seen.Provider>;
}
