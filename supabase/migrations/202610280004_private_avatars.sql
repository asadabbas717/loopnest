begin;
alter table public.profiles add column avatar_id uuid;
create table private.avatar_assets (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), attempted_at timestamptz, validated_at timestamptz,
  retired_at timestamptz, purged_at timestamptz,
  path text generated always as (owner_id::text || '/' || id::text || '.jpg') stored unique
);
create index avatar_owner_time on private.avatar_assets(owner_id,created_at);
revoke all on private.avatar_assets from public,anon,authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('profile-photos','profile-photos',false,262144,array['image/jpeg']);
create function private.can_view_avatar(object_path text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from private.avatar_assets a join public.profiles p on p.id=a.owner_id and p.avatar_id=a.id
    where a.path=object_path and a.validated_at is not null and a.retired_at is null and a.purged_at is null
    and private.account_enabled(a.owner_id) and private.account_enabled(auth.uid()) and
      (a.owner_id=auth.uid() or exists(select 1 from public.conversations c where c.status='accepted'
        and auth.uid() in(c.initiator,c.recipient) and a.owner_id in(c.initiator,c.recipient)
        and not private.is_blocked(c.initiator,c.recipient))));
$$;
revoke all on function private.can_view_avatar(text) from public,anon;
grant execute on function private.can_view_avatar(text) to authenticated;
create policy avatar_read on storage.objects for select to authenticated
  using(bucket_id='profile-photos' and private.can_view_avatar(name));
create function public.reserve_avatar(expected_actor uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); asset_id uuid;
begin
  if actor is null or actor is distinct from expected_actor or not private.account_enabled(actor) then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.profiles where id=actor for update;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  delete from private.avatar_assets where owner_id=actor and purged_at<now()-interval '30 days';
  if (select count(*) from private.avatar_assets where owner_id=actor and created_at>now()-interval '1 day')>=5
    or (select count(*) from private.avatar_assets where owner_id=actor and purged_at is null)>=20 then raise exception 'Avatar limit reached'; end if;
  insert into private.avatar_assets(owner_id) values(actor) returning id into asset_id; return asset_id;
end;
$$;
create function public.claim_avatar_upload(asset_id uuid,actor uuid) returns table(id uuid,path text)
language plpgsql security definer set search_path='' as $$
declare asset private.avatar_assets;
begin
  perform 1 from public.profiles where public.profiles.id=actor for update;
  select * into asset from private.avatar_assets a where a.id=asset_id and a.owner_id=actor for update;
  if not found or not private.account_enabled(actor) or asset.attempted_at is not null or asset.retired_at is not null or asset.purged_at is not null or asset.created_at<=now()-interval '1 hour' then
    raise exception 'Photo unavailable' using errcode='42501'; end if;
  update private.avatar_assets a set attempted_at=now() where a.id=asset_id;
  id:=asset.id; path:=asset.path; return next;
end;
$$;
create function private.guard_avatar_upload() returns trigger
language plpgsql security definer set search_path='' as $$
declare asset private.avatar_assets;
begin
  if new.bucket_id<>'profile-photos' then return new; end if;
  select * into asset from private.avatar_assets where path=new.name;
  if not found then raise exception 'Photo unavailable' using errcode='42501'; end if;
  perform 1 from public.profiles where id=asset.owner_id for update;
  select * into asset from private.avatar_assets where path=new.name for update;
  if not found or not private.account_enabled(asset.owner_id) or asset.attempted_at is null or asset.validated_at is not null
    or asset.retired_at is not null or asset.purged_at is not null or asset.created_at<=now()-interval '1 hour'
    or auth.role()<>'service_role' then raise exception 'Photo unavailable' using errcode='42501'; end if;
  return new;
end;
$$;
revoke all on function private.guard_avatar_upload() from public,anon,authenticated;
create trigger avatar_upload_guard before insert or update on storage.objects for each row execute function private.guard_avatar_upload();
create function public.finish_avatar_upload(asset_id uuid,actor uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.profiles where id=actor for update;
  if not private.account_enabled(actor) then raise exception 'Photo unavailable'; end if;
  perform 1 from private.avatar_assets a where a.id=asset_id and a.owner_id=actor and a.attempted_at is not null
    and a.retired_at is null and a.purged_at is null and a.validated_at is null and a.created_at>now()-interval '1 hour'
    and exists(select 1 from storage.objects o where o.bucket_id='profile-photos' and o.name=a.path) for update;
  if not found then raise exception 'Photo unavailable'; end if;
  update private.avatar_assets set retired_at=coalesce(retired_at,now()) where owner_id=actor and id<>asset_id and purged_at is null;
  update private.avatar_assets set validated_at=now() where id=asset_id;
  update public.profiles set avatar_id=asset_id where id=actor;
end;
$$;
create function public.retire_avatar(actor uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.profiles where id=actor for update;
  if not private.account_enabled(actor) then raise exception 'Not authorized' using errcode='42501'; end if;
  update public.profiles set avatar_id=null where id=actor;
  update private.avatar_assets set retired_at=coalesce(retired_at,now()) where owner_id=actor and purged_at is null;
end;
$$;
create function public.avatar_cleanup_paths(actor uuid,erasing boolean default false) returns table(id uuid,path text)
language plpgsql stable security definer set search_path='' as $$
begin
  if erasing and not exists(select 1 from private.account_erasure where user_id=actor) then raise exception 'Not authorized' using errcode='42501'; end if;
  return query select a.id,a.path from private.avatar_assets a where a.owner_id=actor and a.purged_at is null
    and (erasing or a.retired_at is not null or (a.created_at<=now()-interval '1 hour' and not exists(select 1 from public.profiles p where p.avatar_id=a.id))) order by a.id;
end;
$$;
create function public.finish_avatar_cleanup(asset_ids uuid[]) returns void
language plpgsql security definer set search_path='' as $$
begin
  if asset_ids is null or cardinality(asset_ids)<1 or cardinality(asset_ids)>20 then raise exception 'Invalid batch size'; end if;
  perform 1 from private.avatar_assets where id=any(asset_ids) order by id for update;
  if exists(select 1 from private.avatar_assets a where a.id=any(asset_ids) and (exists(select 1 from public.profiles p where p.avatar_id=a.id)
    or exists(select 1 from storage.objects o where o.bucket_id='profile-photos' and o.name=a.path)
    or (a.retired_at is null and a.created_at>now()-interval '1 hour'))) then raise exception 'Physical cleanup is not complete'; end if;
  update private.avatar_assets set purged_at=now() where id=any(asset_ids);
end;
$$;
revoke all on function public.reserve_avatar(uuid) from public,anon;
grant execute on function public.reserve_avatar(uuid) to authenticated;
revoke all on function public.claim_avatar_upload(uuid,uuid),public.finish_avatar_upload(uuid,uuid),public.retire_avatar(uuid),public.avatar_cleanup_paths(uuid,boolean),public.finish_avatar_cleanup(uuid[]) from public,anon,authenticated;
grant execute on function public.claim_avatar_upload(uuid,uuid),public.finish_avatar_upload(uuid,uuid),public.retire_avatar(uuid),public.avatar_cleanup_paths(uuid,boolean),public.finish_avatar_cleanup(uuid[]) to service_role;
commit;
