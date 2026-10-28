import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
export async function databaseFixture() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql stable as $$select current_setting('role',true)$$;
    grant usage on schema auth,storage,public to authenticated,anon,service_role;
    grant execute on function auth.uid() to authenticated,anon;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,primary key(bucket_id,name));
    alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to authenticated,service_role;
    create publication supabase_realtime;`);
  const actual = new URL('../../../supabase/migrations/', import.meta.url);
  for (const name of readdirSync(actual)
    .filter((x) => x.endsWith('.sql'))
    .sort())
    await db.exec(readFileSync(new URL(name, actual), 'utf8'));
  return {
    db,
    as: async (id, role = 'authenticated') => {
      await db.exec(`reset role; set role ${role}`);
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    },
    admin: () => db.exec('reset role'),
  };
}
