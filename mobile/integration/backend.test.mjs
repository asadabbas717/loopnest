import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { createClient } from '@supabase/supabase-js';
import { createChatApi } from '../src/lib/chat-api.ts';
import { createRecoveryApi } from '../src/lib/recovery-api.ts';
import { createModerationApi } from '../src/lib/moderation-api.ts';
import { messageChannel } from '../src/lib/message-channel.ts';
import { localStatus } from '../scripts/backend.mjs';
import { cleanAbandonedPhotos } from '../scripts/photo-cleanup.mjs';
import { cleanExpiredText } from '../scripts/text-cleanup.mjs';
import { createSessionStorage } from '../src/domain/secure-storage.ts';
import { createFriendsApi } from '../src/lib/friends-api.ts';
import { createAccountApi } from '../src/lib/account-api.ts';
import { userErrorMessage } from '../src/domain/user-errors.ts';
import { createPhotoUploadApi } from '../src/lib/photo-upload-api.ts';
import { createAvatarApi } from '../src/lib/avatar-api.ts';
import jpegCodec from 'jpeg-js';
import { createReceiptApi } from '../src/lib/receipt-api.ts';

// Never accepts a URL/admin key from environment variables. The runner obtains
// ephemeral credentials from the project-local CLI and refuses hosted endpoints.
test(
  'real local Auth, PostgREST, Storage and Realtime authorization',
  { timeout: 180000 },
  async (t) => {
    const local = await localStatus();
    assert.ok(
      typeof local.key === 'string' && typeof local.adminKey === 'string',
      'local CLI keys available',
    );
    const options = {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    };
    const admin = createClient(local.url, local.adminKey, options);
    const clients = [];
    const users = [];
    const paths = [];
    const avatarPaths = [];
    const make = () => {
      const client = createClient(local.url, local.key, options);
      clients.push(client);
      return client;
    };
    const runId = randomUUID().replaceAll('-', '').slice(0, 10);
    const password = `Test-${randomUUID()}!`;
    const ok = (error, stage) => assert.ok(!error, stage); // Never log session/credential responses.
    const actors = {};
    async function emailCode(email, subject) {
      for (let i = 0; i < 40; i++) {
        const response = await fetch('http://127.0.0.1:54324/api/v1/messages');
        if (!response.ok) throw new Error('Local Mailpit inbox is unavailable.');
        const result = await response.json();
        const mail = result.messages?.find(
          (item) =>
            item.To?.some((recipient) => recipient.Address === email) &&
            (!subject || item.Subject === subject),
        );
        if (mail) {
          const body = await fetch(
            `http://127.0.0.1:54324/view/${encodeURIComponent(mail.ID)}.html`,
          ).then((value) => value.text());
          const code = body.match(/<strong>\s*(\d{6,10})\s*<\/strong>/i)?.[1];
          if (code) return code;
        }
        await delay(250);
      }
      throw new Error('Local verification email did not arrive with the configured OTP template.');
    }
    try {
      await t.test(
        'email confirmation is required; delivered codes verify real signups',
        async () => {
          for (const name of ['alice', 'bob', 'eve']) {
            const client = make();
            const email = `${name}-${runId}@example.test`;
            const handle = `${name}_${runId}`;
            const signup = await client.auth.signUp({ email, password });
            ok(signup.error, 'signup succeeds');
            assert.ok(signup.data.user?.id, 'signup returns a user');
            users.push(signup.data.user.id);
            assert.equal(signup.data.session, null, 'no session before email verification');
            if (name === 'alice') {
              const unverified = await make().auth.signInWithPassword({ email, password });
              assert.ok(unverified.error, 'unverified login denied');
            }
            const verified = await client.auth.verifyOtp({
              email,
              token: await emailCode(email),
              type: 'signup',
            });
            ok(verified.error, 'delivered email code accepted');
            assert.ok(verified.data.session?.access_token, 'verified session exists');
            const api = createChatApi(() => client);
            await api.saveProfile(verified.data.user.id, handle, name);
            actors[name] = { client, api, id: verified.data.user.id, handle, email };
          }
        },
      );
      const { alice, bob, eve } = actors;
      let cid;
      await t.test(
        'anonymous, outsiders and unaccepted invitations cannot read/send/upload',
        async () => {
          const anon = make();
          const anonymousRead = await anon.from('messages').select('id');
          assert.ok(anonymousRead.error, 'anonymous message read denied');
          cid = await alice.api.invite(bob.handle);
          assert.equal(
            (await eve.api.conversations()).length,
            0,
            'outsider cannot list conversation',
          );
          assert.equal(
            await eve.api.conversation(cid),
            null,
            'guessed ID does not expose conversation',
          );
          await assert.rejects(eve.api.respond(cid, true));
          await assert.rejects(alice.api.respond(cid, true));
          await assert.rejects(alice.api.send(cid, randomUUID(), 'before consent', alice.id));
          const reserved = await alice.client.rpc('reserve_photo', { cid }).single();
          assert.ok(reserved.error, 'cannot reserve photo before consent');
          await bob.api.respond(cid, true);
          assert.equal(
            (await bob.api.conversations()).find((row) => row.id === cid).peer_display_name,
            'alice',
            'home summaries identify the peer by display name',
          );
        },
      );
      let photoId;
      await t.test(
        'real receipt acknowledgements preserve read privacy and Realtime delivery states',
        async () => {
          const receiptsA = createReceiptApi(() => alice.client),
            receiptsB = createReceiptApi(() => bob.client),
            outsider = createReceiptApi(() => eve.client);
          const mid = randomUUID();
          await alice.api.send(cid, mid, 'receipt fixture', alice.id);
          assert.equal((await receiptsA.statuses(cid, [mid])).get(mid), 'sent');
          await outsider.acknowledge([mid], true, eve.id);
          await receiptsA.acknowledge([mid], true, alice.id);
          assert.equal((await receiptsA.statuses(cid, [mid])).get(mid), 'sent');
          assert.ok((await receiptsB.pending(bob.id)).includes(mid));
          await receiptsB.acknowledge([mid], false, bob.id);
          assert.equal((await receiptsA.statuses(cid, [mid])).get(mid), 'delivered');
          assert.equal(
            (await alice.api.messages(cid)).find((m) => m.id === mid).delivery,
            'delivered',
          );
          await receiptsB.acknowledge([mid], true, bob.id);
          assert.equal(
            (await receiptsA.statuses(cid, [mid])).get(mid),
            'delivered',
            'read sharing starts off',
          );
          await receiptsA.setSharing(alice.id, true);
          await receiptsB.setSharing(bob.id, true);
          // Subscribe to the same conversation metadata signal used by the app.
          let signal;
          const observed = new Promise((resolve) => {
            signal = resolve;
          });
          let joined;
          const connected = new Promise((resolve) => {
            joined = resolve;
          });
          const channel = alice.client
            .channel(`receipt-test-${runId}`, {
              config: { postgres_changes_options: { wait: true, timeout: 15000 } },
            })
            .on(
              'postgres_changes',
              { event: 'UPDATE', schema: 'public', table: 'conversations', filter: `id=eq.${cid}` },
              () => signal(),
            )
            .subscribe((status) => {
              if (status === 'SUBSCRIBED') joined();
            });
          try {
            await Promise.race([
              connected,
              delay(15000).then(() => {
                throw new Error('Receipt subscription timed out');
              }),
            ]);
            await receiptsB.acknowledge([mid], true, bob.id);
            await Promise.race([
              observed,
              delay(10000).then(() => {
                throw new Error('Receipt metadata signal did not arrive');
              }),
            ]);
            assert.equal((await receiptsA.statuses(cid, [mid])).get(mid), 'seen');
            await assert.rejects(receiptsB.acknowledge([mid], true, alice.id));
            await receiptsB.setSharing(bob.id, false);
            assert.equal((await receiptsA.statuses(cid, [mid])).get(mid), 'delivered');
          } finally {
            await alice.client.removeChannel(channel);
            await receiptsA.setSharing(alice.id, false);
            await receiptsB.setSharing(bob.id, false);
            ok(
              (await admin.from('messages').delete().eq('id', mid)).error,
              'receipt fixture cleanup',
            );
          }
        },
      );
      await t.test(
        'a decline permits a fresh reverse invitation but blocks and consent still apply',
        async () => {
          const peers = [];
          for (const suffix of ['a', 'b']) {
            const name = `repeat_${suffix}_${runId}`;
            const email = `${name}@example.test`;
            const made = await admin.auth.admin.createUser({
              email,
              password,
              email_confirm: true,
            });
            ok(made.error, 'repeat fixture account');
            const id = made.data.user.id;
            users.push(id);
            const client = make();
            ok(
              (await client.auth.signInWithPassword({ email, password })).error,
              'repeat fixture sign-in',
            );
            const api = createChatApi(() => client);
            await api.saveProfile(id, name, 'Repeat fixture');
            peers.push({ client, api, id, name });
          }
          const [a, b] = peers;
          const pending = await a.api.invite(b.name);
          await b.api.respond(pending, false);
          await assert.rejects(a.api.invite(b.name), 'resends retain the cooldown');
          await b.api.blockUser(b.id, a.id);
          await assert.rejects(a.api.invite(b.name), 'reverse block prevents invitation');
          await assert.rejects(b.api.invite(a.name), 'own block prevents invitation');
          await createFriendsApi(() => b.client).setBlocked(b.id, a.id, false);
          assert.equal(await b.api.invite(a.name), pending);
          await assert.rejects(b.api.respond(pending, true), 'new requester cannot self-accept');
          await assert.rejects(b.api.send(pending, randomUUID(), 'before consent', b.id));
          await a.api.respond(pending, true);
          assert.equal((await a.api.conversation(pending)).status, 'accepted');
        },
      );
      let path;
      let reportedMessageId;
      let laterReport;
      const jpeg = readFileSync(new URL('./fixtures/pixel.jpg', import.meta.url));
      async function validatedAsset(actor, oneTime = false) {
        const bytes = jpeg.buffer.slice(jpeg.byteOffset, jpeg.byteOffset + jpeg.byteLength);
        const id = await createPhotoUploadApi(() => actor.client).upload(
          cid,
          bytes,
          actor.id,
          oneTime,
        );
        const asset = await admin
          .from('photo_assets')
          .select('id,path,validated_at')
          .eq('id', id)
          .single();
        ok(asset.error, 'validated asset lookup');
        assert.ok(asset.data.validated_at, 'server marks validation only after saving');
        paths.push(asset.data.path);
        return asset.data;
      }
      let peerPhotoPath;
      let ownerAvatarPath;
      await t.test(
        'private profile photos validate bytes, restrict peers and physically remove replaced media',
        async () => {
          const api = createAvatarApi(() => alice.client);
          const bytes = jpeg.buffer.slice(jpeg.byteOffset, jpeg.byteOffset + jpeg.byteLength);
          await api.upload(alice.id, bytes);
          const first = (await alice.api.ownProfile(alice.id)).avatar_id;
          const firstPath = `${alice.id}/${first}.jpg`;
          avatarPaths.push(firstPath);
          ok(
            (await bob.client.storage.from('profile-photos').download(firstPath)).error,
            'accepted contact can view avatar',
          );
          assert.ok(
            (await eve.client.storage.from('profile-photos').download(firstPath)).error,
            'outsider cannot view avatar',
          );
          assert.ok(
            (
              await alice.client.storage
                .from('profile-photos')
                .upload(`${alice.id}/${randomUUID()}.jpg`, bytes, { contentType: 'image/jpeg' })
            ).error,
            'direct unvalidated uploads denied',
          );
          assert.ok(
            (await bob.client.rpc('claim_avatar_upload', { asset_id: first, actor: alice.id }))
              .error,
            'untrusted claims denied',
          );
          await api.upload(alice.id, bytes);
          const second = (await alice.api.ownProfile(alice.id)).avatar_id;
          const secondPath = `${alice.id}/${second}.jpg`;
          avatarPaths.push(secondPath);
          assert.notEqual(first, second);
          assert.ok(
            (await admin.storage.from('profile-photos').download(firstPath)).error,
            'replaced bytes physically removed',
          );
          await api.remove(alice.id);
          assert.equal((await alice.api.ownProfile(alice.id)).avatar_id, null);
          assert.ok(
            (await admin.storage.from('profile-photos').download(secondPath)).error,
            'removed bytes physically deleted',
          );
          await api.upload(alice.id, bytes);
          ownerAvatarPath = `${alice.id}/${(await alice.api.ownProfile(alice.id)).avatar_id}.jpg`;
          avatarPaths.push(ownerAvatarPath);
        },
      );
      await t.test(
        'private Storage enforces path ownership, byte/MIME limits and authenticated downloads',
        async () => {
          const reserved = await alice.client.rpc('reserve_photo', { cid }).single();
          ok(reserved.error, 'reservation RPC response supports single()');
          photoId = reserved.data.id;
          path = reserved.data.path;
          paths.push(path);
          const arbitrary = await alice.client.storage
            .from('chat-photos')
            .upload(`${alice.id}/${cid}/unreserved.jpg`, jpeg, { contentType: 'image/jpeg' });
          assert.ok(arbitrary.error, 'unreserved path denied');
          const stolen = await eve.client.storage
            .from('chat-photos')
            .upload(path, jpeg, { contentType: 'image/jpeg' });
          assert.ok(stolen.error, 'outsider upload denied');
          const badType = await admin.storage
            .from('chat-photos')
            .upload(path, jpeg, { contentType: 'text/html' });
          assert.ok(badType.error, 'non-JPEG MIME rejected');
          const tooBig = await admin.storage
            .from('chat-photos')
            .upload(path, Buffer.alloc(1048577), { contentType: 'image/jpeg' });
          assert.ok(tooBig.error, 'over-limit upload rejected');
          const uploaded = await alice.client.storage
            .from('chat-photos')
            .upload(path, jpeg, { contentType: 'image/jpeg', upsert: false });
          assert.ok(uploaded.error, 'direct client JPEG upload cannot bypass validation');
          ok(
            (await admin.rpc('claim_photo_validation', { asset_id: photoId, actor: alice.id }))
              .error,
            'trusted fixture claim',
          );
          ok(
            (
              await admin.storage
                .from('chat-photos')
                .upload(path, jpeg, { contentType: 'image/jpeg', upsert: false })
            ).error,
            'trusted unfinished validation fixture',
          );
          await assert.rejects(alice.api.send(cid, randomUUID(), 'unvalidated', alice.id, photoId));
          assert.ok(
            (
              await alice.client.rpc('finish_photo_validation', {
                asset_id: photoId,
                actor: alice.id,
              })
            ).error,
            'client cannot mark its own upload validated',
          );
          const valid = await validatedAsset(alice);
          photoId = valid.id;
          path = valid.path;
          const overwrite = await alice.client.storage
            .from('chat-photos')
            .upload(path, jpeg, { contentType: 'image/jpeg', upsert: true });
          assert.ok(overwrite.error, 'existing object cannot be overwritten');
          const pending = await bob.client.storage.from('chat-photos').download(path);
          assert.ok(pending.error, 'unattached photo inaccessible to recipient');
          await assert.rejects(bob.api.send(cid, randomUUID(), 'stolen photo', bob.id, photoId));
          reportedMessageId = randomUUID();
          await alice.api.send(cid, reportedMessageId, 'A private photo', alice.id, photoId);
          const received = await bob.client.storage.from('chat-photos').download(path);
          ok(received.error, 'accepted recipient can download attached photo');
          const decoded = jpegCodec.decode(Buffer.from(await received.data.arrayBuffer()));
          assert.equal(decoded.width, 1);
          assert.equal(decoded.height, 1);
          const outside = await eve.client.storage.from('chat-photos').download(path);
          assert.ok(outside.error, 'outsider cannot download guessed path');
          const publicRead = await fetch(
            `${local.url}/storage/v1/object/public/chat-photos/${path}`,
          );
          assert.equal(publicRead.ok, false, 'private bucket has no public download route');
          const current = (await bob.client.auth.getSession()).data.session;
          const authenticated = await fetch(
            `${local.url}/storage/v1/object/authenticated/chat-photos/${path}`,
            { headers: { apikey: local.key, Authorization: `Bearer ${current.access_token}` } },
          );
          assert.ok(authenticated.ok, 'the mobile authenticated image route works');
          const peerAsset = await validatedAsset(bob);
          peerPhotoPath = peerAsset.path;
          await bob.api.send(cid, randomUUID(), 'peer-owned photo', bob.id, peerAsset.id);
        },
      );
      await t.test(
        'trusted upload rejects spoofed JPEGs, oversized requests and reuse of validation claims',
        async () => {
          const reserve = async () => {
            const r = await alice.client.rpc('reserve_photo', { cid }).single();
            ok(r.error, 'adversarial upload reservation');
            return r.data;
          };
          const invoke = (client, asset, body) =>
            client.functions.invoke('upload-photo', {
              headers: { 'Content-Type': 'image/jpeg', 'x-photo-id': asset.id },
              body,
            });
          const asset = await reserve();
          assert.ok(
            (await invoke(eve.client, asset, jpeg)).error,
            'outsider cannot process another reservation',
          );
          const invalid = await invoke(
            alice.client,
            asset,
            Buffer.from('<html>not JPEG pixels</html>'),
          );
          assert.ok(invalid.error);
          assert.equal(invalid.response.status, 422);
          const reused = await invoke(alice.client, asset, jpeg);
          assert.equal(
            reused.response.status,
            403,
            'a failed validation consumes the one-use claim',
          );
          const big = await invoke(alice.client, await reserve(), Buffer.alloc(1048577));
          assert.equal(big.response.status, 413, 'streaming byte limit enforced on server');
          const anonymous = await fetch(`${local.url}/functions/v1/upload-photo`, {
            method: 'POST',
            headers: { apikey: local.key, 'Content-Type': 'image/jpeg', 'x-photo-id': asset.id },
            body: jpeg,
          });
          assert.equal(anonymous.status, 401);
          assert.equal(
            (await admin.from('photo_assets').select('validated_at').eq('id', asset.id).single())
              .data.validated_at,
            null,
            'invalid bytes never marked validated',
          );
        },
      );
      await t.test(
        'lost-response retries are idempotent and account switches reject stale sends',
        async () => {
          const messageId = randomUUID();
          await alice.api.send(cid, messageId, 'retry test', alice.id);
          await alice.api.send(cid, messageId, 'retry test', alice.id);
          assert.equal(
            (await alice.api.messages(cid)).filter((item) => item.id === messageId).length,
            1,
          );
          await assert.rejects(alice.api.send(cid, messageId, 'edited retry', alice.id));
          await assert.rejects(bob.api.send(cid, randomUUID(), 'stale account', alice.id));
          const offline = createClient(local.url, local.key, {
            ...options,
            global: {
              fetch: async () => {
                throw new TypeError('Synthetic offline connection');
              },
            },
          });
          const session = (await alice.client.auth.getSession()).data.session;
          const failed = await offline
            .from('messages')
            .select('id')
            .setHeader('Authorization', `Bearer ${session.access_token}`);
          assert.ok(failed.error, 'transport failure is explicit');
          assert.ok(
            (await alice.api.messages(cid)).length > 0,
            'fresh request recovers after offline transport',
          );
          const oldRefresh = session.refresh_token;
          const rotated = await alice.client.auth.refreshSession();
          ok(rotated.error, 'refresh succeeds');
          assert.ok(
            rotated.data.session?.refresh_token &&
              rotated.data.session.refresh_token !== oldRefresh,
            'refresh token rotates',
          );
        },
      );
      await t.test(
        'expiration and one-time delivery resist direct downloads, concurrent reopens and stale retries',
        async () => {
          await assert.rejects(eve.api.setRetention(cid, 3600, eve.id));
          await alice.api.setRetention(cid, 3600, alice.id);
          const expiredId = randomUUID();
          await alice.api.send(cid, expiredId, 'temporary synthetic text', alice.id);
          const timed = await validatedAsset(alice);
          const timedId = randomUUID();
          await alice.api.send(cid, timedId, '', alice.id, timed.id);
          ok(
            (
              await admin
                .from('messages')
                .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
                .in('id', [expiredId, timedId])
            ).error,
            'expire synthetic fixtures',
          );
          assert.ok(
            !(await alice.api.messages(cid)).some((m) => m.id === expiredId || m.id === timedId),
          );
          assert.ok(
            !(await bob.api.messages(cid)).some((m) => m.id === expiredId || m.id === timedId),
          );
          for (const actor of [alice, bob])
            assert.ok(
              (await actor.client.storage.from('chat-photos').download(timed.path)).error,
              'expired bytes denied',
            );
          const textPreview = await cleanExpiredText(admin);
          assert.ok(textPreview.eligible > 0, 'expired text preview reports pending rows');
          assert.ok((await cleanExpiredText(admin, { apply: true })).removed > 0);
          await assert.rejects(
            alice.api.send(cid, expiredId, 'temporary synthetic text', alice.id),
          );
          assert.ok((await bob.client.rpc('purge_expired_messages')).error);
          assert.ok((await bob.client.rpc('expired_text_cleanup_count')).error);
          const once = await validatedAsset(alice, true);
          await alice.api.send(cid, randomUUID(), '', alice.id, once.id);
          for (const actor of [alice, bob, eve]) {
            assert.ok(
              (await actor.client.storage.from('chat-photos').download(once.path)).error,
              'ordinary one-time download denied',
            );
            assert.ok(
              (
                await actor.client.rpc('claim_one_time_photo', {
                  asset_id: once.id,
                  actor: actor.id,
                })
              ).error,
            );
          }
          const open = async (actor) => {
            const session = (await actor.client.auth.getSession()).data.session;
            return fetch(`${local.url}/functions/v1/open-photo`, {
              method: 'POST',
              headers: {
                apikey: local.key,
                Authorization: `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ asset_id: once.id }),
            });
          };
          for (const actor of [alice, eve]) assert.equal((await open(actor)).status, 404);
          const openings = await Promise.all([open(bob), open(bob)]);
          assert.deepEqual(openings.map((r) => r.status).sort(), [200, 404]);
          const delivered = openings.find((r) => r.status === 200);
          const decoded = jpegCodec.decode(new Uint8Array(await delivered.arrayBuffer()));
          assert.equal(decoded.width, 1);
          assert.match(delivered.headers.get('cache-control'), /no-store/);
          assert.ok(
            Number(delivered.headers.get('x-photo-view-ms')) > 0 &&
              Number(delivered.headers.get('x-photo-view-ms')) <= 60000,
          );
          assert.equal((await open(bob)).status, 404);
          ok(
            (
              await admin
                .from('photo_assets')
                .update({ opened_at: new Date(Date.now() - 360000).toISOString() })
                .eq('id', once.id)
            ).error,
            'age opened fixture for cleanup',
          );
          const result = await cleanAbandonedPhotos(admin, { apply: true });
          assert.equal(result.removed, 2, 'expired and consumed media physically removed');
          assert.ok((await admin.storage.from('chat-photos').download(timed.path)).error);
          assert.ok((await admin.storage.from('chat-photos').download(once.path)).error);
          ok(
            (
              await admin
                .from('conversations')
                .update({ retention_changed_at: new Date(Date.now() - 60000).toISOString() })
                .eq('id', cid)
            ).error,
            'age settings fixture',
          );
          await bob.api.setRetention(cid, null, bob.id);
        },
      );
      await t.test(
        'Realtime delivers only to participants and catch-up works after resubscription',
        async () => {
          const marker = randomUUID();
          let received = false;
          let outsider = false;
          async function subscribe(actor, onMessage) {
            const channel = messageChannel(actor.client, cid, onMessage, `test-${randomUUID()}`);
            await new Promise((resolve, reject) => {
              const timer = setTimeout(
                () => reject(new Error('Realtime subscription timed out')),
                25000,
              );
              channel.subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                  clearTimeout(timer);
                  resolve();
                }
                if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                  clearTimeout(timer);
                  reject(new Error('Realtime subscription failed'));
                }
              });
            });
            return channel;
          }
          const bobChannel = await subscribe(bob, (event) => {
            if (event.new.id === marker) received = true;
          });
          const eveChannel = await subscribe(eve, () => {
            outsider = true;
          });
          await alice.api.send(cid, marker, 'live message', alice.id);
          for (let i = 0; i < 40 && !received; i++) await delay(250);
          assert.equal(received, true, 'recipient receives insert');
          await delay(500);
          assert.equal(outsider, false, 'outsider receives no payload');
          await bob.client.removeChannel(bobChannel);
          const missed = randomUUID();
          await alice.api.send(cid, missed, 'sent while disconnected', alice.id);
          const rejoined = await subscribe(bob, () => {});
          assert.ok(
            (await bob.api.messages(cid)).some((item) => item.id === missed),
            'HTTP catch-up retrieves missed message',
          );
          await bob.client.removeChannel(rejoined);
          await eve.client.removeChannel(eveChannel);
        },
      );
      await t.test(
        'abandoned-photo cleanup is privileged, retryable and preserves shared/recent media',
        async () => {
          const reserve = async () => {
            const result = await alice.client.rpc('reserve_photo', { cid }).single();
            ok(result.error, 'reserve maintenance fixture');
            return result.data;
          };
          const abandoned = await reserve();
          const empty = await reserve();
          const recent = await reserve();
          paths.push(abandoned.path);
          ok(
            (await admin.rpc('claim_photo_validation', { asset_id: abandoned.id, actor: alice.id }))
              .error,
            'unfinished validation fixture claim',
          );
          ok(
            (
              await admin.storage
                .from('chat-photos')
                .upload(abandoned.path, jpeg, { contentType: 'image/jpeg' })
            ).error,
            'abandoned fixture upload',
          );
          const shared = await admin.from('photo_assets').select('id').eq('path', path).single();
          ok(shared.error, 'shared fixture lookup');
          ok(
            (
              await admin
                .from('photo_assets')
                .update({ created_at: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString() })
                .in('id', [shared.data.id, abandoned.id, empty.id])
            ).error,
            'age synthetic fixtures',
          );
          assert.ok(
            (await alice.client.rpc('photo_cleanup_count')).error,
            'ordinary client cannot inspect maintenance scope',
          );
          assert.ok(
            (await eve.client.rpc('claim_photo_cleanup')).error,
            'outsider cannot claim cleanup',
          );
          const preview = await cleanAbandonedPhotos(admin);
          assert.equal(Number(preview.eligible), 2);
          assert.equal(preview.dryRun, true);
          ok(
            (await alice.client.storage.from('chat-photos').download(abandoned.path)).error,
            'dry run preserves bytes',
          );
          const claim = await admin.rpc('claim_photo_cleanup', { batch_size: 100 });
          ok(claim.error, 'claim abandoned assets');
          assert.deepEqual(
            new Set(claim.data.map((row) => row.id)),
            new Set([abandoned.id, empty.id]),
          );
          await assert.rejects(
            alice.api.send(cid, randomUUID(), 'late attachment', alice.id, abandoned.id),
          );
          assert.ok(
            (await admin.rpc('finish_photo_cleanup', { asset_ids: [abandoned.id] })).error,
            'cannot finalize before physical removal',
          );
          const result = await cleanAbandonedPhotos(admin, { apply: true });
          assert.equal(result.removed, 2);
          assert.equal(Number(result.remaining), 0);
          assert.ok(
            (await admin.storage.from('chat-photos').download(abandoned.path)).error,
            'abandoned bytes physically removed',
          );
          ok(
            (await bob.client.storage.from('chat-photos').download(path)).error,
            'old shared photo retained',
          );
          assert.equal(
            (await admin.from('photo_assets').select('id').eq('id', recent.id)).data.length,
            1,
            'recent reservation retained',
          );
        },
      );
      await t.test(
        'reports are scoped, idempotent and expose only selected content to authorized moderators',
        async () => {
          const reporter = createModerationApi(() => bob.client);
          const outsider = createModerationApi(() => eve.client);
          const reportId = await reporter.report(reportedMessageId, 'harassment');
          assert.equal(await reporter.report(reportedMessageId, 'harassment'), reportId);
          await assert.rejects(outsider.report(reportedMessageId, 'spam'));
          await assert.rejects(
            createModerationApi(() => alice.client).report(reportedMessageId, 'other'),
          );
          await assert.rejects(reporter.queue());
          assert.ok(
            (await bob.client.rpc('set_moderator', { target: bob.id, enabled: true })).error,
            'users cannot elevate themselves',
          );
          assert.equal(
            (await alice.client.from('reports').select('id')).data.length,
            0,
            'sender cannot see reporter records',
          );
          ok(
            (await admin.rpc('set_moderator', { target: eve.id, enabled: true })).error,
            'operator grants moderator role',
          );
          assert.equal(await outsider.isModerator(), true);
          const queue = await outsider.queue();
          assert.equal(queue.length, 1);
          assert.equal(queue[0].id, reportId);
          assert.equal(queue[0].body, 'A private photo');
          assert.equal('reporter_id' in queue[0], false, 'review queue omits reporter identity');
          assert.equal(
            (await eve.api.messages(cid)).length,
            0,
            'moderator cannot browse unrelated chat history',
          );
          ok(
            (await eve.client.storage.from('chat-photos').download(path)).error,
            'reported media available for review',
          );
          await outsider.resolve(reportId, 'resolve');
          assert.equal((await outsider.queue()).length, 0);
          assert.ok(
            (await eve.client.storage.from('chat-photos').download(path)).error,
            'review permission ends after resolution',
          );
          const text = (await bob.api.messages(cid)).find((item) => item.body === 'retry test');
          laterReport = await reporter.report(text.id, 'spam');
        },
      );
      await t.test('blocking revokes API access and prevents new messages/photos', async () => {
        await bob.api.blockUser(bob.id, alice.id);
        assert.equal((await alice.api.messages(cid)).length, 0);
        assert.ok(
          (await bob.client.storage.from('profile-photos').download(ownerAvatarPath)).error,
          'blocking revokes profile-photo bytes',
        );
        assert.equal((await bob.api.messages(cid)).length, 0);
        assert.equal(await alice.api.conversation(cid), null);
        await assert.rejects(alice.api.send(cid, randomUUID(), 'blocked', alice.id));
        await assert.rejects(bob.api.send(cid, randomUUID(), 'blocked', bob.id));
        assert.ok((await alice.client.rpc('reserve_photo', { cid }).single()).error);
        assert.ok(
          (await bob.client.storage.from('chat-photos').download(path)).error,
          'blocked photo download denied',
        );
      });
      await t.test(
        'Friends lists are private and unblocking restores only mutually available chat',
        async () => {
          const aliceFriends = createFriendsApi(() => alice.client);
          const bobFriends = createFriendsApi(() => bob.client);
          const outsider = createFriendsApi(() => eve.client);
          assert.equal((await outsider.list('active')).length, 0);
          assert.equal((await outsider.list('blocked')).length, 0);
          assert.equal((await aliceFriends.list('active')).length, 0);
          assert.equal(
            (await aliceFriends.list('blocked')).length,
            0,
            'reverse block is not disclosed',
          );
          assert.equal((await bobFriends.list('blocked'))[0].user_id, alice.id);
          await assert.rejects(outsider.setBlocked(eve.id, alice.id, true));
          await assert.rejects(aliceFriends.setBlocked(bob.id, alice.id, false));
          await aliceFriends.setBlocked(alice.id, bob.id, true);
          await aliceFriends.setBlocked(alice.id, bob.id, false);
          assert.equal((await alice.api.messages(cid)).length, 0, 'cannot lift peer block');
          await bobFriends.setBlocked(bob.id, alice.id, false);
          await bobFriends.setBlocked(bob.id, alice.id, false);
          const friends = await aliceFriends.list('active');
          assert.equal(friends.length, 1);
          assert.equal(friends[0].user_id, bob.id);
          assert.equal(friends[0].conversation_id, cid);
          assert.equal((await aliceFriends.list('active', friends[0].username)).length, 0);
          assert.ok(
            (await alice.api.messages(cid)).length > 0,
            'unblocking preserves accepted history',
          );
          await alice.api.send(cid, randomUUID(), 'after unblock', alice.id);
          ok(
            (await bob.client.storage.from('chat-photos').download(path)).error,
            'accepted shared photo restored',
          );
          // Leave the existing blocked scenario in place for subsequent checks.
          await bobFriends.setBlocked(bob.id, alice.id, true);
        },
      );
      await t.test(
        'shared clear removes real Storage bytes, preserves connection and rejects replay resurrection',
        async () => {
          const freshCid = await bob.api.invite(eve.handle);
          await eve.api.respond(freshCid, true);
          const upload = createPhotoUploadApi(() => bob.client);
          const assetId = await upload.upload(
            freshCid,
            jpeg.buffer.slice(jpeg.byteOffset, jpeg.byteOffset + jpeg.byteLength),
            bob.id,
          );
          const asset = await admin.from('photo_assets').select('path').eq('id', assetId).single();
          ok(asset.error, 'clear fixture path');
          paths.push(asset.data.path);
          const oldId = randomUUID();
          await bob.api.send(freshCid, oldId, 'clear this synthetic photo', bob.id, assetId);
          await assert.rejects(alice.api.clearChat(freshCid, alice.id, randomUUID()));
          const requestId = randomUUID();
          await bob.api.clearChat(freshCid, bob.id, requestId);
          assert.equal((await eve.api.messages(freshCid)).length, 0);
          assert.ok((await admin.storage.from('chat-photos').download(asset.data.path)).error);
          assert.equal((await eve.api.conversation(freshCid)).status, 'accepted');
          await assert.rejects(bob.api.send(freshCid, oldId, 'replayed erased message', bob.id));
          await bob.api.send(freshCid, randomUUID(), 'new beginning', bob.id);
          await bob.api.clearChat(freshCid, bob.id, requestId);
          assert.equal((await eve.api.messages(freshCid))[0].body, 'new beginning');
        },
      );
      await t.test(
        'chat clearing preserves daily reservation limits and lockless refresh cannot restore a signed-out session',
        async () => {
          const email = `quota-${runId}@example.test`;
          const created = await admin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
          });
          ok(created.error, 'quota fixture account');
          const owner = created.data.user.id;
          users.push(owner);
          const quotaClient = make();
          ok(
            (await quotaClient.auth.signInWithPassword({ email, password })).error,
            'quota fixture sign-in',
          );
          const quotaApi = createChatApi(() => quotaClient);
          await quotaApi.saveProfile(owner, `quota_${runId}`, 'Quota fixture');
          const quotaCid = await quotaApi.invite(bob.handle);
          await bob.api.respond(quotaCid, true);
          for (let i = 0; i < 20; i++)
            ok(
              (await quotaClient.rpc('reserve_photo', { cid: quotaCid }).single()).error,
              'quota reservation',
            );
          assert.ok((await quotaClient.rpc('reserve_photo', { cid: quotaCid }).single()).error);
          await quotaApi.clearChat(quotaCid, owner, randomUUID());
          assert.ok(
            (await quotaClient.rpc('reserve_photo', { cid: quotaCid }).single()).error,
            'clearing cannot reset the daily allowance',
          );

          const vault = new Map();
          const storage = createSessionStorage(
            {
              getItem: async (key) => vault.get(key) ?? null,
              setItem: async (key, value) => {
                vault.set(key, value);
              },
              removeItem: async (key) => {
                vault.delete(key);
              },
            },
            randomUUID,
          );
          let release,
            started,
            refreshes = 0;
          const gate = new Promise((resolve) => {
            release = resolve;
          });
          const requestStarted = new Promise((resolve) => {
            started = resolve;
          });
          const guarded = createClient(local.url, local.key, {
            auth: {
              persistSession: true,
              autoRefreshToken: false,
              detectSessionInUrl: false,
              storage,
            },
            global: {
              fetch: async (input, init) => {
                const response = await fetch(input, init);
                if (String(input).includes('grant_type=refresh_token')) {
                  refreshes++;
                  started();
                  await gate;
                }
                return response;
              },
            },
          });
          clients.push(guarded);
          try {
            ok(
              (await guarded.auth.signInWithPassword({ email, password })).error,
              'guard fixture sign-in',
            );
            const first = guarded.auth.refreshSession(),
              second = guarded.auth.refreshSession();
            await Promise.race([
              requestStarted,
              delay(10000).then(() => {
                throw new Error('Refresh request did not start');
              }),
            ]);
            ok(
              (await guarded.auth.signOut({ scope: 'local' })).error,
              'sign-out while refresh response is pending',
            );
            release();
            const results = await Promise.all([first, second]);
            assert.equal(refreshes, 1, 'refresh requests use the SDK single flight');
            assert.ok(
              results.every((result) => !result.data.session),
              'late rotated sessions are discarded',
            );
            assert.ok(!(await guarded.auth.getSession()).data.session, 'sign-out persists');
            assert.equal(vault.size, 0, 'encrypted-vault adapter retains no session chunks');
          } finally {
            release();
            guarded.auth.dispose();
          }
        },
      );
      await t.test('sign-out and a fresh sign-in do not carry over another account', async () => {
        ok((await bob.client.auth.signOut()).error, 'sign-out succeeds');
        assert.equal((await bob.client.auth.getSession()).data.session, null);
        const login = await bob.client.auth.signInWithPassword({ email: eve.email, password });
        ok(login.error, 'different-account sign-in succeeds');
        assert.equal(login.data.user.id, eve.id);
        await assert.rejects(bob.api.send(cid, randomUUID(), 'previous account', bob.id));
      });
      await t.test(
        'recovery uses delivered single-use codes without signing in the main app',
        async () => {
          const main = make();
          const isolated = make();
          const recovery = createRecoveryApi(isolated);
          await assert.rejects(recovery.complete('not-yet-verified-password'));
          await recovery.request(eve.email);
          await assert.rejects(recovery.verify(eve.email, '000000'));
          const code = await emailCode(eve.email, 'Your Loopnest recovery code');
          await recovery.verify(eve.email, code);
          assert.equal((await main.auth.getSession()).data.session, null);
          const reused = await make().auth.verifyOtp({
            email: eve.email,
            token: code,
            type: 'recovery',
          });
          assert.ok(reused.error, 'used recovery code is rejected');
          const replacement = `New-${randomUUID()}!`;
          await recovery.complete(replacement);
          assert.equal((await isolated.auth.getSession()).data.session, null);
          assert.ok(
            (await main.auth.signInWithPassword({ email: eve.email, password })).error,
            'old password rejected',
          );
          ok(
            (await main.auth.signInWithPassword({ email: eve.email, password: replacement })).error,
            'new password works',
          );
        },
      );
      await t.test(
        'moderator suspension is enforced against existing JWTs without exposing admin powers',
        async () => {
          await createModerationApi(() => eve.client).resolve(laterReport, 'suspend');
          const state = await alice.client.rpc('account_state');
          ok(state.error, 'account status query succeeds');
          assert.equal(state.data, 'suspended');
          assert.ok(
            (await alice.client.storage.from('chat-photos').download(path)).error,
            'suspended owner cannot download',
          );
          await assert.rejects(alice.api.invite(eve.handle));
          await assert.rejects(createModerationApi(() => alice.client).queue());
        },
      );
      await t.test(
        'account erasure requires password, removes both participants media and denies stale sessions',
        async () => {
          assert.ok(
            (await alice.client.rpc('begin_account_erasure', { actor: bob.id })).error,
            'client cannot freeze someone else',
          );
          assert.ok(
            (await alice.client.rpc('account_erasure_paths', { actor: bob.id })).error,
            'client cannot enumerate erasure scope',
          );
          const invalid = await fetch(`${local.url}/functions/v1/delete-account`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', apikey: local.key },
            body: JSON.stringify({ password, confirmation: 'DELETE' }),
          });
          assert.equal(invalid.status, 401, 'missing bearer denied');
          await assert.rejects(
            createAccountApi(() => alice.client).deleteAccount('wrong-password', 'DELETE'),
            (issue) => {
              assert.equal(
                userErrorMessage(issue),
                'Wrong password. Enter your current password and try again.',
              );
              return true;
            },
          );
          ok(
            (await admin.auth.admin.getUserById(alice.id)).error,
            'account survives wrong password',
          );
          const erased = await alice.client.functions.invoke('delete-account', {
            body: { password, confirmation: 'DELETE' },
          });
          ok(erased.error, 'trusted erasure endpoint succeeds');
          assert.equal(erased.data.deleted, true);
          users.splice(users.indexOf(alice.id), 1);
          assert.ok((await admin.auth.admin.getUserById(alice.id)).error, 'auth account removed');
          assert.ok(
            (await admin.storage.from('profile-photos').download(ownerAvatarPath)).error,
            'profile bytes removed before Auth erasure',
          );
          assert.ok(
            (await admin.storage.from('chat-photos').download(path)).error,
            'owner media physically removed',
          );
          assert.ok(
            (await admin.storage.from('chat-photos').download(peerPhotoPath)).error,
            'peer-owned media in erased chat removed',
          );
          assert.equal(
            (await admin.from('conversations').select('id').eq('id', cid)).data.length,
            0,
          );
          assert.equal(
            (await alice.api.messages(cid)).length,
            0,
            'old JWT cannot read erased data',
          );
          await assert.rejects(alice.api.send(cid, randomUUID(), 'stale send', alice.id));
        },
      );
    } finally {
      for (const client of clients) await client.removeAllChannels();
      // Delete physical objects through Storage before deleting synthetic test accounts.
      if (paths.length)
        ok((await admin.storage.from('chat-photos').remove(paths)).error, 'fixture media cleanup');
      if (avatarPaths.length)
        ok(
          (await admin.storage.from('profile-photos').remove(avatarPaths)).error,
          'fixture avatar cleanup',
        );
      for (const id of users)
        ok((await admin.auth.admin.deleteUser(id)).error, 'fixture user cleanup');
    }
  },
);
