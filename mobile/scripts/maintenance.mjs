import { createClient } from '@supabase/supabase-js';
import { localCli, localStatus } from './backend.mjs';
import { cleanAbandonedPhotos } from './photo-cleanup.mjs';
import { cleanExpiredText } from './text-cleanup.mjs';

// Requires an explicit target. Hosted credentials come from the operator's
// authorized CLI session, remain in memory, and are never written or logged.
const args = process.argv.slice(2);
const allowed = new Set(['--local', '--project-ref', '--apply']);
try {
  const refIndex = args.indexOf('--project-ref');
  const ref = refIndex < 0 ? null : args[refIndex + 1];
  const flags = args.filter((_arg, index) => index !== refIndex + 1 || refIndex < 0);
  if (flags.some((arg) => !allowed.has(arg)) || new Set(flags).size !== flags.length)
    throw new Error('Invalid options.');
  if ((args.includes('--local') && refIndex >= 0) || (!args.includes('--local') && !ref))
    throw new Error('Select exactly one target.');
  if (ref !== null && !/^[a-z]{20}$/.test(ref)) throw new Error('Invalid project reference.');
  let url;
  let key;
  if (ref) {
    const keys = JSON.parse(
      await localCli(['projects', 'api-keys', '--project-ref', ref, '-o', 'json']),
    );
    key = keys.find((item) => item.name === 'service_role')?.api_key;
    if (typeof key !== 'string' || !key) throw new Error('Privileged CLI access unavailable.');
    url = `https://${ref}.supabase.co`;
  } else {
    const status = await localStatus();
    url = status.url;
    key = status.adminKey;
  }
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const photos = await cleanAbandonedPhotos(client, { apply: args.includes('--apply') });
  const messages = await cleanExpiredText(client, { apply: args.includes('--apply') });
  console.log(JSON.stringify({ target: ref ?? 'local', photos, messages }));
} catch {
  // CLI or HTTP errors can include credentials. Do not forward their contents.
  console.error(
    'Content maintenance failed. Check target/options, CLI access, migrations and connectivity. No credentials are logged.',
  );
  process.exitCode = 1;
}
