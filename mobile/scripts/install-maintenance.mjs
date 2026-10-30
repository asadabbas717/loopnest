import { fileURLToPath } from 'node:url';
import { localCli, localStatus } from './backend.mjs';
const args = process.argv.slice(2);
try {
  let target;
  if (args.length === 1 && args[0] === '--local') {
    await localStatus();
    target = ['--local'];
  } else if (args.length === 2 && args[0] === '--project-ref' && /^[a-z]{20}$/.test(args[1]))
    target = ['--project-ref', args[1]];
  else throw new Error('Invalid target');
  await localCli([
    'db',
    'query',
    ...target,
    '--file',
    fileURLToPath(new URL('../../supabase/operations/install-maintenance.sql', import.meta.url)),
  ]);
  console.log('Maintenance scheduler functions installed; no schedule or token was enabled.');
} catch {
  console.error(
    'Maintenance installation failed. Check target, CLI access and available PostgreSQL extensions. No credentials are logged.',
  );
  process.exitCode = 1;
}
