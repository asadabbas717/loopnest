import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { localCli } from './backend.mjs';
import { operatorTarget, operatorClient } from './operator-client.mjs';
try {
  const target = await operatorTarget(process.argv.slice(2));
  let token;
  if (target.ref) {
    token = randomBytes(32).toString('hex');
    await localCli([
      'secrets',
      'set',
      `LOOPNEST_MAINTENANCE_TOKEN=${token}`,
      '--project-ref',
      target.ref,
    ]);
  } else {
    token = readFileSync(new URL('../../supabase/functions/.env', import.meta.url), 'utf8').match(
      /^LOOPNEST_MAINTENANCE_TOKEN=([a-f0-9]{64})\s*$/m,
    )?.[1];
    if (!token) throw new Error('Prepare a local functions token before starting Supabase');
  }
  let verified = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(target.url + '/functions/v1/content-maintenance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-maintenance-token': token },
      body: '{"dry_run":true}',
      signal: AbortSignal.timeout(20000),
    });
    if (response.ok) {
      const result = await response.json();
      if (result.dryRun === true && result.backlog) {
        verified = true;
        break;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!verified) throw new Error('Worker dry-run verification failed');
  const { data, error } = await operatorClient(target).rpc('configure_content_maintenance', {
    project_url: target.ref ? target.url : 'http://kong:8000',
    maintenance_token: token,
  });
  if (error || !Number.isInteger(data)) throw new Error('Scheduler configuration failed');
  console.log(
    'Verified count-only worker access and enabled cleanup at 00:17, 06:17, 12:17 and 18:17 UTC, only when eligible work exists. Token is kept in server secrets/Vault, not mobile configuration.',
  );
} catch {
  console.error(
    'Maintenance configuration failed. Check explicit target, deployed function, installed scheduler and CLI access. No credentials are logged.',
  );
  process.exitCode = 1;
}
