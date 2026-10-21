begin;

-- An abandoned upload gets a two-day grace period. Keep recent reservations so
-- cleanup cannot reset the existing rolling daily upload quota.
alter table public.photo_assets add column cleanup_requested_at timestamptz;
create index photo_assets_cleanup_age on public.photo_assets(created_at,id);

create function private.guard_photo_attachment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare asset public.photo_assets;
begin
  if new.photo_id is null then return new; end if;
  select * into asset from public.photo_assets where id=new.photo_id for update;
  if not found or asset.cleanup_requested_at is not null then
    raise exception 'Photo unavailable'; end if;
  return new;
end;
$$;
revoke all on function private.guard_photo_attachment() from public,anon,authenticated;
create trigger guard_photo_attachment before insert on public.messages
  for each row execute function private.guard_photo_attachment();

create function private.guard_cleanup_upload() returns trigger
language plpgsql security definer set search_path = '' as $$
declare asset public.photo_assets;
begin
  if new.bucket_id<>'chat-photos' or auth.role()='service_role' then return new; end if;
  select * into asset from public.photo_assets where path=new.name and owner_id=auth.uid() for update;
  if not found or asset.cleanup_requested_at is not null
    or asset.created_at<=now()-interval '1 hour' then
    raise exception 'Photo unavailable' using errcode='42501'; end if;
  return new;
end;
$$;
revoke all on function private.guard_cleanup_upload() from public,anon,authenticated;
create trigger guard_cleanup_upload before insert on storage.objects
  for each row execute function private.guard_cleanup_upload();

create function public.photo_cleanup_count() returns bigint
language sql stable security definer set search_path = '' as $$
  select count(*) from public.photo_assets a
    where a.created_at<now()-interval '48 hours'
      and not exists(select 1 from public.messages where photo_id=a.id);
$$;

create function public.claim_photo_cleanup(batch_size integer default 100)
returns table(id uuid,path text)
language plpgsql security definer set search_path = '' as $$
declare candidate uuid; asset public.photo_assets; claimed integer:=0;
begin
  if batch_size is null or batch_size<1 or batch_size>100 then raise exception 'Invalid batch size'; end if;
  for candidate in select a.id from public.photo_assets a
    where a.created_at<now()-interval '48 hours'
      and not exists(select 1 from public.messages m where m.photo_id=a.id)
    order by a.created_at,a.id limit batch_size*5
  loop
    select * into asset from public.photo_assets a where a.id=candidate for update skip locked;
    if not found then continue; end if;
    -- Separate statement after acquiring the lock: see any send that committed
    -- while we waited. The attachment trigger takes the same asset lock.
    if exists(select 1 from public.messages m where m.photo_id=asset.id) then continue; end if;
    update public.photo_assets a set cleanup_requested_at=coalesce(a.cleanup_requested_at,now())
      where a.id=asset.id;
    id:=asset.id; path:=asset.path; return next;
    claimed:=claimed+1;
    exit when claimed>=batch_size;
  end loop;
end;
$$;

create function public.finish_photo_cleanup(asset_ids uuid[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare removed integer;
begin
  if asset_ids is null or cardinality(asset_ids)<1 or cardinality(asset_ids)>100 then
    raise exception 'Invalid batch size'; end if;
  perform 1 from public.photo_assets where id=any(asset_ids) order by id for update;
  if exists(select 1 from public.photo_assets a where a.id=any(asset_ids)
    and (a.cleanup_requested_at is null
      or exists(select 1 from public.messages m where m.photo_id=a.id)
      or exists(select 1 from storage.objects o where o.bucket_id='chat-photos' and o.name=a.path))) then
    raise exception 'Physical cleanup is not complete'; end if;
  delete from public.photo_assets where id=any(asset_ids);
  get diagnostics removed=row_count;
  return removed;
end;
$$;
revoke all on function public.photo_cleanup_count(),public.claim_photo_cleanup(integer),
  public.finish_photo_cleanup(uuid[]) from public,anon,authenticated;
grant execute on function public.photo_cleanup_count(),public.claim_photo_cleanup(integer),
  public.finish_photo_cleanup(uuid[]) to service_role;
commit;
