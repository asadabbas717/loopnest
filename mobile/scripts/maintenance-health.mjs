import { operatorTarget, operatorClient } from './operator-client.mjs';
try {
  const client = operatorClient(await operatorTarget(process.argv.slice(2)));
  const [worker, schedule] = await Promise.all([
    client.rpc('content_maintenance_health'),
    client.rpc('content_maintenance_schedule_health'),
  ]);
  if (worker.error || schedule.error) throw new Error('Health unavailable');
  const recent = worker.data.runs[0],
    pending = Object.values(worker.data.backlog).some((n) => n > 0);
  const lastSuccess = worker.data.runs.find((r) => r.status === 'success');
  const overdue =
    pending && (!lastSuccess || Date.now() - Date.parse(lastSuccess.finished_at) > 12 * 3600000);
  const stuck = recent?.status === 'running' && Date.parse(recent.lease_until) < Date.now();
  const httpFailure =
    schedule.data.last_http_status >= 400 &&
    (!recent?.started_at ||
      Date.parse(schedule.data.last_dispatch) >= Date.parse(recent.started_at));
  const failed =
    recent?.status === 'failed' || httpFailure || schedule.data.last_cron_status === 'failed';
  const undispatched =
    pending &&
    schedule.data.last_dispatch &&
    Date.now() - Date.parse(schedule.data.last_dispatch) > 12 * 3600000;
  const healthy = schedule.data.enabled && !overdue && !stuck && !failed && !undispatched;
  console.log(
    JSON.stringify({
      healthy,
      overdue,
      stuck,
      failed,
      schedule: schedule.data,
      worker: worker.data,
    }),
  );
  if (!healthy) process.exitCode = 1;
} catch {
  console.error(
    'Maintenance health check failed. Check CLI access, deployment, schedule and worker configuration. No credentials are logged.',
  );
  process.exitCode = 1;
}
