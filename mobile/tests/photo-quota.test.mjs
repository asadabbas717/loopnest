import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { databaseFixture } from './helpers/database.mjs';

test('clearing reservations cannot reset daily photo quotas and active clears are excluded from general maintenance', async () => {
  const { db, as, admin } = await databaseFixture();
  const alice = randomUUID(),
    bob = randomUUID();
  try {
    for (const [id, name] of [
      [alice, 'alice'],
      [bob, 'bob'],
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
    for (let i = 0; i < 20; i++) await db.query('select id from public.reserve_photo($1)', [cid]);
    await assert.rejects(db.query('select id from public.reserve_photo($1)', [cid]), /Photo limit/);
    await admin();
    await db.query(
      "insert into public.photo_assets(owner_id,conversation_id,created_at) values($1,$2,now()-interval '49 hours')",
      [alice, cid],
    );
    const job = (
      await db.query('select * from public.begin_chat_clear($1,$2,$3)', [cid, alice, randomUUID()])
    ).rows[0];
    assert.equal((await db.query('select public.photo_cleanup_count() n')).rows[0].n, 0);
    assert.equal((await db.query('select * from public.claim_photo_cleanup(100)')).rows.length, 0);
    await db.query('select public.finish_chat_clear($1)', [job.job_id]);
    await as(alice);
    await assert.rejects(db.query('select id from public.reserve_photo($1)', [cid]), /Photo limit/);
    await assert.rejects(db.query('select * from private.photo_quota_receipts'));
    await admin();
    assert.equal(
      (await db.query('select count(*)::int n from private.photo_quota_receipts')).rows[0].n,
      20,
    );
    await db.query("update private.photo_quota_receipts set reserved_at=now()-interval '25 hours'");
    await as(alice);
    await db.query('select id from public.reserve_photo($1)', [cid]);
    await admin();
    assert.equal(
      (await db.query('select count(*)::int n from private.photo_quota_receipts')).rows[0].n,
      0,
    );
    await db.query('delete from auth.users where id=$1', [alice]);
  } finally {
    await db.close();
  }
});
