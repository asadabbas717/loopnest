import test from 'node:test';
import assert from 'node:assert/strict';
import { databaseFixture } from './helpers/database.mjs';

test('declined invitations can be resent with fresh consent, private quotas and bidirectional block enforcement', async () => {
  const { db, as, admin } = await databaseFixture();
  const a = '00000000-0000-4000-8000-000000000001';
  const b = '00000000-0000-4000-8000-000000000002';
  const c = '00000000-0000-4000-8000-000000000003';
  const age = async () => {
    await admin();
    await db.exec("update private.invitation_attempts set created_at=now()-interval '2 minutes'");
  };
  try {
    await db.query('insert into auth.users values ($1),($2),($3)', [a, b, c]);
    for (const [id, name] of [
      [a, 'alice'],
      [b, 'bob'],
      [c, 'eve'],
    ]) {
      await as(id);
      await db.query('insert into public.profiles(id,username,display_name) values($1,$2,$2)', [
        id,
        name,
      ]);
    }
    await as(a);
    const cid = (await db.query("select public.invite('bob') id")).rows[0].id;
    assert.equal((await db.query("select public.invite('bob') id")).rows[0].id, cid);
    await as(b);
    await db.query('select public.respond_to_invite($1,false)', [cid]);
    await as(a);
    await assert.rejects(db.query("select public.invite('bob')"), /Invitation limit reached/);
    await assert.rejects(
      db.query('select * from private.invitation_attempts'),
      /permission denied/,
    );
    await age();
    await as(a);
    assert.equal((await db.query("select public.invite('bob') id")).rows[0].id, cid);
    assert.equal(
      (await db.query('select status from public.conversations where id=$1', [cid])).rows[0].status,
      'pending',
    );
    await assert.rejects(
      db.query('select public.respond_to_invite($1,true)', [cid]),
      /Invitation unavailable/,
    );
    await assert.rejects(
      db.query('select public.send_message($1,gen_random_uuid(),$2,null)', [cid, 'no consent']),
      /Not authorized/,
    );
    await as(c);
    await assert.rejects(db.query('select public.respond_to_invite($1,true)', [cid]));
    await as(b);
    await db.query('select public.respond_to_invite($1,false)', [cid]);
    // Reverse direction changes the recipient; a decline itself is not a block.
    assert.equal((await db.query("select public.invite('alice') id")).rows[0].id, cid);
    await assert.rejects(db.query('select public.respond_to_invite($1,true)', [cid]));
    await as(a);
    await db.query('select public.respond_to_invite($1,false)', [cid]);
    await db.query('select public.set_user_block($1,true,$2)', [b, a]);
    await assert.rejects(db.query("select public.invite('bob')"), /Invitation unavailable/);
    await as(b);
    await assert.rejects(db.query("select public.invite('alice')"), /Invitation unavailable/);
    await as(a);
    await db.query('select public.set_user_block($1,false,$2)', [b, a]);
    await age();
    await as(b);
    await db.query("select public.invite('alice')");
    await as(a);
    await db.query('select public.respond_to_invite($1,true)', [cid]);
    await db.query('select public.send_message($1,gen_random_uuid(),$2,null)', [cid, 'consented']);
    // Accepted calls are idempotent and cannot change who accepted or consume quota.
    assert.equal((await db.query("select public.invite('bob') id")).rows[0].id, cid);
    await admin();
    assert.equal((await db.query('select count(*) n from public.conversations')).rows[0].n, 1);
    // Repeated declines must also count toward the daily cap.
    await db.query("update public.conversations set status='declined' where id=$1", [cid]);
    await db.exec('delete from private.invitation_attempts');
    await db.query(
      "insert into private.invitation_attempts(actor,created_at) select $1,now()-interval '2 minutes' from generate_series(1,20)",
      [a],
    );
    await as(a);
    await assert.rejects(db.query("select public.invite('bob')"), /Invitation limit reached/);
    await as('', 'anon');
    await assert.rejects(db.query("select public.invite('alice')"), /permission denied/);
  } finally {
    await db.close();
  }
});
