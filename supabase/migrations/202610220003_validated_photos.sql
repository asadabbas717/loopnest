begin;
alter table public.photo_assets add column validation_attempted_at timestamptz;
alter table public.photo_assets add column validated_at timestamptz;
-- Clients may reserve an asset but cannot write untrusted bytes into the bucket.
drop policy photo_upload on storage.objects;

create function public.claim_photo_validation(asset_id uuid,actor uuid)
returns table(id uuid,path text)
language plpgsql security definer set search_path = '' as $$
declare asset public.photo_assets;
begin
  perform 1 from public.profiles where public.profiles.id=actor for update;
  select * into asset from public.photo_assets a where a.id=asset_id and a.owner_id=actor;
  if not found then raise exception 'Photo unavailable' using errcode='42501'; end if;
  perform 1 from public.conversations c where c.id=asset.conversation_id for update;
  select * into asset from public.photo_assets a where a.id=asset_id for update;
  if not found or not private.account_enabled(actor)
    or not exists(select 1 from public.conversations c where c.id=asset.conversation_id and c.status='accepted' and not private.is_blocked(c.initiator,c.recipient))
    or asset.validation_attempted_at is not null or asset.cleanup_requested_at is not null
    or asset.created_at<=now()-interval '1 hour' then
    raise exception 'Photo unavailable' using errcode='42501'; end if;
  update public.photo_assets a set validation_attempted_at=now() where a.id=asset_id;
  id:=asset.id; path:=asset.path; return next;
end;
$$;

create or replace function private.guard_photo_upload() returns trigger
language plpgsql security definer set search_path = '' as $$
declare asset public.photo_assets; chat public.conversations;
begin
  if new.bucket_id<>'chat-photos' then return new; end if;
  select * into asset from public.photo_assets where path=new.name;
  if not found then raise exception 'Photo unavailable' using errcode='42501'; end if;
  select * into chat from public.conversations where id=asset.conversation_id for update;
  if not found then raise exception 'Photo unavailable' using errcode='42501'; end if;
  select * into asset from public.photo_assets where path=new.name for update;
  if not found or asset.validation_attempted_at is null or asset.cleanup_requested_at is not null
    or asset.created_at<=now()-interval '1 hour' or not private.account_enabled(asset.owner_id)
    or chat.status<>'accepted' or private.is_blocked(chat.initiator,chat.recipient)
    or (auth.role()<>'service_role' and asset.owner_id is distinct from auth.uid()) then
    raise exception 'Photo unavailable' using errcode='42501'; end if;
  return new;
end;
$$;

create function public.finish_photo_validation(asset_id uuid,actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare asset public.photo_assets;
begin
  perform 1 from public.profiles where id=actor for update;
  select * into asset from public.photo_assets where id=asset_id and owner_id=actor;
  if not found then raise exception 'Photo unavailable'; end if;
  perform 1 from public.conversations where id=asset.conversation_id for update;
  select * into asset from public.photo_assets where id=asset_id for update;
  if not found or asset.validation_attempted_at is null or asset.cleanup_requested_at is not null
    or not private.account_enabled(actor)
    or not exists(select 1 from public.conversations c where c.id=asset.conversation_id and c.status='accepted' and not private.is_blocked(c.initiator,c.recipient))
    or not exists(select 1 from storage.objects where bucket_id='chat-photos' and name=asset.path) then
    raise exception 'Photo unavailable'; end if;
  update public.photo_assets set validated_at=now() where id=asset_id;
end;
$$;

create or replace function private.guard_photo_attachment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare asset public.photo_assets;
begin
  if new.photo_id is null then return new; end if;
  select * into asset from public.photo_assets where id=new.photo_id for update;
  if not found or asset.cleanup_requested_at is not null or asset.validated_at is null then
    raise exception 'Photo unavailable'; end if;
  return new;
end;
$$;
revoke all on function public.claim_photo_validation(uuid,uuid),public.finish_photo_validation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_photo_validation(uuid,uuid),public.finish_photo_validation(uuid,uuid) to service_role;
commit;
