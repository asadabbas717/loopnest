begin;

create table private.account_erasure (
  user_id uuid primary key references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now()
);
revoke all on private.account_erasure from public, anon, authenticated;

create function private.account_enabled(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select uid is not null and exists(select 1 from auth.users where id=uid)
    and not exists(select 1 from private.account_erasure where user_id=uid);
$$;
revoke all on function private.account_enabled(uuid) from public, anon;
grant execute on function private.account_enabled(uuid) to authenticated;

create or replace function private.is_blocked(a uuid,b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not private.account_enabled(a) or not private.account_enabled(b) or exists(
    select 1 from public.blocks where (blocker=a and blocked=b) or (blocker=b and blocked=a));
$$;

create policy account_enabled on public.profiles as restrictive for all to authenticated
  using (private.account_enabled((select auth.uid()))) with check (private.account_enabled((select auth.uid())));
create policy account_enabled on public.conversations as restrictive for all to authenticated
  using (private.account_enabled((select auth.uid()))) with check (private.account_enabled((select auth.uid())));
create policy account_enabled on public.messages as restrictive for all to authenticated
  using (private.account_enabled((select auth.uid()))) with check (private.account_enabled((select auth.uid())));
create policy account_enabled on public.photo_assets as restrictive for all to authenticated
  using (private.account_enabled((select auth.uid()))) with check (private.account_enabled((select auth.uid())));
create policy account_enabled on public.blocks as restrictive for all to authenticated
  using (private.account_enabled((select auth.uid()))) with check (private.account_enabled((select auth.uid())));
create policy account_enabled on storage.objects as restrictive for all to authenticated
  using (bucket_id<>'chat-photos' or private.account_enabled((select auth.uid())))
  with check (bucket_id<>'chat-photos' or private.account_enabled((select auth.uid())));

create function public.account_state() returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not authorized' using errcode='42501'; end if;
  return case when exists(select 1 from private.account_erasure where user_id=auth.uid()) then 'erasing' else 'active' end;
end;
$$;
revoke all on function public.account_state() from public,anon;
grant execute on function public.account_state() to authenticated;

-- Only trusted server code can freeze an account and enumerate its erasure scope.
create function public.begin_account_erasure(actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from auth.users where id=actor) then raise exception 'Account unavailable'; end if;
  perform 1 from public.profiles where id=actor for update;
  perform 1 from public.conversations where actor in (initiator,recipient) order by id for update;
  insert into private.account_erasure(user_id) values(actor) on conflict do nothing;
end;
$$;
create function public.account_erasure_paths(actor uuid) returns table(path text)
language sql stable security definer set search_path = '' as $$
  select a.path from public.photo_assets a
  where exists(select 1 from private.account_erasure where user_id=actor)
    and (a.owner_id=actor or a.conversation_id in
      (select id from public.conversations where actor in (initiator,recipient)));
$$;
revoke all on function public.begin_account_erasure(uuid),public.account_erasure_paths(uuid)
  from public,anon,authenticated;
grant execute on function public.begin_account_erasure(uuid),public.account_erasure_paths(uuid) to service_role;

-- Serialize uploads with account freezing. Otherwise an in-flight upload could
-- finish after object enumeration and leave a physical orphan after account deletion.
create function private.guard_photo_upload() returns trigger
language plpgsql security definer set search_path = '' as $$
declare cid uuid;
begin
  if new.bucket_id<>'chat-photos' or auth.role()='service_role' then return new; end if;
  select conversation_id into cid from public.photo_assets where path=new.name and owner_id=auth.uid();
  if cid is null then raise exception 'Photo unavailable' using errcode='42501'; end if;
  perform 1 from public.conversations where id=cid for update;
  if not private.account_enabled(auth.uid()) or not private.can_chat(cid) then
    raise exception 'Not authorized' using errcode='42501'; end if;
  return new;
end;
$$;
revoke all on function private.guard_photo_upload() from public,anon,authenticated;
create trigger guard_photo_upload before insert on storage.objects
  for each row execute function private.guard_photo_upload();
commit;
