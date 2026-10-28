begin;
-- Content deletion must not reset the rolling daily reservation allowance.
-- No image, message, path or conversation identifier is retained here.
create table private.photo_quota_receipts (
  id uuid primary key, owner_id uuid not null references public.profiles(id) on delete cascade,
  reserved_at timestamptz not null
);
create index photo_quota_owner_time on private.photo_quota_receipts(owner_id,reserved_at);
revoke all on private.photo_quota_receipts from public,anon,authenticated;
create function private.remember_photo_quota() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.created_at>now()-interval '1 day' and exists(select 1 from public.profiles where id=old.owner_id) then
    insert into private.photo_quota_receipts(id,owner_id,reserved_at) values(old.id,old.owner_id,old.created_at) on conflict do nothing;
  end if;
  return old;
end;
$$;
revoke all on function private.remember_photo_quota() from public,anon,authenticated;
create trigger photo_quota_on_delete after delete on public.photo_assets for each row execute function private.remember_photo_quota();
create or replace function public.reserve_photo(cid uuid) returns public.photo_assets
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); asset public.photo_assets;
begin
  perform 1 from public.profiles where id=actor for update;
  if not private.can_chat(cid) then raise exception 'Not authorized' using errcode='42501'; end if;
  delete from private.photo_quota_receipts where owner_id=actor and reserved_at<=now()-interval '1 day';
  if (select count(*) from (
      select id from public.photo_assets where owner_id=actor and created_at>now()-interval '1 day'
      union all select id from private.photo_quota_receipts where owner_id=actor and reserved_at>now()-interval '1 day'
    ) reservations)>=20 or (select count(*) from public.photo_assets where owner_id=actor)>=100 then raise exception 'Photo limit reached'; end if;
  insert into public.photo_assets(owner_id,conversation_id) values(actor,cid) returning * into asset;
  return asset;
end;
$$;

-- A shared-clear worker owns the frozen conversation's entire cleanup scope.
create or replace function public.photo_cleanup_count() returns bigint
language sql stable security definer set search_path='' as $$
  select count(*) from public.photo_assets a where private.chat_not_clearing(a.conversation_id) and (
    (a.created_at<now()-interval '48 hours' and not exists(select 1 from public.messages m where m.photo_id=a.id))
    or exists(select 1 from public.messages m where m.photo_id=a.id and m.expires_at<=statement_timestamp())
    or (a.view_once and a.opened_at<now()-interval '5 minutes'));
$$;
create or replace function public.claim_photo_cleanup(batch_size integer default 100) returns table(id uuid,path text)
language plpgsql security definer set search_path='' as $$
declare candidate uuid; asset public.photo_assets; claimed integer:=0;
begin
  if batch_size is null or batch_size<1 or batch_size>100 then raise exception 'Invalid batch size'; end if;
  for candidate in select a.id from public.photo_assets a where private.chat_not_clearing(a.conversation_id) and (
    (a.created_at<now()-interval '48 hours' and not exists(select 1 from public.messages m where m.photo_id=a.id))
    or exists(select 1 from public.messages m where m.photo_id=a.id and m.expires_at<=statement_timestamp())
    or (a.view_once and a.opened_at<now()-interval '5 minutes')) order by a.created_at,a.id limit batch_size*5
  loop
    select * into asset from public.photo_assets a where a.id=candidate for update skip locked;
    if not found or not private.chat_not_clearing(asset.conversation_id) then continue; end if;
    if not ((asset.created_at<now()-interval '48 hours' and not exists(select 1 from public.messages m where m.photo_id=asset.id))
      or exists(select 1 from public.messages m where m.photo_id=asset.id and m.expires_at<=statement_timestamp())
      or (asset.view_once and asset.opened_at<now()-interval '5 minutes')) then continue; end if;
    update public.photo_assets a set cleanup_requested_at=coalesce(a.cleanup_requested_at,now()) where a.id=asset.id;
    id:=asset.id; path:=asset.path; return next;
    claimed:=claimed+1; exit when claimed>=batch_size;
  end loop;
end;
$$;
create function public.expired_text_cleanup_count() returns bigint
language sql stable security definer set search_path='' as $$
  select count(*) from public.messages where photo_id is null and expires_at<=statement_timestamp();
$$;
revoke all on function public.expired_text_cleanup_count() from public,anon,authenticated;
grant execute on function public.expired_text_cleanup_count() to service_role;
commit;
