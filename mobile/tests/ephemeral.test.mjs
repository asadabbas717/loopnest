import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('server expiration, one-time claims, physical cleanup and delivery tombstones enforce privacy', async () => {
  const db = new PGlite();
  const alice = randomUUID(),
    bob = randomUUID(),
    eve = randomUUID();
  const as = async (id, role = 'authenticated') => {
    await db.exec(`reset role; set role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  };
  const admin = () => db.exec('reset role');
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.role() returns text language sql stable as $$select current_setting('role',true)$$;
      grant usage on schema auth,storage,public to authenticated,anon;
      grant execute on function auth.uid() to authenticated,anon;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,primary key(bucket_id,name));
      alter table storage.objects enable row level security;
      grant select,insert,update,delete on storage.objects to authenticated;
      create publication supabase_realtime;`);
    const dir = new URL('../../supabase/migrations/', import.meta.url);
    for (const file of readdirSync(dir)
      .filter((x) => x.endsWith('.sql'))
      .sort())
      await db.exec(readFileSync(new URL(file, dir), 'utf8'));
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
    await as(eve);
    await assert.rejects(db.query('select public.set_message_retention($1,3600,$2)', [cid, eve]));
    await as(alice);
    await assert.rejects(db.query('select public.set_message_retention($1,3600,$2)', [cid, bob]));
    for (const invalid of [0, 3599, 3601, 2595600])
      await assert.rejects(
        db.query('select public.set_message_retention($1,$2,$3)', [cid, invalid, alice]),
      );
    await db.query('select public.set_message_retention($1,3600,$2)', [cid, alice]);
    const textId = randomUUID();
    await db.query('select public.send_message($1,$2,$3,null,$4)', [
      cid,
      textId,
      'temporary text',
      alice,
    ]);
    const row = (await db.query('select * from public.messages where id=$1', [textId])).rows[0];
    assert.equal(new Date(row.expires_at) - new Date(row.created_at), 3600000);
    await assert.rejects(
      db.query('update public.messages set expires_at=null where id=$1', [textId]),
    );
    await admin();
    await db.query("update public.messages set expires_at=now()-interval '1 second' where id=$1", [
      textId,
    ]);
    for (const actor of [alice, bob, eve]) {
      await as(actor);
      assert.equal(
        (await db.query('select * from public.messages where id=$1', [textId])).rows.length,
        0,
      );
      await assert.rejects(db.query('select public.purge_expired_messages()'));
    }
    await as('', 'service_role');
    await db.query('select public.purge_expired_messages()');
    await admin();
    assert.equal(
      (await db.query('select * from public.messages where id=$1', [textId])).rows.length,
      0,
    );
    assert.equal(
      (await db.query('select id from private.message_receipts where id=$1', [textId])).rows.length,
      1,
    );
    await as(alice);
    await assert.rejects(
      db.query('select public.send_message($1,$2,$3,null,$4)', [
        cid,
        textId,
        'temporary text',
        alice,
      ]),
      /Message expired/,
    );
    await assert.rejects(db.query('select * from private.message_receipts'));

    async function photo(oneTime) {
      await as(alice);
      const asset = (
        await db.query('select * from public.reserve_private_photo($1,$2,$3)', [
          cid,
          oneTime,
          alice,
        ])
      ).rows[0];
      await admin();
      await db.query(
        'update public.photo_assets set validation_attempted_at=now(),validated_at=now() where id=$1',
        [asset.id],
      );
      await db.query("insert into storage.objects(bucket_id,name) values('chat-photos',$1)", [
        asset.path,
      ]);
      await as(alice);
      const id = randomUUID();
      await db.query('select public.send_message($1,$2,$3,$4,$5)', [cid, id, '', asset.id, alice]);
      return { ...asset, messageId: id };
    }
    const once = await photo(true);
    for (const actor of [alice, bob, eve]) {
      await as(actor);
      assert.equal(
        (await db.query('select * from storage.objects where name=$1', [once.path])).rows.length,
        0,
      );
      await assert.rejects(
        db.query('select * from public.claim_one_time_photo($1,$2)', [once.id, actor]),
      );
    }
    await as('', 'service_role');
    for (const actor of [alice, eve])
      await assert.rejects(
        db.query('select * from public.claim_one_time_photo($1,$2)', [once.id, actor]),
      );
    assert.equal(
      (await db.query('select * from public.claim_one_time_photo($1,$2)', [once.id, bob])).rows[0]
        .path,
      once.path,
    );
    await assert.rejects(
      db.query('select * from public.claim_one_time_photo($1,$2)', [once.id, bob]),
    );
    await admin();
    await db.query(
      "update public.photo_assets set opened_at=now()-interval '6 minutes' where id=$1",
      [once.id],
    );
    await as('', 'service_role');
    await db.query('select * from public.claim_photo_cleanup()');
    await assert.rejects(
      db.query('select public.finish_photo_cleanup($1)', [[once.id]]),
      /Physical cleanup/,
    );
    await admin();
    await db.query('delete from storage.objects where name=$1', [once.path]);
    await as('', 'service_role');
    await db.query('select public.finish_photo_cleanup($1)', [[once.id]]);
    await as(bob);
    const placeholder = (
      await db.query('select * from public.messages where id=$1', [once.messageId])
    ).rows[0];
    assert.equal(placeholder.view_once, true);
    assert.equal(placeholder.photo_id, null);

    const timed = await photo(false);
    await as(bob);
    assert.equal(
      (await db.query('select * from storage.objects where name=$1', [timed.path])).rows.length,
      1,
    );
    await admin();
    await db.query("update public.messages set expires_at=now()-interval '1 second' where id=$1", [
      timed.messageId,
    ]);
    for (const actor of [alice, bob]) {
      await as(actor);
      assert.equal(
        (await db.query('select * from storage.objects where name=$1', [timed.path])).rows.length,
        0,
      );
      assert.equal(
        (await db.query('select * from public.photo_assets where id=$1', [timed.id])).rows.length,
        0,
      );
    }
    await as('', 'service_role');
    await db.query('select * from public.claim_photo_cleanup()');
    await admin();
    await db.query('delete from storage.objects where name=$1', [timed.path]);
    await as('', 'service_role');
    await db.query('select public.finish_photo_cleanup($1)', [[timed.id]]);
    await admin();
    assert.equal(
      (await db.query('select * from public.messages where id=$1', [timed.messageId])).rows.length,
      0,
    );
    await db.query(
      'insert into private.message_receipts(id,sender_id,conversation_id,sent_at) select gen_random_uuid(),$1,$2,now() from generate_series(1,30)',
      [alice, cid],
    );
    await as(alice);
    await assert.rejects(
      db.query('select public.send_message($1,$2,$3,null,$4)', [
        cid,
        randomUUID(),
        'over quota',
        alice,
      ]),
      /Message limit/,
    );
  } finally {
    await db.close();
  }
});
