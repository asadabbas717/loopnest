import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { databaseFixture } from './helpers/database.mjs';
import { clearChatHandler } from '../../supabase/functions/_shared/clear-chat.ts';

test('shared clearing freezes writes, requires physical deletion and cannot resurrect old delivery retries', async () => {
  const { db, as, admin } = await databaseFixture();
  const alice = randomUUID(),
    bob = randomUUID(),
    eve = randomUUID(),
    messageId = randomUUID();
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
    await as(alice);
    const cid = (await db.query("select public.invite('bob') id")).rows[0].id;
    await as(bob);
    await db.query('select public.respond_to_invite($1,true)', [cid]);
    await as(alice);
    const asset = (await db.query('select id from public.reserve_photo($1)', [cid])).rows[0].id;
    await admin();
    await db.query(
      'update public.photo_assets set validation_attempted_at=now(),validated_at=now() where id=$1',
      [asset],
    );
    const path = (await db.query('select path from public.photo_assets where id=$1', [asset]))
      .rows[0].path;
    await db.query("insert into storage.objects(bucket_id,name) values('chat-photos',$1)", [path]);
    await as(alice);
    await db.query('select public.send_message($1,$2,$3,$4,$5)', [
      cid,
      messageId,
      'private photo',
      asset,
      alice,
    ]);
    const request = randomUUID();
    await assert.rejects(
      db.query('select * from public.begin_chat_clear($1,$2,$3)', [cid, alice, request]),
    );
    await admin();
    await assert.rejects(
      db.query('select * from public.begin_chat_clear($1,$2,$3)', [cid, eve, request]),
    );
    const job = (
      await db.query('select * from public.begin_chat_clear($1,$2,$3)', [cid, alice, request])
    ).rows[0];
    await assert.rejects(
      db.query('select public.finish_chat_clear($1)', [job.job_id]),
      /Physical cleanup/,
    );
    for (const actor of [alice, bob]) {
      await as(actor);
      assert.equal((await db.query('select * from public.messages')).rows.length, 0);
      assert.equal((await db.query('select * from storage.objects')).rows.length, 0);
      await assert.rejects(
        db.query('select public.send_message($1,$2,$3,null,$4)', [
          cid,
          randomUUID(),
          'racing',
          actor,
        ]),
      );
      await assert.rejects(db.query('select public.reserve_photo($1)', [cid]));
    }
    await admin();
    await db.query("delete from storage.objects where bucket_id='chat-photos' and name=$1", [path]);
    await db.query('select public.finish_chat_clear($1)', [job.job_id]);
    assert.equal((await db.query('select count(*)::int n from public.messages')).rows[0].n, 0);
    assert.equal((await db.query('select count(*)::int n from public.photo_assets')).rows[0].n, 0);
    assert.equal(
      (await db.query('select * from public.begin_chat_clear($1,$2,$3)', [cid, alice, request]))
        .rows[0].done,
      true,
    );
    await as(alice);
    await assert.rejects(
      db.query('select public.send_message($1,$2,$3,null,$4)', [
        cid,
        messageId,
        'old retry',
        alice,
      ]),
      /Message expired/,
    );
    await db.query('select public.send_message($1,$2,$3,null,$4)', [
      cid,
      randomUUID(),
      'fresh start',
      alice,
    ]);
    await as(bob);
    assert.equal((await db.query('select body from public.messages')).rows[0].body, 'fresh start');
  } finally {
    await db.close();
  }
});

test('clear handler binds verified actor, bounds input and removes objects before finalization', async () => {
  const cid = randomUUID(),
    rid = randomUUID(),
    calls = [];
  const request = (body = { conversation_id: cid, request_id: rid, confirmation: 'CLEAR' }) =>
    new Request('https://example.invalid', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token' },
      body: JSON.stringify(body),
    });
  const deps = {
    actor: async () => 'verified-actor',
    begin: async (c, a, r) => {
      assert.equal(c, cid);
      assert.equal(a, 'verified-actor');
      assert.equal(r, rid);
      calls.push('begin');
      return { job_id: 'job', done: false };
    },
    paths: async () => ['private-path'],
    remove: async () => {
      calls.push('remove');
    },
    finish: async () => {
      calls.push('finish');
    },
  };
  assert.equal((await clearChatHandler(deps)(request())).status, 200);
  assert.deepEqual(calls, ['begin', 'remove', 'finish']);
  calls.length = 0;
  assert.equal(
    (
      await clearChatHandler({
        ...deps,
        remove: async () => {
          throw new Error('secret');
        },
      })(request())
    ).status,
    503,
  );
  assert.deepEqual(calls, ['begin']);
  assert.equal(
    (
      await clearChatHandler(deps)(
        request({ conversation_id: cid, request_id: rid, confirmation: 'CLEAR', actor: 'forged' }),
      )
    ).status,
    400,
  );
  assert.equal((await clearChatHandler(deps)(request('x'.repeat(600)))).status, 413);
  assert.equal(
    (await clearChatHandler(deps)(new Request('https://example.invalid', { method: 'POST' })))
      .status,
    401,
  );
});
