begin;
create table private.maintenance_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default clock_timestamp(),
  lease_until timestamptz not null default clock_timestamp()+interval '5 minutes',
  finished_at timestamptz,
  status text not null default 'running' check(status in('running','success','failed')),
  counts jsonb not null default '{}'::jsonb
);
revoke all on private.maintenance_runs from public,anon,authenticated;
alter table private.maintenance_runs enable row level security;
create function public.begin_content_maintenance() returns uuid
language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
  if not pg_try_advisory_xact_lock(7182965) then return null; end if;
  if exists(select 1 from private.maintenance_runs where status='running' and lease_until>clock_timestamp()) then return null; end if;
  update private.maintenance_runs set status='failed',finished_at=clock_timestamp() where status='running';
  insert into private.maintenance_runs default values returning id into rid;
  return rid;
end;
$$;
create function public.finish_content_maintenance(rid uuid,successful boolean,summary jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
  if summary is null or jsonb_typeof(summary)<>'object' or exists(select 1 from jsonb_each(summary) e where
    e.key not in('photos','messages','avatars','deletions','metadata','failures') or jsonb_typeof(e.value)<>'number'
    or e.value::text !~ '^[0-9]{1,6}$') then raise exception 'Invalid maintenance summary'; end if;
  update private.maintenance_runs set status=case when successful then 'success' else 'failed' end,
    counts=summary,finished_at=clock_timestamp() where id=rid and status='running' and lease_until>clock_timestamp();
  if not found then raise exception 'Maintenance lease unavailable'; end if;
end;
$$;
create function public.pending_message_delete_work(batch_size integer default 20)
returns table(message_id uuid,path text)
language plpgsql stable security definer set search_path='' as $$
begin
  if batch_size is null or batch_size<1 or batch_size>20 then raise exception 'Invalid batch size'; end if;
  return query select d.message_id,a.path from private.message_deletions d left join public.photo_assets a on a.id=d.asset_id
    where d.finished_at is null and private.chat_not_clearing(d.conversation_id) order by d.created_at,d.message_id limit batch_size;
end;
$$;
create function public.claim_avatar_maintenance(batch_size integer default 20) returns table(id uuid,path text)
language plpgsql security definer set search_path='' as $$
declare candidate private.avatar_assets; item private.avatar_assets; claimed integer:=0;
begin
  if batch_size is null or batch_size<1 or batch_size>20 then raise exception 'Invalid batch size'; end if;
  for candidate in select * from private.avatar_assets a where a.purged_at is null
    and (a.retired_at is not null or a.created_at<=now()-interval '1 hour')
    and not exists(select 1 from public.profiles p where p.avatar_id=a.id) order by a.owner_id,a.id limit batch_size*5
  loop
    perform 1 from public.profiles where profiles.id=candidate.owner_id for update;
    select * into item from private.avatar_assets a where a.id=candidate.id for update skip locked;
    if not found or item.purged_at is not null or (item.retired_at is null and item.created_at>now()-interval '1 hour')
      or exists(select 1 from public.profiles p where p.avatar_id=item.id) then continue; end if;
    update private.avatar_assets a set retired_at=coalesce(a.retired_at,now()) where a.id=item.id;
    id:=item.id;path:=item.path;return next;
    claimed:=claimed+1;exit when claimed>=batch_size;
  end loop;
end;
$$;
create function public.prune_content_metadata() returns integer
language plpgsql security definer set search_path='' as $$
declare removed integer:=0; n integer;
begin
  delete from private.message_receipts where id in(select id from private.message_receipts where removed_at<now()-interval '30 days' limit 1000);
  get diagnostics n=row_count;removed:=removed+n;
  delete from private.message_deletions where message_id in(select message_id from private.message_deletions where finished_at<now()-interval '30 days' limit 1000);
  get diagnostics n=row_count;removed:=removed+n;
  delete from private.invitation_attempts where id in(select id from private.invitation_attempts where created_at<=now()-interval '1 day' limit 1000);
  get diagnostics n=row_count;removed:=removed+n;
  delete from private.photo_quota_receipts where id in(select id from private.photo_quota_receipts where reserved_at<=now()-interval '1 day' limit 1000);
  get diagnostics n=row_count;removed:=removed+n;
  delete from private.avatar_assets where id in(select a.id from private.avatar_assets a where a.purged_at<now()-interval '30 days'
    and not exists(select 1 from public.profiles p where p.avatar_id=a.id) limit 1000);
  get diagnostics n=row_count;removed:=removed+n;
  delete from private.chat_clears where id in(select id from private.chat_clears where finished_at<now()-interval '30 days' limit 1000);
  get diagnostics n=row_count;removed:=removed+n;
  delete from private.maintenance_runs where id in(select id from private.maintenance_runs where finished_at<now()-interval '30 days' limit 1000);
  get diagnostics n=row_count;return removed+n;
end;
$$;
create function public.content_maintenance_backlog() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('photos',public.photo_cleanup_count(),'messages',public.expired_text_cleanup_count(),
    'deletions',(select count(*) from private.message_deletions d where d.finished_at is null and private.chat_not_clearing(d.conversation_id)),
    'avatars',(select count(*) from private.avatar_assets a where a.purged_at is null
      and (a.retired_at is not null or a.created_at<=now()-interval '1 hour') and not exists(select 1 from public.profiles p where p.avatar_id=a.id)),
    'metadata',case when exists(select 1 from private.message_receipts where removed_at<now()-interval '30 days')
      or exists(select 1 from private.message_deletions where finished_at<now()-interval '30 days')
      or exists(select 1 from private.invitation_attempts where created_at<=now()-interval '1 day')
      or exists(select 1 from private.photo_quota_receipts where reserved_at<=now()-interval '1 day')
      or exists(select 1 from private.avatar_assets where purged_at<now()-interval '30 days')
      or exists(select 1 from private.chat_clears where finished_at<now()-interval '30 days')
      or exists(select 1 from private.maintenance_runs where finished_at<now()-interval '30 days') then 1 else 0 end);
$$;
create function public.content_maintenance_health() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('backlog',public.content_maintenance_backlog(),'runs',coalesce((select jsonb_agg(r) from
    (select started_at,lease_until,finished_at,status,counts from private.maintenance_runs order by started_at desc limit 10) r),'[]'::jsonb));
$$;
revoke all on function public.begin_content_maintenance(),public.finish_content_maintenance(uuid,boolean,jsonb),
  public.pending_message_delete_work(integer),public.claim_avatar_maintenance(integer),public.prune_content_metadata(),
  public.content_maintenance_backlog(),public.content_maintenance_health() from public,anon,authenticated;
grant execute on function public.begin_content_maintenance(),public.finish_content_maintenance(uuid,boolean,jsonb),
  public.pending_message_delete_work(integer),public.claim_avatar_maintenance(integer),public.prune_content_metadata(),
  public.content_maintenance_backlog(),public.content_maintenance_health() to service_role;
commit;
