begin;

revoke create on schema public from public;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z][a-z0-9_]{2,23}$'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  created_at timestamptz not null default now()
);
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  initiator uuid not null references public.profiles(id) on delete cascade,
  recipient uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  check (initiator <> recipient)
);
create unique index conversation_pair on public.conversations
  (least(initiator, recipient), greatest(initiator, recipient));
create index conversations_recipient on public.conversations(recipient, created_at desc);
create index conversations_initiator on public.conversations(initiator, created_at desc);

create table public.blocks (
  blocker uuid not null references public.profiles(id) on delete cascade,
  blocked uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked), check (blocker <> blocked)
);
create index blocks_reverse on public.blocks(blocked, blocker);

create table public.photo_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  created_at timestamptz not null default now(),
  path text generated always as (
    owner_id::text || '/' || conversation_id::text || '/' || id::text || '.jpg'
  ) stored unique
);
create index photo_assets_owner_time on public.photo_assets(owner_id, created_at desc);
create table public.messages (
  id uuid primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '' check (char_length(body) <= 4000),
  photo_id uuid unique references public.photo_assets(id),
  created_at timestamptz not null default now(),
  check (char_length(btrim(body)) > 0 or photo_id is not null)
);
create index messages_history on public.messages(conversation_id, created_at desc, id desc);
create index messages_sender_time on public.messages(sender_id, created_at desc);

-- Helpers are outside the exposed API schema. Definers have fixed search paths.
create function private.is_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.blocks
    where (blocker = a and blocked = b) or (blocker = b and blocked = a));
$$;
create function private.can_chat(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.conversations c
    where c.id = cid and c.status = 'accepted'
    and (select auth.uid()) in (c.initiator, c.recipient)
    and not private.is_blocked(c.initiator, c.recipient));
$$;
create function private.can_view_profile(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select other = (select auth.uid()) or exists(
    select 1 from public.conversations c
    where (select auth.uid()) in (c.initiator, c.recipient)
    and other in (c.initiator, c.recipient)
    and c.status <> 'declined' and not private.is_blocked(c.initiator,c.recipient));
$$;
revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.blocks enable row level security;
alter table public.photo_assets enable row level security;
alter table public.messages enable row level security;
revoke all on public.profiles, public.conversations, public.blocks, public.photo_assets, public.messages
  from anon, authenticated;
grant select on public.profiles, public.conversations, public.blocks, public.photo_assets, public.messages
  to authenticated;
grant insert (id,username,display_name) on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant insert (blocker, blocked) on public.blocks to authenticated;
grant delete on public.blocks to authenticated;

create policy profile_read on public.profiles for select to authenticated
  using (private.can_view_profile(id));
create policy profile_create on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy profile_edit on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy conversation_read on public.conversations for select to authenticated
  using ((select auth.uid()) in (initiator,recipient)
    and not private.is_blocked(initiator,recipient));
create policy block_read on public.blocks for select to authenticated
  using (blocker = (select auth.uid()));
create policy block_create on public.blocks for insert to authenticated
  with check (blocker = (select auth.uid()) and exists(
    select 1 from public.conversations c where (select auth.uid()) in (c.initiator,c.recipient)
    and blocked in (c.initiator,c.recipient)));
create policy block_remove on public.blocks for delete to authenticated
  using (blocker = (select auth.uid()));
create policy message_read on public.messages for select to authenticated
  using (private.can_chat(conversation_id));
create policy asset_read on public.photo_assets for select to authenticated
  using (owner_id = (select auth.uid()) or
    (private.can_chat(conversation_id) and exists(select 1 from public.messages m where m.photo_id = photo_assets.id)));

create function public.invite(recipient_username text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); target uuid; cid uuid;
begin
  if actor is null then raise exception 'Not authorized' using errcode='42501'; end if;
  -- Serialize per-account invites and rate checks; clients cannot bypass these via table INSERT.
  perform 1 from public.profiles where id = actor for update;
  if not found then raise exception 'Create your profile first'; end if;
  select id into target from public.profiles where username = recipient_username;
  if target is null or target = actor or private.is_blocked(actor,target) then
    raise exception 'Invitation unavailable'; end if;
  select id into cid from public.conversations
    where least(initiator,recipient)=least(actor,target)
      and greatest(initiator,recipient)=greatest(actor,target);
  if cid is not null then
    if exists(select 1 from public.conversations where id=cid and status='declined') then
      raise exception 'Invitation unavailable'; end if;
    return cid;
  end if;
  if exists(select 1 from public.conversations where initiator=actor and created_at>now()-interval '1 minute')
    or (select count(*) from public.conversations where initiator=actor and created_at>now()-interval '1 day')>=20
    then raise exception 'Invitation limit reached'; end if;
  insert into public.conversations(initiator,recipient) values(actor,target) returning id into cid;
  return cid;
end;
$$;

create function public.respond_to_invite(cid uuid, accept_invite boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.conversations set status = case when accept_invite then 'accepted' else 'declined' end
  where id=cid and recipient=(select auth.uid()) and status='pending'
    and not private.is_blocked(initiator,recipient);
  if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
end;
$$;

create function public.reserve_photo(cid uuid) returns public.photo_assets
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); asset public.photo_assets;
begin
  perform 1 from public.profiles where id=actor for update;
  if not private.can_chat(cid) then raise exception 'Not authorized' using errcode='42501'; end if;
  if (select count(*) from public.photo_assets where owner_id=actor and created_at>now()-interval '1 day')>=20
    or (select count(*) from public.photo_assets where owner_id=actor)>=100 then
    raise exception 'Photo limit reached'; end if;
  insert into public.photo_assets(owner_id,conversation_id) values(actor,cid) returning * into asset;
  return asset;
end;
$$;

create function public.send_message(cid uuid, message_id uuid, content text, asset_id uuid default null, expected_sender uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); existing public.messages;
begin
  perform 1 from public.profiles where id=actor for update;
  if expected_sender is not null and expected_sender <> actor then
    raise exception 'Session changed' using errcode='42501'; end if;
  if not private.can_chat(cid) then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into existing from public.messages where id=message_id;
  if found then
    if existing.sender_id=actor and existing.conversation_id=cid
      and existing.body=btrim(content) and existing.photo_id is not distinct from asset_id then
      return message_id;
    end if;
    raise exception 'Message identifier conflict';
  end if;
  if (select count(*) from public.messages where sender_id=actor and created_at>now()-interval '1 minute')>=30
    or (select count(*) from public.messages where sender_id=actor and created_at>now()-interval '1 day')>=500
    then raise exception 'Message limit reached'; end if;
  if asset_id is not null and not exists(select 1 from public.photo_assets a
    join storage.objects o on o.bucket_id='chat-photos' and o.name=a.path
    where a.id=asset_id and a.owner_id=actor and a.conversation_id=cid) then
    raise exception 'Photo unavailable'; end if;
  insert into public.messages(id,conversation_id,sender_id,body,photo_id)
    values(message_id,cid,actor,btrim(content),asset_id);
  return message_id;
end;
$$;

revoke all on function public.invite(text), public.respond_to_invite(uuid,boolean),
  public.reserve_photo(uuid), public.send_message(uuid,uuid,text,uuid,uuid) from public, anon;
grant execute on function public.invite(text), public.respond_to_invite(uuid,boolean),
  public.reserve_photo(uuid), public.send_message(uuid,uuid,text,uuid,uuid) to authenticated;

-- Private, JPEG-only, 1 MiB max. No object UPDATE means no overwrite attacks.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('chat-photos','chat-photos',false,1048576,array['image/jpeg']);
create policy photo_upload on storage.objects for insert to authenticated
  with check (bucket_id='chat-photos' and exists(select 1 from public.photo_assets a
    where a.path=name and a.owner_id=(select auth.uid())
    and a.created_at>now()-interval '1 hour' and private.can_chat(a.conversation_id)));
create policy photo_download on storage.objects for select to authenticated
  using (bucket_id='chat-photos' and exists(select 1 from public.photo_assets a
    where a.path=name and (a.owner_id=(select auth.uid()) or
      (private.can_chat(a.conversation_id) and exists(select 1 from public.messages m where m.photo_id=a.id)))));
create policy photo_owner_delete on storage.objects for delete to authenticated
  using (bucket_id='chat-photos' and exists(select 1 from public.photo_assets a
    where a.path=name and a.owner_id=(select auth.uid())));

alter publication supabase_realtime add table public.messages;
commit;
