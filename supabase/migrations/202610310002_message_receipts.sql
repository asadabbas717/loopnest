begin;

alter table public.profiles add column read_receipts boolean not null default false;
alter table public.conversations add column receipt_revision bigint not null default 0;
create table private.message_acknowledgements (
  message_id uuid primary key references public.messages(id) on delete cascade,
  seen boolean not null default false
);
alter table private.message_acknowledgements enable row level security;
revoke all on private.message_acknowledgements from public,anon,authenticated;

create function public.set_read_receipts(enabled boolean,expected_actor uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if actor is null or actor is distinct from expected_actor or not private.account_enabled(actor)
    or enabled is null then raise exception 'Not authorized' using errcode='42501'; end if;
  update public.profiles set read_receipts=enabled where id=actor and read_receipts is distinct from enabled;
  if found then
    update public.conversations set receipt_revision=receipt_revision+1
      where actor in (initiator,recipient) and status='accepted';
  end if;
end;
$$;

-- Metadata-only catch-up. No background push or always-on presence is claimed.
create function public.pending_delivery_ids(expected_actor uuid) returns setof uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if actor is null or actor is distinct from expected_actor or not private.account_enabled(actor)
    then raise exception 'Not authorized' using errcode='42501'; end if;
  return query with eligible as materialized (
    select c.id from public.conversations c where actor in (c.initiator,c.recipient)
      and private.can_chat(c.id)
  ) select m.id from eligible c join public.messages m on m.conversation_id=c.id where m.sender_id<>actor
    and private.can_chat(m.conversation_id) and (m.expires_at is null or m.expires_at>statement_timestamp())
    and not exists(select 1 from private.message_acknowledgements r where r.message_id=m.id)
    order by m.created_at,m.id limit 100;
end;
$$;

create function public.ack_message_receipts(message_ids uuid[],reading boolean,expected_actor uuid) returns void
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
        and private.can_chat(m.conversation_id) and (m.expires_at is null or m.expires_at>statement_timestamp())
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

-- Return states rather than activity timestamps. Seen is shared only by mutual opt-in.
create function public.message_delivery_status(cid uuid,message_ids uuid[])
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
    and (m.expires_at is null or m.expires_at>statement_timestamp());
$$;

revoke all on function public.set_read_receipts(boolean,uuid),public.pending_delivery_ids(uuid),
  public.ack_message_receipts(uuid[],boolean,uuid),public.message_delivery_status(uuid,uuid[]) from public,anon;
grant execute on function public.set_read_receipts(boolean,uuid),public.pending_delivery_ids(uuid),
  public.ack_message_receipts(uuid[],boolean,uuid),public.message_delivery_status(uuid,uuid[]) to authenticated;

commit;
