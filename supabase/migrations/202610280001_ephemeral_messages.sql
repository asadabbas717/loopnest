begin;

alter table public.conversations add column retention_seconds integer
  check(retention_seconds between 3600 and 2592000 and retention_seconds % 3600 = 0);
alter table public.conversations add column retention_changed_at timestamptz;
alter table public.conversations add column retention_changed_by uuid references auth.users(id) on delete set null;
alter table public.messages add column expires_at timestamptz;
alter table public.messages add column view_once boolean not null default false;
alter table public.messages drop constraint messages_check;
alter table public.messages add constraint messages_content check(char_length(btrim(body))>0 or photo_id is not null or view_once);
alter table public.photo_assets add column view_once boolean not null default false;
alter table public.photo_assets add column opened_at timestamptz;
create index messages_expiration on public.messages(expires_at,id) where expires_at is not null;

-- No body, photo path, or digest is kept here. Thirty-day delivery tombstones
-- prevent stale retries from resurrecting deleted content and preserve quotas.
create table private.message_receipts (
  id uuid primary key,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sent_at timestamptz not null,
  removed_at timestamptz not null default now()
);
create index message_receipts_sender_time on private.message_receipts(sender_id,sent_at);
revoke all on private.message_receipts from public,anon,authenticated;

create function public.set_message_retention(cid uuid,seconds integer,expected_actor uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); chat public.conversations;
begin
  if actor is null or actor is distinct from expected_actor or not private.account_enabled(actor) then
    raise exception 'Session changed' using errcode='42501'; end if;
  if seconds is not null and (seconds<3600 or seconds>2592000 or seconds%3600<>0) then
    raise exception 'Invalid disappearing duration'; end if;
  perform 1 from public.profiles where id=actor for update;
  select * into chat from public.conversations where id=cid for update;
  if not found or not private.can_chat(cid) then raise exception 'Not authorized' using errcode='42501'; end if;
  if chat.retention_seconds is not distinct from seconds then return; end if;
  if chat.retention_changed_at>now()-interval '10 seconds' then raise exception 'Setting limit reached'; end if;
  update public.conversations set retention_seconds=seconds,retention_changed_at=now(),retention_changed_by=actor where id=cid;
end;
$$;

create function public.reserve_private_photo(cid uuid,one_time boolean,expected_actor uuid) returns public.photo_assets
language plpgsql security definer set search_path='' as $$
declare asset public.photo_assets;
begin
  if auth.uid() is null or auth.uid() is distinct from expected_actor then
    raise exception 'Session changed' using errcode='42501'; end if;
  asset:=public.reserve_photo(cid);
  update public.photo_assets set view_once=coalesce(one_time,false) where id=asset.id returning * into asset;
  return asset;
end;
$$;

create function private.stamp_message_privacy() returns trigger
language plpgsql security definer set search_path='' as $$
declare chat public.conversations;
begin
  select * into chat from public.conversations where id=new.conversation_id for update;
  if not found or chat.status<>'accepted' or new.sender_id not in (chat.initiator,chat.recipient)
    or private.is_blocked(chat.initiator,chat.recipient) then raise exception 'Not authorized' using errcode='42501'; end if;
  new.created_at:=statement_timestamp();
  new.expires_at:=case when chat.retention_seconds is null then null else new.created_at+make_interval(secs=>chat.retention_seconds) end;
  new.view_once:=false;
  if new.photo_id is not null then
    select a.view_once into new.view_once from public.photo_assets a where a.id=new.photo_id;
  end if;
  return new;
end;
$$;
revoke all on function private.stamp_message_privacy() from public,anon,authenticated;
create trigger a_stamp_message_privacy before insert on public.messages for each row execute function private.stamp_message_privacy();

create or replace function public.send_message(cid uuid,message_id uuid,content text,asset_id uuid default null,expected_sender uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); existing public.messages;
begin
  perform 1 from public.profiles where id=actor for update;
  if expected_sender is not null and expected_sender is distinct from actor then raise exception 'Session changed' using errcode='42501'; end if;
  if not private.can_chat(cid) then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into existing from public.messages where id=message_id;
  if found then
    if existing.expires_at<=statement_timestamp() then raise exception 'Message expired'; end if;
    if existing.sender_id=actor and existing.conversation_id=cid and existing.body=btrim(content) and existing.photo_id is not distinct from asset_id then return message_id; end if;
    raise exception 'Message identifier conflict';
  end if;
  if exists(select 1 from private.message_receipts where id=message_id) then raise exception 'Message expired'; end if;
  if (select count(*) from (
      select created_at t from public.messages where sender_id=actor and created_at>now()-interval '1 minute'
      union all select sent_at from private.message_receipts where sender_id=actor and sent_at>now()-interval '1 minute') s)>=30
    or (select count(*) from (
      select created_at t from public.messages where sender_id=actor and created_at>now()-interval '1 day'
      union all select sent_at from private.message_receipts where sender_id=actor and sent_at>now()-interval '1 day') s)>=500 then raise exception 'Message limit reached'; end if;
  if asset_id is not null and not exists(select 1 from public.photo_assets a join storage.objects o on o.bucket_id='chat-photos' and o.name=a.path
    where a.id=asset_id and a.owner_id=actor and a.conversation_id=cid) then raise exception 'Photo unavailable'; end if;
  insert into public.messages(id,conversation_id,sender_id,body,photo_id) values(message_id,cid,actor,btrim(content),asset_id);
  return message_id;
end;
$$;

drop policy message_read on public.messages;
create policy message_read on public.messages for select to authenticated using(private.can_chat(conversation_id) and (expires_at is null or expires_at>statement_timestamp()));

create function public.message_history(cid uuid,before_time timestamptz default null,before_id uuid default null)
returns table(id uuid,sender_id uuid,body text,photo_id uuid,created_at timestamptz,expires_at timestamptz,view_once boolean,server_time timestamptz)
language sql stable security invoker set search_path='' as $$
  select m.id,m.sender_id,m.body,m.photo_id,m.created_at,m.expires_at,m.view_once,statement_timestamp()
    from public.messages m where m.conversation_id=cid
      and ((before_time is null and before_id is null) or (m.created_at,m.id)<(before_time,before_id))
    order by m.created_at desc,m.id desc limit 40;
$$;
revoke all on function public.message_history(uuid,timestamptz,uuid) from public,anon;
grant execute on function public.message_history(uuid,timestamptz,uuid) to authenticated;

create function private.photo_content_live(asset uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.photo_assets a where a.id=asset and not a.view_once and a.cleanup_requested_at is null
    and (not exists(select 1 from public.messages m where m.photo_id=a.id) or exists(select 1 from public.messages m where m.photo_id=a.id and (m.expires_at is null or m.expires_at>statement_timestamp()))));
$$;
create policy photo_privacy on storage.objects as restrictive for select to authenticated
  using(bucket_id<>'chat-photos' or exists(select 1 from public.photo_assets a where a.path=name and private.photo_content_live(a.id)));
drop policy photo_download on storage.objects;
create policy photo_download on storage.objects for select to authenticated
  using(bucket_id='chat-photos' and exists(select 1 from public.photo_assets a where a.path=name and private.can_chat(a.conversation_id)
    and (a.owner_id=auth.uid() or exists(select 1 from public.messages m where m.photo_id=a.id))));
create function private.photo_metadata_live(asset uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.photo_assets a where a.id=asset and a.cleanup_requested_at is null
    and (not exists(select 1 from public.messages m where m.photo_id=a.id) or exists(select 1 from public.messages m where m.photo_id=a.id and (m.expires_at is null or m.expires_at>statement_timestamp()))));
$$;
create policy asset_privacy on public.photo_assets as restrictive for select to authenticated using(private.photo_metadata_live(id));

-- Only the trusted binary delivery function may claim an opening. No reusable
-- Storage URL or signed URL is returned to a recipient, sender, or moderator.
create function public.claim_one_time_photo(asset_id uuid,actor uuid) returns table(path text)
language plpgsql security definer set search_path='' as $$
declare asset public.photo_assets; chat public.conversations;
begin
  perform 1 from public.profiles where id=actor for update;
  select * into asset from public.photo_assets a where a.id=asset_id;
  if not found then raise exception 'Photo unavailable' using errcode='42501'; end if;
  select * into chat from public.conversations where id=asset.conversation_id for update;
  select * into asset from public.photo_assets a where a.id=asset_id for update;
  if not found or not private.account_enabled(actor) or chat.status<>'accepted' or private.is_blocked(chat.initiator,chat.recipient)
    or actor not in (chat.initiator,chat.recipient) or actor=asset.owner_id or not asset.view_once
    or asset.validated_at is null or asset.opened_at is not null or asset.cleanup_requested_at is not null
    or not exists(select 1 from public.messages m where m.photo_id=asset_id and (m.expires_at is null or m.expires_at>statement_timestamp())) then
    raise exception 'Photo unavailable' using errcode='42501'; end if;
  update public.photo_assets set opened_at=clock_timestamp() where id=asset_id;
  path:=asset.path; return next;
end;
$$;

create or replace function private.can_review_photo(asset uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select private.is_moderator() and private.photo_content_live(asset) and exists(select 1 from public.reports r join public.messages m on m.id=r.message_id where r.status='open' and m.photo_id=asset and (m.expires_at is null or m.expires_at>statement_timestamp()));
$$;
create or replace function public.moderation_queue()
-- Report submission also checks expiration, including security-definer calls.
returns table(id uuid,reason text,sender_id uuid,body text,photo_id uuid,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_moderator() then raise exception 'Not authorized' using errcode='42501'; end if;
  return query select r.id,r.reason,m.sender_id,m.body,case when m.view_once then null else m.photo_id end,r.created_at
    from public.reports r join public.messages m on m.id=r.message_id where r.status='open' and (m.expires_at is null or m.expires_at>statement_timestamp()) order by r.created_at limit 50;
end;
$$;

create function private.guard_report_expiration() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.messages where id=new.message_id and (expires_at is null or expires_at>statement_timestamp())) then
    raise exception 'Report unavailable' using errcode='42501'; end if;
  return new;
end;
$$;
revoke all on function private.guard_report_expiration() from public,anon,authenticated;
create trigger guard_report_expiration before insert on public.reports for each row execute function private.guard_report_expiration();

-- Freeze/mark, physically delete using Storage API, then finalize metadata.
create or replace function public.photo_cleanup_count() returns bigint
language sql stable security definer set search_path='' as $$
  select count(*) from public.photo_assets a where
    (a.created_at<now()-interval '48 hours' and not exists(select 1 from public.messages m where m.photo_id=a.id))
    or exists(select 1 from public.messages m where m.photo_id=a.id and m.expires_at<=statement_timestamp())
    or (a.view_once and a.opened_at<now()-interval '5 minutes');
$$;
create or replace function public.claim_photo_cleanup(batch_size integer default 100) returns table(id uuid,path text)
language plpgsql security definer set search_path='' as $$
declare candidate uuid; asset public.photo_assets; claimed integer:=0;
begin
  if batch_size is null or batch_size<1 or batch_size>100 then raise exception 'Invalid batch size'; end if;
  for candidate in select a.id from public.photo_assets a where
    (a.created_at<now()-interval '48 hours' and not exists(select 1 from public.messages m where m.photo_id=a.id))
    or exists(select 1 from public.messages m where m.photo_id=a.id and m.expires_at<=statement_timestamp())
    or (a.view_once and a.opened_at<now()-interval '5 minutes') order by a.created_at,a.id limit batch_size*5
  loop
    select * into asset from public.photo_assets a where a.id=candidate for update skip locked;
    if not found then continue; end if;
    if not ((asset.created_at<now()-interval '48 hours' and not exists(select 1 from public.messages m where m.photo_id=asset.id))
      or exists(select 1 from public.messages m where m.photo_id=asset.id and m.expires_at<=statement_timestamp())
      or (asset.view_once and asset.opened_at<now()-interval '5 minutes')) then continue; end if;
    update public.photo_assets a set cleanup_requested_at=coalesce(a.cleanup_requested_at,now()) where a.id=asset.id;
    id:=asset.id; path:=asset.path; return next;
    claimed:=claimed+1; exit when claimed>=batch_size;
  end loop;
end;
$$;
create or replace function public.finish_photo_cleanup(asset_ids uuid[]) returns integer
language plpgsql security definer set search_path='' as $$
declare removed integer;
begin
  if asset_ids is null or cardinality(asset_ids)<1 or cardinality(asset_ids)>100 then raise exception 'Invalid batch size'; end if;
  perform 1 from public.photo_assets where id=any(asset_ids) order by id for update;
  if exists(select 1 from public.photo_assets a where a.id=any(asset_ids) and (a.cleanup_requested_at is null
    or exists(select 1 from storage.objects o where o.bucket_id='chat-photos' and o.name=a.path)
    or exists(select 1 from public.messages m where m.photo_id=a.id and (m.expires_at is null or m.expires_at>statement_timestamp()) and not (a.view_once and a.opened_at<now()-interval '5 minutes')))) then raise exception 'Physical cleanup is not complete'; end if;
  insert into private.message_receipts(id,sender_id,conversation_id,sent_at)
    select id,sender_id,conversation_id,created_at from public.messages where photo_id=any(asset_ids) and expires_at<=statement_timestamp() on conflict do nothing;
  delete from public.messages where photo_id=any(asset_ids) and expires_at<=statement_timestamp();
  update public.messages set photo_id=null where photo_id=any(asset_ids) and view_once;
  delete from public.photo_assets where id=any(asset_ids);
  get diagnostics removed=row_count; return removed;
end;
$$;
create function public.purge_expired_messages(batch_size integer default 500) returns integer
language plpgsql security definer set search_path='' as $$
declare ids uuid[]; removed integer;
begin
  if batch_size is null or batch_size<1 or batch_size>500 then raise exception 'Invalid batch size'; end if;
  select array_agg(id) into ids from (select id from public.messages where expires_at<=statement_timestamp() and photo_id is null order by expires_at,id for update skip locked limit batch_size) x;
  insert into private.message_receipts(id,sender_id,conversation_id,sent_at)
    select id,sender_id,conversation_id,created_at from public.messages where id=any(ids) on conflict do nothing;
  delete from public.messages where id=any(ids);
  get diagnostics removed=row_count;
  delete from private.message_receipts where removed_at<now()-interval '30 days';
  return removed;
end;
$$;

revoke all on function private.photo_content_live(uuid),private.photo_metadata_live(uuid) from public,anon;
grant execute on function private.photo_content_live(uuid),private.photo_metadata_live(uuid) to authenticated;
revoke all on function public.set_message_retention(uuid,integer,uuid),public.reserve_private_photo(uuid,boolean,uuid) from public,anon;
grant execute on function public.set_message_retention(uuid,integer,uuid),public.reserve_private_photo(uuid,boolean,uuid) to authenticated;
revoke all on function public.claim_one_time_photo(uuid,uuid),public.purge_expired_messages(integer) from public,anon,authenticated;
grant execute on function public.claim_one_time_photo(uuid,uuid),public.purge_expired_messages(integer) to service_role;
alter publication supabase_realtime add table public.conversations;
commit;
