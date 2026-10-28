begin;
drop function public.claim_one_time_photo(uuid,uuid);
create function public.claim_one_time_photo(asset_id uuid,actor uuid)
returns table(path text,expires_at timestamptz,server_time timestamptz)
language plpgsql security definer set search_path='' as $$
declare asset public.photo_assets; chat public.conversations; deadline timestamptz;
begin
  perform 1 from public.profiles where id=actor for update;
  select * into asset from public.photo_assets a where a.id=asset_id;
  if not found then raise exception 'Photo unavailable' using errcode='42501'; end if;
  select * into chat from public.conversations where id=asset.conversation_id for update;
  select * into asset from public.photo_assets a where a.id=asset_id for update;
  if not found or not private.account_enabled(actor) or chat.status<>'accepted' or private.is_blocked(chat.initiator,chat.recipient)
    or actor not in (chat.initiator,chat.recipient) or actor=asset.owner_id or not asset.view_once
    or asset.validated_at is null or asset.opened_at is not null or asset.cleanup_requested_at is not null
    or not exists(select 1 from public.messages m where m.photo_id=asset_id and (m.expires_at is null or m.expires_at>clock_timestamp())) then
    raise exception 'Photo unavailable' using errcode='42501'; end if;
  select m.expires_at into deadline from public.messages m where m.photo_id=asset_id;
  update public.photo_assets set opened_at=clock_timestamp() where id=asset_id;
  path:=asset.path; expires_at:=deadline; server_time:=clock_timestamp(); return next;
end;
$$;
revoke all on function public.claim_one_time_photo(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_one_time_photo(uuid,uuid) to service_role;
commit;
