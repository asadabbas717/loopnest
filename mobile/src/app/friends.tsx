import { useCallback, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { backend } from '../lib/client';
import { createFriendsApi, type FriendConnection, type FriendKind } from '../lib/friends-api';
import { userErrorMessage } from '../domain/user-errors';
import { useSession } from '../providers/Session';
import { Button, Heading, Loading, Notice, Page, styles, useAction } from '../components/ui';

const api = createFriendsApi(backend);
export default function Friends() {
  const { session, profile, loading, accountState } = useSession();
  const actor = session?.user.id;
  const ready = !!actor && profile?.id === actor && accountState === 'active';
  const [kind, setKind] = useState<FriendKind>('active');
  const [result, setResult] = useState<{
    actor: string;
    kind: FriendKind;
    rows: FriendConnection[];
    more: boolean;
  } | null>(null);
  const [fetching, setFetching] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const epoch = useRef(0);
  const { busy, error, run, clearError } = useAction();
  const rows = result && result.actor === actor && result.kind === kind ? result.rows : [];
  const load = useCallback(
    async (version: number, after?: string) => {
      if (!actor || !ready) return;
      setFetching(true);
      try {
        const next = await api.list(kind, after);
        if (version !== epoch.current) return;
        setResult((previous) => ({
          actor,
          kind,
          rows:
            after && previous?.actor === actor && previous.kind === kind
              ? [...previous.rows, ...next]
              : next,
          more: next.length === 50,
        }));
        setLoadError('');
      } catch (issue) {
        if (version === epoch.current) setLoadError(userErrorMessage(issue));
      } finally {
        if (version === epoch.current) setFetching(false);
      }
    },
    [actor, kind, ready],
  );
  useFocusEffect(
    useCallback(() => {
      const version = ++epoch.current;
      setNotice('');
      setLoadError('');
      setResult(null);
      if (!loading && !ready) router.replace('/');
      if (ready) void load(version);
      return () => {
        epoch.current++;
        setResult(null);
      };
    }, [loading, ready, load]),
  );
  if (loading || !ready)
    return (
      <Page>
        <Loading />
      </Page>
    );
  const changeBlock = (peer: FriendConnection, blocked: boolean) => {
    const version = epoch.current;
    run(async () => {
      await api.setBlocked(actor!, peer.user_id, blocked);
      if (version !== epoch.current) return;
      setNotice(
        blocked
          ? `${peer.display_name} is blocked.`
          : 'Your block was removed. Available accepted connections appear under Active friends.',
      );
      await load(version);
    });
  };
  return (
    <Page>
      <Heading
        title="Friends"
        subtitle="Active friends are accepted connections available for chat. This does not show online status."
      />
      <Button
        title="Active friends"
        secondary={kind !== 'active'}
        disabled={busy || fetching}
        onPress={() => {
          clearError();
          setKind('active');
        }}
      />
      <Button
        title="Blocked users"
        secondary={kind !== 'blocked'}
        disabled={busy || fetching}
        onPress={() => {
          clearError();
          setKind('blocked');
        }}
      />
      <Text style={[styles.copy, { marginBottom: 18 }]}>
        {kind === 'blocked'
          ? 'Only people you blocked appear here. Unblocking removes your block; the other person may still restrict contact.'
          : 'Open an existing conversation, or invite a new friend by username from the home screen.'}
      </Text>
      <Notice text={error || loadError} />
      {notice !== '' && (
        <Text accessibilityLiveRegion="polite" style={[styles.copy, { marginBottom: 16 }]}>
          {notice}
        </Text>
      )}
      <Button
        title="Refresh friends"
        secondary
        disabled={busy || fetching}
        onPress={() => void load(++epoch.current)}
      />
      {fetching && <Loading />}
      {!fetching && !rows.length && !loadError && (
        <Text style={styles.copy}>
          {kind === 'active' ? 'No active friends yet.' : 'You have not blocked anyone.'}
        </Text>
      )}
      {rows.map((peer) => (
        <View key={peer.user_id} style={styles.card}>
          <Text style={styles.label}>{peer.display_name}</Text>
          <Text style={styles.copy}>@{peer.username}</Text>
          {kind === 'active' && (
            <Button
              title="Open conversation"
              disabled={busy || fetching}
              onPress={() =>
                router.push({ pathname: '/chat/[id]', params: { id: peer.conversation_id } })
              }
            />
          )}
          <Button
            title={kind === 'blocked' ? 'Unblock user' : 'Block user'}
            secondary
            disabled={busy || fetching}
            onPress={() => {
              if (kind === 'blocked') changeBlock(peer, false);
              else
                Alert.alert(
                  `Block ${peer.display_name}?`,
                  'Messages, photos and invitations will be unavailable between you. You can unblock them from Friends.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Block', style: 'destructive', onPress: () => changeBlock(peer, true) },
                  ],
                );
            }}
          />
        </View>
      ))}
      {result?.actor === actor && result.kind === kind && result.more && (
        <Button
          title="Load more friends"
          secondary
          disabled={busy || fetching}
          onPress={() => void load(epoch.current, rows.at(-1)?.username)}
        />
      )}
    </Page>
  );
}
