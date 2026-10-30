import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { databaseFixture } from './helpers/database.mjs';
import { deleteMessageHandler } from '../../supabase/functions/_shared/delete-message.ts';

test('individual deletion binds the sender, freezes only its item and preserves physical cleanup, quotas and retry barriers', async () => {
  const { db, as, admin } = await databaseFixture();
  const a = randomUUID(),
    b = randomUUID(),
    e = randomUUID(),
    mid = randomUUID(),
    other = randomUUID();
  try {
    for (const [id, name] of [
      [a, 'alice'],
      [b, 'bob'],
      [e, 'eve'],
    ]) {
      await admin();
      await db.query('insert into auth.users values($1)', [id]);
      await as(id);
      await db.query('insert into public.profiles(id,username,display_name) values($1,$2,$2)', [
        id,
        name,
      ]);
    }
    await as(a);
    const cid = (await db.query("select public.invite('bob') id")).rows[0].id;
    await as(b);
    await db.query('select public.respond_to_invite($1,true)', [cid]);
    await as(a);
    const asset = (await db.query('select id from public.reserve_photo($1)', [cid])).rows[0].id;
    await admin();
    await db.query(
      'update public.photo_assets set validation_attempted_at=now(),validated_at=now() where id=$1',
      [asset],
    );
    const path = (await db.query('select path from public.photo_assets where id=$1', [asset]))
      .rows[0].path;
    await db.query("insert into storage.objects(bucket_id,name) values('chat-photos',$1)", [path]);
    await as(a);
    await db.query('select public.send_message($1,$2,$3,$4,$5)', [cid, mid, 'caption', asset, a]);
    await as(b);
    await db.query('select public.send_message($1,$2,$3,null,$4)', [cid, other, 'keep this', b]);
    await assert.rejects(
      db.query('select * from public.begin_message_delete($1,$2,$3)', [cid, mid, a]),
      /permission denied/,
    );
    await assert.rejects(db.query('select * from private.message_deletions'), /permission denied/);
    await admin();
    for (const actor of [b, e])
      await assert.rejects(
        db.query('select * from public.begin_message_delete($1,$2,$3)', [cid, mid, actor]),
        /Not authorized|Message unavailable/,
      );
    assert.equal(
      (await db.query('select * from public.begin_message_delete($1,$2,$3)', [cid, mid, a])).rows[0]
        .path,
      path,
    );
    await assert.rejects(
      db.query('select public.finish_message_delete($1)', [mid]),
      /Physical cleanup/,
    );
    for (const actor of [a, b]) {
      await as(actor);
      assert.deepEqual(
        (await db.query('select id from public.messages')).rows.map((m) => m.id),
        [other],
      );
      assert.equal((await db.query('select * from storage.objects')).rows.length, 0);
      assert.equal(
        (await db.query('select * from public.message_delivery_status($1,$2)', [cid, [mid]])).rows
          .length,
        0,
      );
      assert.equal(
        (await db.query('select * from public.pending_delivery_ids($1)', [actor])).rows.some(
          (r) => r.pending_delivery_ids === mid,
        ),
        false,
      );
      const pending = (
        await db.query('select * from public.pending_message_deletions($1,$2)', [cid, actor])
      ).rows;
      assert.equal(
        pending.length,
        actor === a ? 1 : 0,
        'only sender can discover their cleanup retries',
      );
    }
    await as(b);
    await db.query('select public.send_message($1,$2,$3,null,$4)', [
      cid,
      randomUUID(),
      'chat remains usable',
      b,
    ]);
    await admin();
    await db.query("delete from storage.objects where bucket_id='chat-photos' and name=$1", [path]);
    await db.query('select public.finish_message_delete($1)', [mid]);
    assert.equal(
      (await db.query('select count(*) n from public.photo_assets where id=$1', [asset])).rows[0].n,
      0,
    );
    assert.equal(
      (await db.query('select count(*) n from private.photo_quota_receipts where id=$1', [asset]))
        .rows[0].n,
      1,
    );
    assert.equal(
      (await db.query('select * from public.begin_message_delete($1,$2,$3)', [cid, mid, a])).rows[0]
        .done,
      true,
    );
    await as(a);
    await assert.rejects(
      db.query('select public.send_message($1,$2,$3,null,$4)', [cid, mid, 'old retry', a]),
      /Message expired/,
    );
    const text = randomUUID();
    await db.query('select public.send_message($1,$2,$3,null,$4)', [cid, text, 'remove text', a]);
    await admin();
    assert.equal(
      (await db.query('select * from public.begin_message_delete($1,$2,$3)', [cid, text, a]))
        .rows[0].path,
      null,
    );
    await db.query('select public.finish_message_delete($1)', [text]);
    await db.query('select public.finish_message_delete($1)', [text]);
    await as('', 'anon');
    await assert.rejects(
      db.query('select * from public.pending_message_deletions($1,$2)', [cid, a]),
    );
  } finally {
    await db.close();
  }
});

test('delete endpoint validates scope and confirmation, removes bytes before finalizing and leaves failures retryable', async () => {
  const cid = randomUUID(),
    mid = randomUUID(),
    actor = randomUUID(),
    calls = [];
  let failure = false;
  const handler = deleteMessageHandler({
    actor: async () => actor,
    begin: async (c, m, a) => {
      assert.equal(c, cid);
      assert.equal(m, mid);
      assert.equal(a, actor);
      calls.push('begin');
      return { done: false, path: 'private.jpg' };
    },
    remove: async () => {
      calls.push('remove');
      if (failure) throw new Error('private diagnostic');
    },
    finish: async () => {
      calls.push('finish');
    },
  });
  const request = (
    body = { conversation_id: cid, message_id: mid, confirmation: 'DELETE' },
    headers = {},
  ) =>
    new Request('https://example.test', {
      method: 'POST',
      headers: { authorization: 'Bearer synthetic', ...headers },
      body: JSON.stringify(body),
    });
  assert.equal((await handler(request())).status, 200);
  assert.deepEqual(calls, ['begin', 'remove', 'finish']);
  calls.length = 0;
  failure = true;
  const failed = await handler(request());
  assert.equal(failed.status, 503);
  assert.deepEqual(calls, ['begin', 'remove']);
  assert.equal((await failed.json()).code, 'message_delete_unavailable');
  assert.equal(
    (
      await handler(
        request({ ...{ conversation_id: cid, message_id: mid, confirmation: 'DELETE' }, actor }),
      )
    ).status,
    400,
  );
  assert.equal((await handler(request({}, { origin: 'https://example.test' }))).status, 403);
  assert.equal((await handler(request({ padding: 'x'.repeat(600) }))).status, 413);
  assert.equal(
    (await handler(new Request('https://example.test', { method: 'POST' }))).status,
    401,
  );
});
