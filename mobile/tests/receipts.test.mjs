import test from 'node:test';
import assert from 'node:assert/strict';
import { databaseFixture } from './helpers/database.mjs';

test('message receipts require recipient acknowledgement, mutual read opt-in and live authorized content', async () => {
  const { db, as, admin } = await databaseFixture();
  const a = '00000000-0000-4000-8000-000000000001',
    b = '00000000-0000-4000-8000-000000000002',
    c = '00000000-0000-4000-8000-000000000003';
  const mid = '00000000-0000-4000-8000-000000000011';
  try {
    await db.query('insert into auth.users values($1),($2),($3)', [a, b, c]);
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
    await as(b);
    await db.query('select public.respond_to_invite($1,true)', [cid]);
    await as(a);
    await db.query('select public.send_message($1,$2,$3,null)', [cid, mid, 'private']);
    const state = async () =>
      (await db.query('select delivery from public.message_delivery_status($1,$2)', [cid, [mid]]))
        .rows[0]?.delivery;
    const ack = (reading, actor) =>
      db.query('select public.ack_message_receipts($1,$2,$3)', [[mid], reading, actor]);
    assert.equal(await state(), 'sent');
    await ack(true, a);
    assert.equal(await state(), 'sent', 'sender cannot acknowledge own delivery');
    await as(c);
    await ack(true, c);
    assert.equal(await state(), undefined, 'outsider cannot read status');
    assert.equal(
      (await db.query('select * from public.pending_delivery_ids($1)', [c])).rows.length,
      0,
    );
    await as(b);
    await assert.rejects(ack(true, a), /Not authorized/);
    await assert.rejects(
      db.query('select * from private.message_acknowledgements'),
      /permission denied/,
    );
    assert.equal(
      (await db.query('select * from public.pending_delivery_ids($1)', [b])).rows.length,
      1,
    );
    await ack(false, b);
    assert.equal(
      (await db.query('select * from public.pending_delivery_ids($1)', [b])).rows.length,
      0,
    );
    await ack(true, b); // Default read sharing is off.
    await as(a);
    assert.equal(await state(), 'delivered');
    await db.query('select public.set_read_receipts(true,$1)', [a]);
    await as(b);
    await db.query('select public.set_read_receipts(true,$1)', [b]);
    await ack(true, b);
    await as(a);
    assert.equal(await state(), 'seen');
    await admin();
    const rev = (
      await db.query('select receipt_revision from public.conversations where id=$1', [cid])
    ).rows[0].receipt_revision;
    await as(b);
    await ack(true, b);
    await admin();
    assert.equal(
      (await db.query('select receipt_revision from public.conversations where id=$1', [cid]))
        .rows[0].receipt_revision,
      rev,
      'repeated acknowledgements cannot cause refresh loops',
    );
    await as(b);
    await db.query('select public.set_read_receipts(false,$1)', [b]);
    await as(a);
    assert.equal(await state(), 'delivered', 'disabling read sharing hides earlier seen states');
    await db.query('select public.set_user_block($1,true,$2)', [b, a]);
    assert.equal(await state(), undefined);
    await as(b);
    await ack(true, b);
    await as(a);
    await db.query('select public.set_user_block($1,false,$2)', [b, a]);
    await admin();
    await db.query("update public.messages set expires_at=now()-interval '1 second' where id=$1", [
      mid,
    ]);
    await as(a);
    assert.equal(await state(), undefined, 'expired messages expose no receipts');
    await as(b);
    await assert.rejects(
      db.query('select public.ack_message_receipts($1,false,$2)', [Array(101).fill(mid), b]),
      /Invalid receipt request/,
    );
    await admin();
    await db.query('delete from public.messages where id=$1', [mid]);
    assert.equal(
      (await db.query('select count(*) n from private.message_acknowledgements')).rows[0].n,
      0,
      'content erasure removes receipt metadata',
    );
    await as('', 'anon');
    await assert.rejects(
      db.query('select * from public.pending_delivery_ids($1)', [a]),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
