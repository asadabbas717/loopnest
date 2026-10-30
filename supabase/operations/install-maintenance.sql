-- Operator-only provisioning; pg_cron/pg_net/Vault are platform extensions,
-- deliberately separate from portable application/embedded-test migrations.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault;
revoke all on net.http_request_queue from public,anon,authenticated;
revoke all on vault.decrypted_secrets from public,anon,authenticated;
create table if not exists private.maintenance_dispatches (
  request_id bigint primary key,
  dispatched_at timestamptz not null default clock_timestamp()
);
revoke all on private.maintenance_dispatches from public,anon,authenticated;

create or replace function private.dispatch_content_maintenance() returns bigint
language plpgsql security definer set search_path='' as $$
declare endpoint text; secret text; request bigint; backlog jsonb;
begin
  if exists(select 1 from private.maintenance_dispatches where dispatched_at>now()-interval '1 hour') then return null; end if;
  if exists(select 1 from private.maintenance_runs where status='running' and lease_until>clock_timestamp()) then return null; end if;
  backlog:=public.content_maintenance_backlog();
  if not exists(select 1 from jsonb_each_text(backlog) where value::bigint>0) then return null; end if;
  select decrypted_secret into endpoint from vault.decrypted_secrets where name='loopnest_maintenance_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name='loopnest_maintenance_token';
  if endpoint is null or secret is null then raise exception 'Maintenance configuration unavailable'; end if;
  request:=net.http_post(url:=endpoint||'/functions/v1/content-maintenance',
    headers:=jsonb_build_object('Content-Type','application/json','x-maintenance-token',secret),
    body:='{"dry_run":false}'::jsonb,timeout_milliseconds:=120000);
  insert into private.maintenance_dispatches(request_id) values(request);
  delete from private.maintenance_dispatches where dispatched_at<now()-interval '7 days';
  delete from cron.job_run_details where jobid in(select jobid from cron.job where jobname='loopnest-content-maintenance')
    and end_time<now()-interval '30 days';
  return request;
end;
$$;
revoke all on function private.dispatch_content_maintenance() from public,anon,authenticated,service_role;

create or replace function public.configure_content_maintenance(project_url text,maintenance_token text) returns bigint
language plpgsql security definer set search_path='' as $$
declare sid uuid; jid bigint;
begin
  if (project_url !~ '^https://[a-z]{20}\.supabase\.co$' and project_url<>'http://kong:8000')
    or maintenance_token !~ '^[a-f0-9]{64}$' or project_url is null or maintenance_token is null then
    raise exception 'Invalid maintenance configuration'; end if;
  select id into sid from vault.secrets where name='loopnest_maintenance_url';
  if sid is null then perform vault.create_secret(project_url,'loopnest_maintenance_url');
  else perform vault.update_secret(sid,project_url); end if;
  select id into sid from vault.secrets where name='loopnest_maintenance_token';
  if sid is null then perform vault.create_secret(maintenance_token,'loopnest_maintenance_token');
  else perform vault.update_secret(sid,maintenance_token); end if;
  jid:=cron.schedule('loopnest-content-maintenance','17 */6 * * *','select private.dispatch_content_maintenance();');
  return jid;
end;
$$;
create or replace function public.disable_content_maintenance() returns void
language plpgsql security definer set search_path='' as $$
declare jid bigint;
begin
  select jobid into jid from cron.job where jobname='loopnest-content-maintenance';
  if jid is not null then perform cron.unschedule(jid); end if;
end;
$$;
create or replace function public.content_maintenance_schedule_health() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('enabled',exists(select 1 from cron.job where jobname='loopnest-content-maintenance' and active),
    'schedule',(select schedule from cron.job where jobname='loopnest-content-maintenance'),
    'last_cron_status',(select status from cron.job_run_details where jobid in(select jobid from cron.job where jobname='loopnest-content-maintenance') order by start_time desc limit 1),
    'last_dispatch',(select max(dispatched_at) from private.maintenance_dispatches),
    'last_http_status',(select r.status_code from private.maintenance_dispatches d left join net._http_response r on r.id=d.request_id order by d.dispatched_at desc limit 1));
$$;
revoke all on function public.configure_content_maintenance(text,text),public.disable_content_maintenance(),public.content_maintenance_schedule_health() from public,anon,authenticated;
grant execute on function public.configure_content_maintenance(text,text),public.disable_content_maintenance(),public.content_maintenance_schedule_health() to service_role;
commit;
