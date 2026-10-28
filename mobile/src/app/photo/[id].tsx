import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { backend, backendUrl, publicKey } from '../../lib/client';
import { captureTesting } from '../../lib/privacy-config';
import { createOpenPhotoApi, privateImageData } from '../../lib/open-photo-api';
import { useSession } from '../../providers/Session';
import { userErrorMessage, UserFacingError } from '../../domain/user-errors';
import { Button, Heading, Loading, Notice, Page, styles } from '../../components/ui';
import { Badge, Icon, visual } from '../../components/visuals';
import { palette } from '../../components/theme';

// Same protected activity/navigation window: no native Modal/dialog window and
// no exit animation that could retain private pixels after close or expiry.
export default function OneTimeViewer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session, profile } = useSession();
  const actor = session?.user.id;
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attempted, setAttempted] = useState(false);
  const ready = !!actor && profile?.id === actor;
  const started = useRef(false);
  const active = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clear = useCallback(() => {
    active.current = false;
    controller.current?.abort();
    controller.current = null;
    if (timer.current) clearTimeout(timer.current);
    setImage(null);
  }, []);
  const close = useCallback(() => {
    clear();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [clear, router]);
  useFocusEffect(
    useCallback(() => {
      if (!ready) return;
      active.current = true;
      return clear;
    }, [clear, ready]),
  );
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      if (state !== 'active') close();
    });
    return () => listener.remove();
  }, [close]);
  const open = async () => {
    if (
      started.current ||
      !actor ||
      profile?.id !== actor ||
      typeof id !== 'string' ||
      !active.current
    )
      return;
    started.current = true;
    setAttempted(true);
    setBusy(true);
    setError('');
    const abort = new AbortController();
    controller.current = abort;
    timer.current = setTimeout(close, 60000);
    try {
      const { blob, deadline } = await createOpenPhotoApi(backend, backendUrl, publicKey)(
        id,
        actor,
        abort.signal,
      );
      const value = await privateImageData(blob, abort.signal);
      if (!active.current || abort.signal.aborted) return;
      if (deadline <= performance.now()) throw new UserFacingError('one_time_unavailable');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(close, Math.max(0, deadline - performance.now()));
      if (active.current && !abort.signal.aborted) setImage(value);
    } catch (issue) {
      if (active.current && !abort.signal.aborted) setError(userErrorMessage(issue));
    } finally {
      if (active.current) setBusy(false);
    }
  };
  if (!session || profile?.id !== actor)
    return (
      <Page>
        <Loading />
      </Page>
    );
  return (
    <Page>
      <Stack.Screen options={{ animation: 'none', gestureEnabled: false }} />
      <Badge text="ONE-TIME VIEW" icon="eye" accent />
      <Heading
        title={image ? 'This moment is yours.' : 'Here for a moment.'}
        subtitle="One opening. Up to 60 seconds."
      />
      {image ? (
        <View
          style={{
            borderRadius: 22,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: palette.line,
          }}
        >
          <Image
            source={{ uri: image }}
            cachePolicy="none"
            recyclingKey={id}
            contentFit="contain"
            style={{ width: '100%', height: 400, backgroundColor: '#000' }}
            accessibilityLabel="One-time photo"
            onError={() => {
              setImage(null);
              setError('The image could not be displayed. This opening has been consumed.');
            }}
          />
        </View>
      ) : (
        <View style={[styles.card, { alignItems: 'center', paddingVertical: 35 }]}>
          <Icon name="eye" size={43} color={palette.accent} />
          <Text style={[styles.copy, { textAlign: 'center' }]}>
            Opening consumes this photo, even if delivery is interrupted. Leaving or backgrounding
            closes it permanently.
          </Text>
          <Text style={[visual.small, { textAlign: 'center' }]}>
            {captureTesting
              ? 'UI test mode: screenshots and recording are enabled for this development session.'
              : 'Screen protection is active. An external camera or a compromised device can still capture it.'}
          </Text>
        </View>
      )}
      <Notice text={error} />
      {busy && <Loading />}
      {!attempted && <Button title="Open photo once" icon="eye" onPress={() => void open()} />}
      <View style={{ marginTop: 20 }}>
        <Button
          title={image ? 'Close permanently' : 'Go back'}
          secondary
          icon="x"
          onPress={close}
        />
      </View>
    </Page>
  );
}
