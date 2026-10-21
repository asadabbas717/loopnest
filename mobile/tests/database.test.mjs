import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// Execute the actual migration and Postgres RLS as low-privilege roles.
// Auth UID and Storage tables emulate the platform boundary, not its HTTP services.
test('Postgres authorization: consent, outsiders, immutable identity, photos, blocking and limits', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.role() returns text language sql stable as $$select current_setting('role',true)$$;
      grant usage on schema auth, storage, public to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text, primary key(bucket_id,name));
      alter table storage.objects enable row level security;
      grant select,insert,update,delete on storage.objects to authenticated;
      create publication supabase_realtime;
    `);
    const migrationDirectory = new URL('../../supabase/migrations/', import.meta.url);
    for (const file of readdirSync(migrationDirectory)
      .filter((name) => name.endsWith('.sql'))
      .sort())
      await db.exec(readFileSync(new URL(file, migrationDirectory), 'utf8'));
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
    assert.equal(
      (await db.query("select * from public.friend_connections('active')")).rows[0].user_id,
      alice,
    );
    assert.equal(
      (await db.query("select * from public.friend_connections('active','alice')")).rows.length,
      0,
    );
    await as(eve);
    assert.equal(
      (await db.query("select * from public.friend_connections('active')")).rows.length,
      0,
    );
    await assert.rejects(
      db.query('select public.set_user_block($1,true,$2)', [alice, eve]),
      /Connection unavailable/,
    );
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
    await assert.rejects(
      db.query('insert into storage.objects(bucket_id,name) values($1,$2)', [
        'chat-photos',
        asset.path,
      ]),
    );
    await assert.rejects(
      db.query('select public.claim_photo_validation($1,$2)', [asset.id, alice]),
      /permission denied/,
    );
    await db.exec('reset role');
    await db.query('update public.photo_assets set validation_attempted_at=now() where id=$1', [
      asset.id,
    ]);
    await db.query('insert into storage.objects(bucket_id,name) values($1,$2)', [
      'chat-photos',
      asset.path,
    ]);
    await as(alice);
    await assert.rejects(
      db.query('select public.send_message($1,gen_random_uuid(),$2,$3)', [
        cid,
        'unvalidated',
        asset.id,
      ]),
      /Photo unavailable/,
    );
    await db.exec('reset role');
    await db.query('update public.photo_assets set validated_at=now() where id=$1', [asset.id]);
    await as(alice);
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
    // Cleanup is privileged, age-bounded, protects shared files, and cannot race
    // a new attachment once a reservation has been marked for physical deletion.
    const abandoned = (await db.query('select * from public.reserve_photo($1)', [cid])).rows[0];
    const empty = (await db.query('select * from public.reserve_photo($1)', [cid])).rows[0];
    const recent = (await db.query('select * from public.reserve_photo($1)', [cid])).rows[0];
    await db.exec('reset role');
    await db.query('update public.photo_assets set validation_attempted_at=now() where id=$1', [
      abandoned.id,
    ]);
    await db.query('insert into storage.objects(bucket_id,name) values($1,$2)', [
      'chat-photos',
      abandoned.path,
    ]);
    await as(alice);
    await assert.rejects(db.query('select public.photo_cleanup_count()'), /permission denied/);
    await as('', 'anon');
    await assert.rejects(db.query('select public.claim_photo_cleanup()'), /permission denied/);
    await db.exec('reset role');
    await db.query(
      "update public.photo_assets set created_at=now()-interval '72 hours' where id=any($1::uuid[])",
      [[asset.id, abandoned.id, empty.id]],
    );
    await as('', 'service_role');
    assert.equal(
      Number((await db.query('select public.photo_cleanup_count() as count')).rows[0].count),
      2,
    );
    await assert.rejects(db.query('select public.claim_photo_cleanup(101)'), /Invalid batch/);
    const claimed = (await db.query('select * from public.claim_photo_cleanup()')).rows;
    assert.deepEqual(new Set(claimed.map((row) => row.id)), new Set([abandoned.id, empty.id]));
    await assert.rejects(
      db.query('select public.finish_photo_cleanup($1::uuid[])', [[abandoned.id, empty.id]]),
      /Physical cleanup/,
    );
    await db.exec('reset role');
    await assert.rejects(
      db.query(
        'insert into public.messages(id,conversation_id,sender_id,photo_id) values(gen_random_uuid(),$1,$2,$3)',
        [cid, alice, abandoned.id],
      ),
      /Photo unavailable/,
    );
    // Simulates the Storage service removing bytes/metadata; production tooling
    // always uses Storage.remove(), never a direct storage.objects DELETE.
    await db.query('delete from storage.objects where name=$1', [abandoned.path]);
    await as('', 'service_role');
    assert.equal(
      (
        await db.query('select public.finish_photo_cleanup($1::uuid[]) as removed', [
          [abandoned.id, empty.id],
        ])
      ).rows[0].removed,
      2,
    );
    await db.exec('reset role');
    assert.equal(
      (
        await db.query('select id from public.photo_assets where id=any($1::uuid[])', [
          [asset.id, recent.id],
        ])
      ).rows.length,
      2,
    );
    await as(bob);
    await db.query('insert into public.blocks(blocker,blocked) values($1,$2)', [bob, alice]);
    assert.equal(
      (await db.query('select * from public.messages')).rows.length,
      0,
      'blocker loses chat access',
    );
    assert.equal((await db.query('select * from storage.objects')).rows.length, 0);
    await assert.rejects(db.query("select public.invite('alice')"), /Invitation unavailable/);
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
    await assert.rejects(db.query("select public.invite('bob')"), /Invitation unavailable/);
    await db.exec('reset role');
    await db.query('update public.photo_assets set validation_attempted_at=now() where id=$1', [
      recent.id,
    ]);
    await assert.rejects(
      db.query('insert into storage.objects(bucket_id,name) values($1,$2)', [
        'chat-photos',
        recent.path,
      ]),
      /Photo unavailable/,
      'trusted storage writes also respect a frozen/blocked conversation',
    );
    await as(alice);
    // Friends exposes only the caller's own block list, and unblocking cannot
    // override the peer's block or a changed authenticated identity.
    assert.equal(
      (await db.query("select * from public.friend_connections('active')")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from public.friend_connections('blocked')")).rows.length,
      0,
    );
    await assert.rejects(
      db.query('select public.set_user_block($1,false,$2)', [alice, bob]),
      /Session changed/,
    );
    await db.query('select public.set_user_block($1,true,$2)', [bob, alice]);
    assert.equal(
      (await db.query("select * from public.friend_connections('blocked')")).rows[0].user_id,
      bob,
    );
    await db.query('select public.set_user_block($1,false,$2)', [bob, alice]);
    assert.equal(
      (await db.query('select * from public.messages')).rows.length,
      0,
      'peer block still enforced',
    );
    await as(bob);
    await db.query('select public.set_user_block($1,false,$2)', [alice, bob]);
    await db.query('select public.set_user_block($1,false,$2)', [alice, bob]);
    assert.equal(
      (await db.query("select * from public.friend_connections('active')")).rows[0].user_id,
      alice,
    );
    assert.ok(
      (await db.query('select * from public.messages')).rows.length > 0,
      'consented chat restored',
    );
    await as('', 'anon');
    await assert.rejects(
      db.query("select * from public.friend_connections('active')"),
      /permission denied/,
    );
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
