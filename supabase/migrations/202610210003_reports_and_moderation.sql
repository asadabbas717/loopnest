begin;
create table private.moderators (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table private.suspended_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  suspended_at timestamptz not null default now()
);
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  reason text not null check (reason in ('harassment','spam','sexual_content','violence','other')),
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at timestamptz not null default now(),
  unique(reporter_id,message_id)
);
create index reports_queue on public.reports(status,created_at);
create index reports_reporter_time on public.reports(reporter_id,created_at);
create table private.moderation_audit (
  id uuid primary key default gen_random_uuid(),
  moderator_id uuid references auth.users(id) on delete set null,
  target_id uuid references auth.users(id) on delete set null,
  report_id uuid references public.reports(id) on delete set null,
  action text not null check (action in ('dismiss','resolve','suspend')),
  created_at timestamptz not null default now()
);
revoke all on private.moderators,private.suspended_accounts,private.moderation_audit from public,anon,authenticated;
alter table public.reports enable row level security;
revoke all on public.reports from public,anon,authenticated;
grant select on public.reports to authenticated;

create or replace function private.account_enabled(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select uid is not null and exists(select 1 from auth.users where id=uid)
    and not exists(select 1 from private.account_erasure where user_id=uid)
    and not exists(select 1 from private.suspended_accounts where user_id=uid);
$$;
create function private.is_moderator() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.account_enabled(auth.uid()) and exists(
    select 1 from private.moderators where user_id=auth.uid());
$$;
create function public.is_moderator() returns boolean
language sql stable security definer set search_path = '' as $$ select private.is_moderator(); $$;
create function public.set_moderator(target uuid,enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if enabled then
    insert into private.moderators(user_id) values(target) on conflict do nothing;
  else delete from private.moderators where user_id=target; end if;
end;
$$;
revoke all on function public.set_moderator(uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_moderator(uuid,boolean) to service_role;
create or replace function public.account_state() returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not authorized' using errcode='42501'; end if;
  if exists(select 1 from private.account_erasure where user_id=auth.uid()) then return 'erasing'; end if;
  if exists(select 1 from private.suspended_accounts where user_id=auth.uid()) then return 'suspended'; end if;
  return 'active';
end;
$$;

create policy reporter_read on public.reports for select to authenticated
  using(reporter_id=(select auth.uid()) and private.account_enabled((select auth.uid())));

create function public.report_message(mid uuid, category text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); target public.messages; rid uuid;
begin
  if not private.account_enabled(actor) then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.profiles where id=actor for update;
  select * into target from public.messages where id=mid;
  if not found or target.sender_id=actor or not exists(select 1 from public.conversations
    where id=target.conversation_id and status='accepted' and actor in (initiator,recipient)) then
    raise exception 'Report unavailable' using errcode='42501'; end if;
  if category not in ('harassment','spam','sexual_content','violence','other') or category is null then
    raise exception 'Invalid report category'; end if;
  select id into rid from public.reports where reporter_id=actor and message_id=mid;
  if rid is not null then return rid; end if;
  if (select count(*) from public.reports where reporter_id=actor and created_at>now()-interval '1 day')>=10 then
    raise exception 'Report limit reached'; end if;
  insert into public.reports(reporter_id,message_id,reason) values(actor,mid,category) returning id into rid;
  return rid;
end;
$$;

create function public.moderation_queue()
returns table(id uuid,reason text,sender_id uuid,body text,photo_id uuid,created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_moderator() then raise exception 'Not authorized' using errcode='42501'; end if;
  return query select r.id,r.reason,m.sender_id,m.body,m.photo_id,r.created_at
    from public.reports r join public.messages m on m.id=r.message_id
    where r.status='open' order by r.created_at limit 50;
end;
$$;
create function private.can_review_photo(asset uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_moderator() and exists(select 1 from public.reports r
    join public.messages m on m.id=r.message_id where r.status='open' and m.photo_id=asset);
$$;
create policy reported_asset_review on public.photo_assets for select to authenticated
  using(private.can_review_photo(id));
create policy reported_photo_review on storage.objects for select to authenticated
  using(bucket_id='chat-photos' and exists(select 1 from public.photo_assets a
    where a.path=name and private.can_review_photo(a.id)));

create function public.resolve_report(rid uuid,decision text) returns void
language plpgsql security definer set search_path = '' as $$
declare report public.reports; target uuid;
begin
  if not private.is_moderator() then raise exception 'Not authorized' using errcode='42501'; end if;
  if decision not in ('dismiss','resolve','suspend') or decision is null then raise exception 'Invalid moderation decision'; end if;
  select * into report from public.reports where id=rid for update;
  if not found then raise exception 'Report unavailable'; end if;
  if report.status<>'open' then return; end if;
  select sender_id into target from public.messages where id=report.message_id;
  if decision='suspend' then
    if exists(select 1 from private.moderators where user_id=target) then
      raise exception 'Privileged accounts require operator review'; end if;
    perform 1 from public.profiles where id=target for update;
    perform 1 from public.conversations where target in (initiator,recipient) order by id for update;
    insert into private.suspended_accounts(user_id) values(target) on conflict do nothing;
  end if;
  update public.reports set status=case when decision='dismiss' then 'dismissed' else 'resolved' end where id=rid;
  insert into private.moderation_audit(moderator_id,target_id,report_id,action)
    values(auth.uid(),target,rid,decision);
end;
$$;
revoke all on function private.is_moderator(),private.can_review_photo(uuid) from public,anon;
grant execute on function private.is_moderator(),private.can_review_photo(uuid) to authenticated;
revoke all on function public.is_moderator(),public.report_message(uuid,text),
  public.moderation_queue(),public.resolve_report(uuid,text) from public,anon;
grant execute on function public.is_moderator(),public.report_message(uuid,text),
  public.moderation_queue(),public.resolve_report(uuid,text) to authenticated;
commit;
