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
        },
      );
      let photoId;
      let path;
      let reportedMessageId;
      let laterReport;
      const jpeg = readFileSync(new URL('./fixtures/pixel.jpg', import.meta.url));
      let peerPhotoPath;
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
          const badType = await alice.client.storage
            .from('chat-photos')
            .upload(path, jpeg, { contentType: 'text/html' });
          assert.ok(badType.error, 'non-JPEG MIME rejected');
          const tooBig = await alice.client.storage
            .from('chat-photos')
            .upload(path, Buffer.alloc(1048577), { contentType: 'image/jpeg' });
          assert.ok(tooBig.error, 'over-limit upload rejected');
          const uploaded = await alice.client.storage
            .from('chat-photos')
            .upload(path, jpeg, { contentType: 'image/jpeg', upsert: false });
          ok(uploaded.error, 'JPEG upload accepted');
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
          assert.ok(
            jpeg.equals(Buffer.from(await received.data.arrayBuffer())),
            'downloaded bytes match',
          );
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
          const peerAsset = await bob.client.rpc('reserve_photo', { cid }).single();
          ok(peerAsset.error, 'peer photo reservation');
          peerPhotoPath = peerAsset.data.path;
          paths.push(peerPhotoPath);
          ok(
            (
              await bob.client.storage
                .from('chat-photos')
                .upload(peerPhotoPath, jpeg, { contentType: 'image/jpeg' })
            ).error,
            'peer photo upload',
          );
          await bob.api.send(cid, randomUUID(), 'peer-owned photo', bob.id, peerAsset.data.id);
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
            (
              await alice.client.storage
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
          const wrong = await alice.client.functions.invoke('delete-account', {
            body: { password: 'wrong-password', confirmation: 'DELETE' },
          });
          assert.ok(wrong.error, 'wrong password cannot delete account');
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
      for (const id of users)
        ok((await admin.auth.admin.deleteUser(id)).error, 'fixture user cleanup');
    }
  },
);
