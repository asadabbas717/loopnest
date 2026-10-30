begin;

-- A repeated invitation is a new rate-limited attempt, not a new conversation.
-- No usernames, message bodies or recipient identifiers are retained here.
create table private.invitation_attempts (
  id uuid primary key default gen_random_uuid(),
  actor uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index invitation_attempts_actor_time on private.invitation_attempts(actor,created_at);
alter table private.invitation_attempts enable row level security;
revoke all on private.invitation_attempts from public,anon,authenticated;
insert into private.invitation_attempts(id,actor,created_at)
  select id,initiator,created_at from public.conversations
  where created_at > now()-interval '1 day';

create or replace function public.invite(recipient_username text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := auth.uid(); target uuid; existing public.conversations; cid uuid;
begin
  if actor_id is null then raise exception 'Not authorized' using errcode='42501'; end if;
  if not exists(select 1 from public.profiles where id=actor_id) then
    raise exception 'Create your profile first'; end if;
  select id into target from public.profiles where username=recipient_username;
  if target is null or target=actor_id then raise exception 'Invitation unavailable'; end if;
  -- Both directions serialize in the same order, including simultaneous resends.
  perform 1 from public.profiles where id in (actor_id,target) order by id for update;
  if private.is_blocked(actor_id,target) then raise exception 'Invitation unavailable'; end if;
  select * into existing from public.conversations
    where least(initiator,recipient)=least(actor_id,target)
      and greatest(initiator,recipient)=greatest(actor_id,target) for update;
  if existing.id is not null and existing.status <> 'declined' then return existing.id; end if;
  delete from private.invitation_attempts where invitation_attempts.actor=actor_id
    and created_at <= now()-interval '1 day';
  if exists(select 1 from private.invitation_attempts a where a.actor=actor_id
      and a.created_at>now()-interval '1 minute')
    or (select count(*) from private.invitation_attempts a where a.actor=actor_id)>=20
    then raise exception 'Invitation limit reached'; end if;
  insert into private.invitation_attempts(actor) values(actor_id);
  if existing.id is null then
    insert into public.conversations(initiator,recipient) values(actor_id,target) returning id into cid;
  else
    -- The person requesting now must wait for the other person's fresh consent.
    update public.conversations set initiator=actor_id,recipient=target,status='pending',created_at=now()
      where id=existing.id returning id into cid;
  end if;
  return cid;
end;
$$;
revoke all on function public.invite(text) from public,anon;
grant execute on function public.invite(text) to authenticated;

commit;
