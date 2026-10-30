begin;
-- Conservative application-content budgets for this dedicated Free project.
-- These are admission limits, not a promise about all provider resource usage.
create table private.project_limits (
  singleton boolean primary key default true check(singleton),
  message_cap integer not null default 10000 check(message_cap between 1 and 10000),
  photo_cap integer not null default 400 check(photo_cap between 1 and 400),
  avatar_cap integer not null default 200 check(avatar_cap between 1 and 200),
  profile_cap integer not null default 500 check(profile_cap between 1 and 500),
  message_day integer not null default 2000 check(message_day between 1 and 2000),
  photo_day integer not null default 200 check(photo_day between 1 and 200),
  avatar_day integer not null default 50 check(avatar_day between 1 and 50),
  profile_day integer not null default 50 check(profile_day between 1 and 50)
);
insert into private.project_limits default values;
create table private.project_daily_usage (
  usage_day date primary key,
  message_count integer not null default 0,
  photo_count integer not null default 0,
  avatar_count integer not null default 0,
  profile_count integer not null default 0
);
revoke all on private.project_limits,private.project_daily_usage from public,anon,authenticated;
alter table private.project_limits enable row level security;
alter table private.project_daily_usage enable row level security;
insert into private.project_daily_usage(usage_day,message_count,photo_count,avatar_count,profile_count)
select (now() at time zone 'UTC')::date,
  (select count(*) from public.messages where created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')
    +(select count(*) from private.message_receipts where sent_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'),
  (select count(*) from public.photo_assets where created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')
    +(select count(*) from private.photo_quota_receipts where reserved_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'),
  (select count(*) from private.avatar_assets where created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'),
  (select count(*) from public.profiles where created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC');

create function private.guard_project_capacity() returns trigger
language plpgsql security definer set search_path='' as $$
declare limits private.project_limits; used private.project_daily_usage; today date:=(statement_timestamp() at time zone 'UTC')::date;
begin
  -- Serialize admission across accounts; deleting an account cannot reset the
  -- content-free daily counters because they have no account foreign key.
  perform pg_advisory_xact_lock(7182966);
  select * into limits from private.project_limits where singleton;
  if not found then raise exception 'Project capacity unavailable'; end if;
  insert into private.project_daily_usage(usage_day) values(today) on conflict do nothing;
  select * into used from private.project_daily_usage where usage_day=today;
  if tg_table_name='messages' then
    if (select count(*) from public.messages)>=limits.message_cap then raise exception 'Project message capacity reached'; end if;
    if used.message_count>=limits.message_day then raise exception 'Project message rate reached'; end if;
    update private.project_daily_usage set message_count=message_count+1 where usage_day=today;
  elsif tg_table_name='photo_assets' then
    if (select count(*) from public.photo_assets)>=limits.photo_cap then raise exception 'Project photo capacity reached'; end if;
    if used.photo_count>=limits.photo_day then raise exception 'Project photo rate reached'; end if;
    update private.project_daily_usage set photo_count=photo_count+1 where usage_day=today;
  elsif tg_table_name='avatar_assets' then
    if (select count(*) from private.avatar_assets where purged_at is null)>=limits.avatar_cap then raise exception 'Project avatar capacity reached'; end if;
    if used.avatar_count>=limits.avatar_day then raise exception 'Project avatar rate reached'; end if;
    update private.project_daily_usage set avatar_count=avatar_count+1 where usage_day=today;
  elsif tg_table_name='profiles' then
    if (select count(*) from public.profiles)>=limits.profile_cap then raise exception 'Project profile capacity reached'; end if;
    if used.profile_count>=limits.profile_day then raise exception 'Project profile rate reached'; end if;
    update private.project_daily_usage set profile_count=profile_count+1 where usage_day=today;
  else raise exception 'Project capacity unavailable';
  end if;
  delete from private.project_daily_usage where usage_day in(select usage_day from private.project_daily_usage where usage_day<today-31 limit 1000);
  return new;
end;
$$;
revoke all on function private.guard_project_capacity() from public,anon,authenticated;
create trigger a_project_capacity before insert on public.messages for each row execute function private.guard_project_capacity();
create trigger a_project_capacity before insert on public.photo_assets for each row execute function private.guard_project_capacity();
create trigger a_project_capacity before insert on private.avatar_assets for each row execute function private.guard_project_capacity();
create trigger a_project_capacity before insert on public.profiles for each row execute function private.guard_project_capacity();
create function public.project_capacity_status() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('limits',(select to_jsonb(p)-'singleton' from private.project_limits p where singleton),
    'today',(select to_jsonb(u) from private.project_daily_usage u where usage_day=(now() at time zone 'UTC')::date),
    'retained',jsonb_build_object('messages',(select count(*) from public.messages),'photos',(select count(*) from public.photo_assets),
      'avatars',(select count(*) from private.avatar_assets where purged_at is null),'profiles',(select count(*) from public.profiles)));
$$;
revoke all on function public.project_capacity_status() from public,anon,authenticated;
grant execute on function public.project_capacity_status() to service_role;
commit;
