import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { databaseFixture } from './helpers/database.mjs';
import { createAvatarApi } from '../src/lib/avatar-api.ts';
import { cleanRetiredAvatars } from '../../supabase/functions/_shared/avatar-cleanup.ts';

test('private avatars restrict peers, retire replaced bytes, preserve quotas and freeze with account erasure', async () => {
  const { db, as, admin } = await databaseFixture();
  const alice = randomUUID(),
    bob = randomUUID(),
    eve = randomUUID();
  const reserve = async () => {
    await as(alice);
    return (await db.query('select public.reserve_avatar($1) id', [alice])).rows[0].id;
  };
  const claim = async (id) => {
    await as(null, 'service_role');
    return (await db.query('select * from public.claim_avatar_upload($1,$2)', [id, alice])).rows[0];
  };
  const store = async (asset) => {
    await as(null, 'service_role');
    await db.query("insert into storage.objects(bucket_id,name) values('profile-photos',$1)", [
      asset.path,
    ]);
    await db.query('select public.finish_avatar_upload($1,$2)', [asset.id, alice]);
  };
  try {
    for (const [id, name] of [
      [alice, 'alice'],
      [bob, 'bob'],
      [eve, 'eve'],
    ]) {
      await admin();
      await db.query('insert into auth.users values($1)', [id]);
      await as(id);
      await db.query('insert into public.profiles(id,username,display_name) values($1,$2,$2)', [
        id,
        name,
      ]);
    }
    const first = await claim(await reserve());
    await store(first);
    await as(alice);
    assert.equal(
      (await db.query("select * from storage.objects where bucket_id='profile-photos'")).rows
        .length,
      1,
    );
    await assert.rejects(
      db.query('update public.profiles set avatar_id=$1 where id=$2', [randomUUID(), alice]),
    );
    await assert.rejects(
      db.query('select * from public.claim_avatar_upload($1,$2)', [first.id, alice]),
    );
    await as(bob);
    assert.equal((await db.query('select * from storage.objects')).rows.length, 0);
    await as(alice);
    const cid = (await db.query("select public.invite('bob') id")).rows[0].id;
    await as(bob);
    assert.equal(
      (await db.query('select * from storage.objects')).rows.length,
      0,
      'pending cannot view',
    );
    await db.query('select public.respond_to_invite($1,true)', [cid]);
    assert.equal((await db.query('select * from storage.objects')).rows.length, 1);
    await as(eve);
    assert.equal((await db.query('select * from storage.objects')).rows.length, 0);
    await as(bob);
    await db.query('select public.set_user_block($1,true,$2)', [alice, bob]);
    assert.equal((await db.query('select * from storage.objects')).rows.length, 0);
    await db.query('select public.set_user_block($1,false,$2)', [alice, bob]);
    const next = await claim(await reserve());
    await store(next);
    await as(bob);
    assert.deepEqual(
      (await db.query('select name from storage.objects')).rows.map((x) => x.name),
      [next.path],
    );
    await admin();
    await assert.rejects(
      db.query('select public.finish_avatar_cleanup($1)', [[first.id]]),
      /Physical cleanup/,
    );
    await db.query('delete from storage.objects where name=$1', [first.path]);
    await db.query('select public.finish_avatar_cleanup($1)', [[first.id]]);
    await db.query('select public.retire_avatar($1)', [alice]);
    await as(alice);
    assert.equal((await db.query('select * from storage.objects')).rows.length, 0);
    await admin();
    await db.query('delete from storage.objects where name=$1', [next.path]);
    await db.query('select public.finish_avatar_cleanup($1)', [[next.id]]);
    const pending = await claim(await reserve());
    await reserve();
    await reserve();
    await assert.rejects(reserve(), /Avatar limit reached/);
    await admin();
    await db.query('select public.begin_account_erasure($1)', [alice]);
    await as(null, 'service_role');
    await assert.rejects(
      db.query("insert into storage.objects(bucket_id,name) values('profile-photos',$1)", [
        pending.path,
      ]),
    );
  } finally {
    await db.close();
  }
});

test('avatar cleanup deletes physical bytes first, retries failures and does not finalize account-erasure metadata early', async () => {
  const calls = [];
  const client = (failure = false) => ({
    rpc: (name) => {
      if (name === 'avatar_cleanup_paths')
        return { range: async () => ({ data: [{ id: 'id', path: 'private-path' }], error: null }) };
      calls.push('finalize');
      return Promise.resolve({ error: null });
    },
    storage: {
      from: () => ({
        remove: async () => {
          calls.push('remove');
          return { error: failure ? new Error('secret') : null };
        },
      }),
    },
  });
  await cleanRetiredAvatars(client(), 'actor');
  assert.deepEqual(calls, ['remove', 'finalize']);
  calls.length = 0;
  await assert.rejects(cleanRetiredAvatars(client(true), 'actor'));
  assert.deepEqual(calls, ['remove']);
  calls.length = 0;
  await cleanRetiredAvatars(client(), 'actor', true);
  assert.deepEqual(calls, ['remove']);
});

test('profile upload keeps account binding and sanitizes function failures', async () => {
  const actor = randomUUID(),
    asset = randomUUID(),
    other = randomUUID();
  let current = actor,
    calls = 0;
  const client = {
    rpc: async () => ({ data: asset, error: null }),
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: current }, access_token: 'captured' } },
        error: null,
      }),
    },
    functions: {
      invoke: async (_name, options) => {
        calls++;
        assert.equal(options.headers.Authorization, 'Bearer captured');
        return { data: { assetId: asset }, error: null };
      },
    },
  };
  const api = createAvatarApi(() => client);
  await api.upload(actor, new ArrayBuffer(4));
  assert.equal(calls, 1);
  current = other;
  await assert.rejects(api.upload(actor, new ArrayBuffer(4)), /Session changed/);
  assert.equal(calls, 1);
});
