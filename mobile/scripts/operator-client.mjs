import { createClient } from '@supabase/supabase-js';
import { localCli, localStatus } from './backend.mjs';
export async function operatorTarget(args) {
  if (args.length === 1 && args[0] === '--local') {
    const value = await localStatus();
    return { url: value.url, key: value.adminKey, ref: null };
  }
  if (args.length !== 2 || args[0] !== '--project-ref' || !/^[a-z]{20}$/.test(args[1]))
    throw new Error('Select an explicit target');
  const ref = args[1],
    keys = JSON.parse(await localCli(['projects', 'api-keys', '--project-ref', ref, '-o', 'json']));
  const key = keys.find((row) => row.name === 'service_role')?.api_key;
  if (!key) throw new Error('Operator access unavailable');
  return { url: `https://${ref}.supabase.co`, key, ref };
}
export function operatorClient(target) {
  return createClient(target.url, target.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20000) }),
    },
  });
}
