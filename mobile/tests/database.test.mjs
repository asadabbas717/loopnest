import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// Execute the actual migration and Postgres RLS as low-privilege roles.
// Auth UID and Storage tables emulate the platform boundary, not its HTTP services.
test('Postgres authorization: consent, outsiders, immutable identity, photos, blocking and limits', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth, storage, public to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text, primary key(bucket_id,name));
      alter table storage.objects enable row level security;
      grant select,insert,update,delete on storage.objects to authenticated;
      create publication supabase_realtime;
    `);
    await db.exec(
      readFileSync(
        new URL('../../supabase/migrations/202610210001_private_chat.sql', import.meta.url),
        'utf8',
      ),
    );
    const alice = '00000000-0000-4000-8000-000000000001';
    const bob = '00000000-0000-4000-8000-000000000002';
    const eve = '00000000-0000-4000-8000-000000000003';
    const mid = '00000000-0000-4000-8000-000000000011';
    await db.exec(`insert into auth.users values ('${alice}'),('${bob}'),('${eve}');`);
    const as = async (id, role = 'authenticated') => {
      await db.exec(`reset role; set role ${role};`);
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    };
    for (const [id, name] of [
      [alice, 'alice'],
      [bob, 'bob'],
      [eve, 'eve'],
    ]) {
      await as(id);
      await db.query('insert into public.profiles(id,username,display_name) values($1,$2,$2)', [
        id,
        name,
      ]);
    }
    await as(alice);
    assert.equal(
      (await db.query('select * from public.profiles')).rows.length,
      1,
      'no public profile directory',
    );
    await assert.rejects(db.query('update public.profiles set id=$1 where id=$2', [bob, alice]));
    const cid = (await db.query("select public.invite('bob') as id")).rows[0].id;
    await assert.rejects(
      db.query('select public.respond_to_invite($1,true)', [cid]),
      /Invitation unavailable/,
    );
    await assert.rejects(
      db.query('select public.send_message($1,$2,$3,null)', [cid, mid, 'before consent']),
      /Not authorized/,
    );
    await assert.rejects(db.query('select public.reserve_photo($1)', [cid]), /Not authorized/);
    await assert.rejects(db.query('select public.invite($1)', ['eve']), /limit reached/);
    await as(eve);
    assert.equal((await db.query('select * from public.conversations')).rows.length, 0);
    await assert.rejects(db.query('select public.respond_to_invite($1,true)', [cid]));
    await assert.rejects(
      db.query(
        'insert into public.messages(id,conversation_id,sender_id,body) values($1,$2,$3,$4)',
        [mid, cid, alice, 'forged'],
      ),
    );
    await as(bob);
    await db.query('select public.respond_to_invite($1,true)', [cid]);
    await as(alice);
    await assert.rejects(
      db.query('select public.send_message($1,gen_random_uuid(),$2,null,$3)', [
        cid,
        'wrong session',
        bob,
      ]),
      /Session changed/,
    );
    await db.query('select public.send_message($1,$2,$3,null)', [cid, mid, 'hello']);
    await db.query('select public.send_message($1,$2,$3,null)', [cid, mid, 'hello']);
    assert.equal(
      (await db.query('select * from public.messages')).rows.length,
      1,
      'retry is idempotent',
    );
    await assert.rejects(
      db.query('select public.send_message($1,$2,$3,null)', [cid, mid, 'changed']),
      /conflict/,
    );
    await assert.rejects(db.query('update public.messages set body=$1', ['tampered']));
    const asset = (await db.query('select * from public.reserve_photo($1)', [cid])).rows[0];
    await assert.rejects(
      db.query('insert into storage.objects(bucket_id,name) values($1,$2)', [
        'chat-photos',
        'arbitrary.jpg',
      ]),
    );
    await db.query('insert into storage.objects(bucket_id,name) values($1,$2)', [
      'chat-photos',
      asset.path,
    ]);
    await db.query('update storage.objects set name=$1', ['overwritten.jpg']);
    assert.equal(
      (await db.query('select name from storage.objects')).rows[0].name,
      asset.path,
      'RLS prevents overwrite',
    );
    await as(bob);
    assert.equal(
      (await db.query('select * from storage.objects')).rows.length,
      0,
      'unattached upload is private to owner',
    );
    await assert.rejects(
      db.query('select public.send_message($1,gen_random_uuid(),$2,$3)', [cid, 'stolen', asset.id]),
      /Photo unavailable/,
    );
    await as(alice);
    await db.query('select public.send_message($1,gen_random_uuid(),$2,$3)', [
      cid,
      'photo',
      asset.id,
    ]);
    await as(bob);
    assert.equal((await db.query('select * from public.messages')).rows.length, 2);
    assert.equal((await db.query('select * from public.photo_assets')).rows.length, 1);
    assert.equal((await db.query('select * from storage.objects')).rows.length, 1);
    await as(eve);
    assert.equal((await db.query('select * from public.messages')).rows.length, 0);
    assert.equal((await db.query('select * from public.photo_assets')).rows.length, 0);
    assert.equal((await db.query('select * from storage.objects')).rows.length, 0);
    await assert.rejects(db.query('delete from public.messages'));
    await assert.rejects(
      db.query('select public.send_message($1,gen_random_uuid(),$2,null)', [cid, 'outsider']),
    );
    await as(alice);
    for (let i = 0; i < 28; i++)
      await db.query('select public.send_message($1,gen_random_uuid(),$2,null)', [
        cid,
        `message ${i}`,
      ]);
    await assert.rejects(
      db.query('select public.send_message($1,gen_random_uuid(),$2,null)', [cid, 'too many']),
      /limit reached/,
    );
    await as(bob);
    await db.query('insert into public.blocks(blocker,blocked) values($1,$2)', [bob, alice]);
    assert.equal(
      (await db.query('select * from public.messages')).rows.length,
      0,
      'blocker loses chat access',
    );
    assert.equal((await db.query('select * from storage.objects')).rows.length, 0);
    await as(alice);
    assert.equal(
      (await db.query('select * from public.messages')).rows.length,
      0,
      'blocked sender loses access',
    );
    await assert.rejects(
      db.query('select public.send_message($1,gen_random_uuid(),$2,null)', [cid, 'blocked']),
    );
    await assert.rejects(db.query('select public.reserve_photo($1)', [cid]));
    await as('', 'anon');
    await assert.rejects(db.query('select * from public.messages'));
    await assert.rejects(db.query('select public.invite($1)', ['bob']));
    await db.exec('reset role');
    const bucket = (await db.query('select * from storage.buckets')).rows[0];
    assert.equal(bucket.public, false);
    assert.equal(bucket.file_size_limit, 1048576);
  } finally {
    await db.close();
  }
});
