import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { databaseFixture } from './helpers/database.mjs';
import {
  runContentMaintenance,
  contentMaintenanceHandler,
} from '../../supabase/functions/_shared/content-maintenance.ts';

test('maintenance leases serialize work, restrict operators and retire only noncurrent avatars', async () => {
  const { db, as, admin } = await databaseFixture();
  try {
    const actor = randomUUID();
    await db.query('insert into auth.users values($1)', [actor]);
    await as(actor);
    await db.query(
      "insert into public.profiles(id,username,display_name) values($1,'alice','Alice')",
      [actor],
    );
    await assert.rejects(
      db.query('select public.begin_content_maintenance()'),
      /permission denied/,
    );
    await admin();
    const first = (await db.query('select public.begin_content_maintenance() id')).rows[0].id;
    assert.ok(first);
    assert.equal((await db.query('select public.begin_content_maintenance() id')).rows[0].id, null);
    await assert.rejects(
      db.query('select public.finish_content_maintenance($1,true,$2)', [
        first,
        { diagnostic: 'never store diagnostics' },
      ]),
      /Invalid maintenance summary/,
    );
    await db.query(
      "update private.maintenance_runs set lease_until=now()-interval '1 second' where id=$1",
      [first],
    );
    const next = (await db.query('select public.begin_content_maintenance() id')).rows[0].id;
    assert.notEqual(next, first);
    assert.equal(
      (await db.query('select status from private.maintenance_runs where id=$1', [first])).rows[0]
        .status,
      'failed',
    );
    await db.query('select public.finish_content_maintenance($1,true,$2)', [
      next,
      { photos: 0, failures: 0 },
    ]);
    const current = randomUUID(),
      stale = randomUUID();
    await db.query(
      'insert into private.avatar_assets(id,owner_id,attempted_at) values($1,$3,now()),($2,$3,now())',
      [current, stale, actor],
    );
    await as(actor, 'service_role');
    await db.query("insert into storage.objects(bucket_id,name) values('profile-photos',$1)", [
      `${actor}/${stale}.jpg`,
    ]);
    await admin();
    await db.query(
      "update private.avatar_assets set created_at=now()-interval '2 hours',validated_at=now() where id=any($1::uuid[])",
      [[current, stale]],
    );
    await db.query('update public.profiles set avatar_id=$1 where id=$2', [current, actor]);
    const rows = (await db.query('select * from public.claim_avatar_maintenance()')).rows;
    assert.deepEqual(
      rows.map((r) => r.id),
      [stale],
      'the current avatar is never eligible, even if old',
    );
    await assert.rejects(
      db.query('select public.finish_avatar_cleanup($1)', [[stale]]),
      /Physical cleanup/,
    );
    await db.query("delete from storage.objects where bucket_id='profile-photos' and name=$1", [
      rows[0].path,
    ]);
    await db.query('select public.finish_avatar_cleanup($1)', [[stale]]);
    assert.ok(
      (await db.query('select purged_at from private.avatar_assets where id=$1', [stale])).rows[0]
        .purged_at,
    );
    await as('', 'anon');
    await assert.rejects(
      db.query('select public.content_maintenance_health()'),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
function fixture() {
  const calls = [];
  const deps = {
    backlog: async () => {
      calls.push('backlog');
      return { photos: 1 };
    },
    acquire: async () => {
      calls.push('acquire');
      return 'lease';
    },
    finish: async (_id, success, counts) => {
      calls.push(`finish:${success}`);
      assert.equal(typeof counts.failures, 'number');
    },
    pendingDeletes: async () => [{ message_id: 'message', path: 'delete.jpg' }],
    finishDelete: async () => {
      calls.push('delete-finish');
    },
    photos: async () => [{ id: 'photo', path: 'expired.jpg' }],
    finishPhotos: async () => {
      calls.push('photo-finish');
      return 1;
    },
    avatars: async () => [{ id: 'avatar', path: 'retired.jpg' }],
    finishAvatars: async () => {
      calls.push('avatar-finish');
    },
    remove: async (bucket, paths) => {
      calls.push(`remove:${bucket}:${paths[0]}`);
    },
    purgeText: async () => {
      calls.push('text');
      return 1;
    },
    prune: async () => {
      calls.push('prune');
      return 0;
    },
  };
  return { deps, calls };
}
test('maintenance defaults to count-only, bounds batches and never finalizes a failed physical removal', async () => {
  const { deps, calls } = fixture();
  await runContentMaintenance(deps);
  assert.deepEqual(calls, ['backlog']);
  calls.length = 0;
  const result = await runContentMaintenance(deps, false);
  assert.equal(result.counts.photos, 1);
  assert.ok(calls.indexOf('remove:chat-photos:expired.jpg') < calls.indexOf('photo-finish'));
  calls.length = 0;
  deps.remove = async () => {
    throw new Error('private Storage diagnostics');
  };
  const failed = await runContentMaintenance(deps, false);
  assert.equal(failed.counts.failures, 3);
  assert.equal(calls.includes('photo-finish'), false);
  assert.equal(calls.includes('avatar-finish'), false);
  assert.equal(calls.includes('delete-finish'), false);
  assert.equal(calls.at(-1), 'finish:false');
  calls.length = 0;
  deps.acquire = async () => null;
  assert.equal((await runContentMaintenance(deps, false)).skipped, true);
  assert.deepEqual(calls, []);
});
test('maintenance endpoint accepts only its dedicated secret and rejects browser, malformed and oversized requests', async () => {
  const { deps, calls } = fixture(),
    token = 'a'.repeat(64),
    handler = contentMaintenanceHandler(deps, token);
  const request = (body = {}, secret = token, extra = {}) =>
    new Request('https://example.test', {
      method: 'POST',
      headers: { 'x-maintenance-token': secret, ...extra },
      body: JSON.stringify(body),
    });
  assert.equal((await handler(request({}, 'b'.repeat(64)))).status, 401);
  assert.deepEqual(calls, []);
  assert.equal((await handler(request({}, token, { origin: 'https://example.test' }))).status, 403);
  assert.equal((await handler(request({ dry_run: 'false' }))).status, 400);
  assert.equal((await handler(request({ padding: 'x'.repeat(150) }))).status, 413);
  assert.equal((await handler(request())).status, 200);
  assert.deepEqual(calls, ['backlog']);
  calls.length = 0;
  assert.equal((await handler(request({ dry_run: false }))).status, 200);
  assert.equal(calls.at(-1), 'finish:true');
});
