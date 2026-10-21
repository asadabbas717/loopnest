import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { client } from '../lib/client';
import { ownProfile, type Profile } from '../lib/api';

const Context = createContext<{
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  failed: boolean;
  refresh: () => void;
}>({ session: null, profile: null, loading: true, failed: false, refresh: () => {} });
export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [result, setResult] = useState<{
    uid: string;
    revision: number;
    profile: Profile | null;
    failed: boolean;
  } | null>(null);
  const [booting, setBooting] = useState(!!client);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!client) return;
    let active = true;
    const { data } = client.auth.onAuthStateChange((_event, next) => {
      if (active) {
        setSession(next);
        setFailed(false);
        setBooting(false);
      }
    });
    client.auth
      .getSession()
      .then(({ data: result, error }) => {
        if (!active) return;
        if (error) setFailed(true);
        else setSession(result.session);
        setBooting(false);
      })
      .catch(() => {
        if (active) {
          setFailed(true);
          setBooting(false);
        }
      });
    if (AppState.currentState === 'active') client.auth.startAutoRefresh();
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') client?.auth.startAutoRefresh();
      else client?.auth.stopAutoRefresh();
    });
    return () => {
      active = false;
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
      .then((next) => {
        if (active) setResult({ uid: userId, revision, profile: next, failed: false });
      })
      .catch(() => {
        if (active) setResult({ uid: userId, revision, profile: null, failed: true });
      });
    return () => {
      active = false;
    };
  }, [userId, revision]);
  return (
    <Context.Provider
      value={{
        session,
        profile: result?.uid === userId && result?.revision === revision ? result.profile : null,
        loading: booting || (!!userId && (result?.uid !== userId || result?.revision !== revision)),
        failed:
          failed ||
          (!!userId && result?.uid === userId && result?.revision === revision && result.failed),
        refresh: () => {
          setRevision((value) => value + 1);
          if (failed && client)
            client.auth
              .getSession()
              .then(({ data, error }) => {
                if (error) return;
                setSession(data.session);
                setFailed(false);
              })
              .catch(() => undefined);
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useSession = () => useContext(Context);
