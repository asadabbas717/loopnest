import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { localCli, localStatus } from './backend.mjs';
import { localSQL } from './local-sql.mjs';
const args = process.argv.slice(2);
try {
  let target;
  if (args.length === 1 && args[0] === '--local') {
    await localStatus();
    target = ['--local'];
  } else if (args.length === 2 && args[0] === '--project-ref' && /^[a-z]{20}$/.test(args[1]))
    target = ['--project-ref', args[1]];
  else throw new Error('Invalid target');
  const file = fileURLToPath(
    new URL('../../supabase/operations/install-maintenance.sql', import.meta.url),
  );
  if (target[0] === '--local') await localSQL(readFileSync(file, 'utf8'));
  else await localCli(['db', 'query', ...target, '--file', file]);
  console.log('Maintenance scheduler functions installed; no schedule or token was enabled.');
} catch (issue) {
  console.error(
    'Maintenance installation failed. Check target, CLI access and available PostgreSQL extensions. No credentials are logged.',
  );
  const state = issue instanceof Error ? issue.message.match(/SQLSTATE ([0-9A-Z]{5})/)?.[1] : null;
  if (state) console.error(`PostgreSQL SQLSTATE: ${state}`);
  process.exitCode = 1;
}
