import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { client } from '../lib/client';
import { ownProfile, accountState, type Profile } from '../lib/api';
import { createAuthState } from '../domain/auth-state';

const Context = createContext<{
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  failed: boolean;
  accountState: 'active' | 'erasing' | 'suspended';
  refresh: () => void;
}>({
  session: null,
  profile: null,
  loading: true,
  failed: false,
  accountState: 'active',
  refresh: () => {},
});
export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [result, setResult] = useState<{
    uid: string;
    revision: number;
    profile: Profile | null;
    failed: boolean;
    state: 'active' | 'erasing' | 'suspended';
  } | null>(null);
  const [booting, setBooting] = useState(!!client);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const authState = useRef<ReturnType<typeof createAuthState<Session>> | null>(null);
  useEffect(() => {
    if (!client) return;
    const authClient = client.auth;
    const scope = createAuthState<Session>({
      onSession(next) {
        setSession(next);
        setFailed(false);
        setBooting(false);
      },
      onError() {
        setFailed(true);
        setBooting(false);
      },
    });
    authState.current = scope;
    const { data } = client.auth.onAuthStateChange((_event, next) => scope.event(next));
    void scope.read(async () => {
      const { data, error } = await authClient.getSession();
      return { session: data.session, error };
    });
    if (AppState.currentState === 'active') client.auth.startAutoRefresh();
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') client?.auth.startAutoRefresh();
      else client?.auth.stopAutoRefresh();
    });
    return () => {
      scope.close();
      if (authState.current === scope) authState.current = null;
      data.subscription.unsubscribe();
      listener.remove();
      client?.auth.stopAutoRefresh();
    };
  }, []);
  const userId = session?.user.id;
  useEffect(() => {
    let active = true;
    if (!userId) return;
    ownProfile(userId)
      .then(async (next) => {
        const state = await accountState();
        if (active) setResult({ uid: userId, revision, profile: next, failed: false, state });
      })
      .catch(() => {
        if (active)
          setResult({ uid: userId, revision, profile: null, failed: true, state: 'active' });
      });
    return () => {
      active = false;
    };
  }, [userId, revision]);
  return (
    <Context.Provider
      value={{
        session,
        accountState: result && result.uid === userId ? result.state : 'active',
        profile: result?.uid === userId && result?.revision === revision ? result.profile : null,
        loading: booting || (!!userId && (result?.uid !== userId || result?.revision !== revision)),
        failed:
          failed ||
          (!!userId && result?.uid === userId && result?.revision === revision && result.failed),
        refresh: () => {
          setRevision((value) => value + 1);
          if (failed && client) {
            const authClient = client.auth;
            void authState.current?.read(async () => {
              const { data, error } = await authClient.getSession();
              return { session: data.session, error };
            });
          }
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useSession = () => useContext(Context);
