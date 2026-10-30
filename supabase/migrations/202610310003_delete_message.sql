begin;

create table private.message_deletions (
  message_id uuid primary key,
  actor uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  asset_id uuid,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index message_deletions_pending on private.message_deletions(conversation_id,actor) where finished_at is null;
revoke all on private.message_deletions from public,anon,authenticated;
alter table private.message_deletions enable row level security;

create function private.message_available(mid uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select not exists(select 1 from private.message_deletions where message_id=mid);
$$;
revoke all on function private.message_available(uuid) from public,anon;
grant execute on function private.message_available(uuid) to authenticated;
create policy message_deletion_read on public.messages as restrictive for select to authenticated
  using(private.message_available(id));

create function public.begin_message_delete(cid uuid,mid uuid,actor uuid) returns table(done boolean,path text)
language plpgsql security definer set search_path='' as $$
declare chat public.conversations; item public.messages; job private.message_deletions;
begin
  perform 1 from public.profiles where id=actor for update;
  select * into chat from public.conversations where id=cid for update;
  if not found or not private.account_enabled(actor) or actor not in(chat.initiator,chat.recipient)
    or chat.status<>'accepted' or chat.clearing_at is not null or private.is_blocked(chat.initiator,chat.recipient)
    then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into job from private.message_deletions where message_id=mid;
  if found then
    if job.actor<>actor or job.conversation_id<>cid then raise exception 'Not authorized' using errcode='42501'; end if;
  else
    select * into item from public.messages where id=mid and conversation_id=cid and sender_id=actor for update;
    if not found then raise exception 'Message unavailable' using errcode='42501'; end if;
    insert into private.message_deletions(message_id,actor,conversation_id,asset_id)
      values(mid,actor,cid,item.photo_id) returning * into job;
    update public.photo_assets set cleanup_requested_at=coalesce(cleanup_requested_at,now()) where id=item.photo_id;
    update public.conversations set receipt_revision=receipt_revision+1 where id=cid;
  end if;
  done:=job.finished_at is not null;
  select a.path into path from public.photo_assets a where a.id=job.asset_id and not done;
  return next;
end;
$$;

create function public.finish_message_delete(mid uuid) returns void
language plpgsql security definer set search_path='' as $$
declare job private.message_deletions; cid uuid;
begin
  select conversation_id into cid from private.message_deletions where message_id=mid;
  if cid is null then raise exception 'Message unavailable'; end if;
  perform 1 from public.conversations where id=cid for update;
  select * into job from private.message_deletions where message_id=mid for update;
  if job.finished_at is not null then return; end if;
  if exists(select 1 from public.photo_assets a join storage.objects o on o.bucket_id='chat-photos' and o.name=a.path where a.id=job.asset_id)
    then raise exception 'Physical cleanup is not complete'; end if;
  insert into private.message_receipts(id,sender_id,conversation_id,sent_at)
    select id,sender_id,conversation_id,created_at from public.messages where id=mid on conflict do nothing;
  delete from public.messages where id=mid;
  delete from public.photo_assets where id=job.asset_id;
  update private.message_deletions set finished_at=now(),asset_id=null where message_id=mid;
  update public.conversations set receipt_revision=receipt_revision+1 where id=cid;
  delete from private.message_deletions where finished_at<now()-interval '30 days';
end;
$$;

create function public.pending_message_deletions(cid uuid,expected_actor uuid) returns setof uuid
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is distinct from expected_actor or not private.can_chat(cid) then
    raise exception 'Not authorized' using errcode='42501'; end if;
  return query select d.message_id from private.message_deletions d where d.conversation_id=cid
    and d.actor=auth.uid() and d.finished_at is null order by d.created_at limit 50;
end;
$$;
revoke all on function public.begin_message_delete(uuid,uuid,uuid),public.finish_message_delete(uuid) from public,anon,authenticated;
grant execute on function public.begin_message_delete(uuid,uuid,uuid),public.finish_message_delete(uuid) to service_role;
revoke all on function public.pending_message_deletions(uuid,uuid) from public,anon;
grant execute on function public.pending_message_deletions(uuid,uuid) to authenticated;

create or replace function private.guard_report_expiration() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.messages where id=new.message_id and private.message_available(id)
    and (expires_at is null or expires_at>statement_timestamp())) then
    raise exception 'Report unavailable' using errcode='42501'; end if;
  return new;
end;
$$;
create or replace function public.moderation_queue()
returns table(id uuid,reason text,sender_id uuid,body text,photo_id uuid,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_moderator() then raise exception 'Not authorized' using errcode='42501'; end if;
  return query select r.id,r.reason,m.sender_id,m.body,case when m.view_once then null else m.photo_id end,r.created_at
    from public.reports r join public.messages m on m.id=r.message_id where r.status='open'
      and private.message_available(m.id) and (m.expires_at is null or m.expires_at>statement_timestamp()) order by r.created_at limit 50;
end;
$$;

-- Receipt RPCs are definers: apply the same pending-deletion visibility gate.

create or replace function public.pending_delivery_ids(expected_actor uuid) returns setof uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if actor is null or actor is distinct from expected_actor or not private.account_enabled(actor)
    then raise exception 'Not authorized' using errcode='42501'; end if;
  return query with eligible as materialized (
    select c.id from public.conversations c where actor in (c.initiator,c.recipient)
      and private.can_chat(c.id)
  ) select m.id from eligible c join public.messages m on m.conversation_id=c.id where m.sender_id<>actor
    and private.can_chat(m.conversation_id) and private.message_available(m.id) and (m.expires_at is null or m.expires_at>statement_timestamp())
    and not exists(select 1 from private.message_acknowledgements r where r.message_id=m.id)
    order by m.created_at,m.id limit 100;
end;
$$;

create or replace function public.ack_message_receipts(message_ids uuid[],reading boolean,expected_actor uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); share boolean;
begin
  if actor is null or actor is distinct from expected_actor or not private.account_enabled(actor)
    then raise exception 'Not authorized' using errcode='42501'; end if;
  if message_ids is null or cardinality(message_ids)<1 or cardinality(message_ids)>100 or reading is null
    then raise exception 'Invalid receipt request'; end if;
  select read_receipts into share from public.profiles where id=actor;
  with changed as (
    insert into private.message_acknowledgements(message_id,seen)
      select m.id,reading and coalesce(share,false)
      from public.messages m where m.id=any(message_ids) and m.sender_id<>actor
        and private.can_chat(m.conversation_id) and private.message_available(m.id) and (m.expires_at is null or m.expires_at>statement_timestamp())
    on conflict(message_id) do update set seen=true
      where excluded.seen and not message_acknowledgements.seen
    returning message_id
  ), affected as (
    select distinct m.conversation_id from changed join public.messages m on m.id=changed.message_id
  )
  update public.conversations c set receipt_revision=receipt_revision+1
    where c.id in (select conversation_id from affected);
end;
$$;

create or replace function public.message_delivery_status(cid uuid,message_ids uuid[])
returns table(message_id uuid,delivery text)
language sql stable security definer set search_path='' as $$
  select m.id,case when r.message_id is null then 'sent'
    when r.seen and sender.read_receipts and recipient.read_receipts then 'seen' else 'delivered' end
  from public.messages m
    join public.conversations c on c.id=m.conversation_id
    join public.profiles sender on sender.id=m.sender_id
    join public.profiles recipient on recipient.id=case when c.initiator=m.sender_id then c.recipient else c.initiator end
    left join private.message_acknowledgements r on r.message_id=m.id
  where m.conversation_id=cid and m.id=any(message_ids) and cardinality(message_ids)<=100
    and m.sender_id=auth.uid() and private.can_chat(cid)
    and private.message_available(m.id) and (m.expires_at is null or m.expires_at>statement_timestamp());
$$;

commit;
