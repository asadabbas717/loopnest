begin;
alter table public.conversations add column clearing_at timestamptz;
alter table public.conversations add column cleared_at timestamptz;
create table private.chat_clears (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  created_at timestamptz not null default now(), finished_at timestamptz
);
create unique index chat_clear_active on private.chat_clears(conversation_id) where finished_at is null;
create table private.clear_attempts (
  id uuid primary key, job_id uuid not null references private.chat_clears(id) on delete cascade,
  actor uuid not null references auth.users(id) on delete cascade, created_at timestamptz not null default now()
);
revoke all on private.chat_clears,private.clear_attempts from public,anon,authenticated;
create or replace function private.can_chat(cid uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.conversations c where c.id=cid and c.status='accepted'
    and c.clearing_at is null and auth.uid() in(c.initiator,c.recipient) and not private.is_blocked(c.initiator,c.recipient));
$$;
create function private.chat_not_clearing(cid uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.conversations where id=cid and clearing_at is null);
$$;
revoke all on function private.chat_not_clearing(uuid) from public,anon;
grant execute on function private.chat_not_clearing(uuid) to authenticated;
create policy chat_clear_read on public.messages as restrictive for select to authenticated
  using(private.chat_not_clearing(conversation_id));
create function private.guard_chat_clear() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.conversations where id=new.conversation_id for update;
  if not private.chat_not_clearing(new.conversation_id) then raise exception 'Chat clearing' using errcode='42501'; end if;
  return new;
end;
$$;
revoke all on function private.guard_chat_clear() from public,anon,authenticated;
create trigger a0_chat_clear before insert on public.messages for each row execute function private.guard_chat_clear();
create trigger a0_chat_clear before insert on public.photo_assets for each row execute function private.guard_chat_clear();

create function public.begin_chat_clear(cid uuid,actor uuid,request_id uuid) returns table(job_id uuid,done boolean)
language plpgsql security definer set search_path='' as $$
declare chat public.conversations; prior private.chat_clears; attempt private.clear_attempts;
begin
  perform 1 from public.profiles where id=actor for update;
  select * into chat from public.conversations where id=cid for update;
  if not found or not private.account_enabled(actor) or actor not in(chat.initiator,chat.recipient)
    or chat.status<>'accepted' or private.is_blocked(chat.initiator,chat.recipient) or request_id is null then
    raise exception 'Not authorized' using errcode='42501'; end if;
  select * into attempt from private.clear_attempts where id=request_id;
  if found then
    select * into prior from private.chat_clears where id=attempt.job_id;
    if attempt.actor<>actor or prior.conversation_id<>cid then raise exception 'Not authorized' using errcode='42501'; end if;
    job_id:=prior.id; done:=prior.finished_at is not null; return next; return;
  end if;
  if (select count(*) from private.clear_attempts a where a.actor=begin_chat_clear.actor and a.created_at>now()-interval '1 day')>=30 then
    raise exception 'Clear limit reached'; end if;
  select * into prior from private.chat_clears where conversation_id=cid and finished_at is null;
  if not found then
    if exists(select 1 from private.chat_clears where conversation_id=cid and created_at>now()-interval '30 seconds') then
      raise exception 'Clear limit reached'; end if;
    insert into private.chat_clears(conversation_id) values(cid) returning * into prior;
    update public.conversations set clearing_at=now() where id=cid;
    update public.photo_assets set cleanup_requested_at=coalesce(cleanup_requested_at,now()) where conversation_id=cid;
  end if;
  insert into private.clear_attempts(id,job_id,actor) values(request_id,prior.id,actor);
  job_id:=prior.id; done:=false; return next;
end;
$$;
create function public.chat_clear_paths(clear_id uuid) returns table(path text)
language sql stable security definer set search_path='' as $$
  select a.path from public.photo_assets a join private.chat_clears j on j.conversation_id=a.conversation_id
  where j.id=clear_id and j.finished_at is null order by a.path;
$$;
create function public.finish_chat_clear(clear_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
  select conversation_id into cid from private.chat_clears where id=clear_id;
  if cid is null then raise exception 'Clear unavailable'; end if;
  perform 1 from public.conversations where id=cid for update;
  perform 1 from private.chat_clears where id=clear_id and finished_at is null for update;
  if not found then return; end if;
  if exists(select 1 from public.photo_assets a join storage.objects o on o.bucket_id='chat-photos' and o.name=a.path where a.conversation_id=cid) then
    raise exception 'Physical cleanup is not complete'; end if;
  insert into private.message_receipts(id,sender_id,conversation_id,sent_at)
    select id,sender_id,conversation_id,created_at from public.messages where conversation_id=cid on conflict do nothing;
  delete from public.messages where conversation_id=cid;
  delete from public.photo_assets where conversation_id=cid;
  update private.chat_clears set finished_at=now() where id=clear_id;
  update public.conversations set clearing_at=null,cleared_at=clock_timestamp() where id=cid;
  delete from private.chat_clears where finished_at<now()-interval '30 days';
end;
$$;
revoke all on function public.begin_chat_clear(uuid,uuid,uuid),public.chat_clear_paths(uuid),public.finish_chat_clear(uuid) from public,anon,authenticated;
grant execute on function public.begin_chat_clear(uuid,uuid,uuid),public.chat_clear_paths(uuid),public.finish_chat_clear(uuid) to service_role;
commit;
