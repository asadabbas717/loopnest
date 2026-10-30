import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { databaseFixture } from './helpers/database.mjs';
import { userErrorMessage } from '../src/domain/user-errors.ts';

test('project content admissions are private, aggregate and cannot be reset by deleting content or accounts', async () => {
  const { db, as, admin } = await databaseFixture();
  const a = randomUUID(),
    b = randomUUID();
  try {
    await db.query('insert into auth.users values($1),($2)', [a, b]);
    for (const [actor, name] of [
      [a, 'alice'],
      [b, 'bob'],
    ]) {
      await as(actor);
      await db.query('insert into public.profiles(id,username,display_name) values($1,$2,$2)', [
        actor,
        name,
      ]);
    }
    await as(a);
    const cid = (await db.query("select public.invite('bob') id")).rows[0].id;
    await as(b);
    await db.query('select public.respond_to_invite($1,true)', [cid]);
    await assert.rejects(
      db.query('select * from private.project_daily_usage'),
      /permission denied/,
    );
    await assert.rejects(db.query('select public.project_capacity_status()'), /permission denied/);
    await admin();
    await db.exec(
      'update private.project_limits set message_cap=1,message_day=1,photo_cap=1,photo_day=1,avatar_cap=1,avatar_day=1,profile_cap=2',
    );
    await as(a);
    const mid = randomUUID();
    await db.query('select public.send_message($1,$2,$3,null,$4)', [cid, mid, 'one', a]);
    await as(b);
    await assert.rejects(
      db.query('select public.send_message($1,$2,$3,null,$4)', [cid, randomUUID(), 'two', b]),
      /Project message capacity reached/,
    );
    await admin();
    await db.query('select * from public.begin_message_delete($1,$2,$3)', [cid, mid, a]);
    await db.query('select public.finish_message_delete($1)', [mid]);
    await as(b);
    await assert.rejects(
      db.query('select public.send_message($1,$2,$3,null,$4)', [cid, randomUUID(), 'two', b]),
      /Project message rate reached/,
    );
    await as(a);
    const photo = (await db.query('select id from public.reserve_photo($1)', [cid])).rows[0].id;
    await as(b);
    await assert.rejects(
      db.query('select public.reserve_photo($1)', [cid]),
      /Project photo capacity reached/,
    );
    await admin();
    await db.query('delete from public.photo_assets where id=$1', [photo]);
    await as(b);
    await assert.rejects(
      db.query('select public.reserve_photo($1)', [cid]),
      /Project photo rate reached/,
    );
    await as(a);
    const avatar = (await db.query('select public.reserve_avatar($1) id', [a])).rows[0].id;
    await admin();
    await db.query('update private.avatar_assets set purged_at=now() where id=$1', [avatar]);
    await as(b);
    await assert.rejects(
      db.query('select public.reserve_avatar($1)', [b]),
      /Project avatar rate reached/,
    );
    await admin();
    const c = randomUUID();
    await db.query('insert into auth.users values($1)', [c]);
    await as(c);
    await assert.rejects(
      db.query("insert into public.profiles(id,username,display_name) values($1,'carol','Carol')", [
        c,
      ]),
      /Project profile capacity reached/,
    );
    await admin();
    await db.query('delete from auth.users where id=$1', [a]);
    const usage = (await db.query('select * from private.project_daily_usage')).rows[0];
    assert.equal(usage.message_count, 1);
    assert.equal(usage.photo_count, 1);
    assert.equal(usage.avatar_count, 1);
    assert.equal(usage.profile_count, 2);
    assert.equal('actor' in usage, false, 'aggregate ledger contains no account identifiers');
    await assert.rejects(
      db.exec('update private.project_limits set photo_cap=401'),
      /check constraint/,
    );
  } finally {
    await db.close();
  }
});

test('capacity warnings identify storage or daily admission limits without leaking internal diagnostics', () => {
  assert.match(
    userErrorMessage({ message: 'Project photo capacity reached' }),
    /Photo storage is full/,
  );
  assert.match(
    userErrorMessage({ message: 'Project message rate reached' }),
    /daily message limit/,
  );
  assert.match(
    userErrorMessage({ message: 'Project profile capacity reached' }),
    /New profiles are temporarily unavailable/,
  );
});
