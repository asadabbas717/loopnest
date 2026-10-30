import { operatorTarget, operatorClient } from './operator-client.mjs';
try {
  const { data, error } = await operatorClient(await operatorTarget(process.argv.slice(2))).rpc(
    'project_capacity_status',
  );
  if (error) throw new Error('Capacity unavailable');
  console.log(JSON.stringify(data));
} catch {
  console.error(
    'Capacity check failed. Check target, CLI access and migrations. No credentials are logged.',
  );
  process.exitCode = 1;
}
