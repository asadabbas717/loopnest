import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
const target = new URL('../../supabase/functions/.env', import.meta.url);
if (process.env.CI !== 'true' || existsSync(target))
  throw new Error('CI-only preparation refuses to overwrite an existing functions environment.');
writeFileSync(target, `LOOPNEST_MAINTENANCE_TOKEN=${randomBytes(32).toString('hex')}\n`, {
  mode: 0o600,
});
console.log('Prepared an ephemeral local-only worker token; value is not logged.');
