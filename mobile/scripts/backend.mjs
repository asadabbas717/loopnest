import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeFileSync, existsSync } from 'node:fs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const cli = fileURLToPath(new URL('../node_modules/supabase/dist/supabase.js', import.meta.url));
export function localCli(args) {
  return new Promise((resolve, reject) => {
    const process = spawn(globalThis.process.execPath, [cli, '--workdir', root, ...args], {
      cwd: root,
      env: { ...globalThis.process.env, DO_NOT_TRACK: '1', SUPABASE_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    process.stdout.on('data', (data) => {
      output += data;
    });
    // CLI status/start can print local keys; never forward raw output to logs.
    let diagnostic = '';
    process.stderr.on('data', (data) => {
      diagnostic = (diagnostic + data).slice(-8000);
    });
    process.on('error', reject);
    process.on('close', (code) =>
      code === 0
        ? resolve(output)
        : reject(
            new Error(
              `Local Supabase command failed (exit ${code}). ${failureCode(diagnostic)} Check Docker and run the CLI manually for diagnostics.`,
            ),
          ),
    );
  });
}
function failureCode(output) {
  for (const line of output.split('\n').reverse()) {
    try {
      const value = JSON.parse(line);
      const code = value?.error?.code;
      if (typeof code === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(code)) return `Code: ${code}.`;
    } catch {
      /* Never expose raw CLI output or credentials. */
    }
  }
  return '';
}
export async function localStatus() {
  const status = JSON.parse(await localCli(['status', '-o', 'json']));
  const url = status.API_URL ?? status.api_url;
  if (url !== 'http://127.0.0.1:54321' && url !== 'http://localhost:54321')
    throw new Error('Integration runner refuses a non-local backend.');
  return {
    url,
    key: status.PUBLISHABLE_KEY ?? status.ANON_KEY,
    adminKey: status.SECRET_KEY ?? status.SERVICE_ROLE_KEY,
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const action = process.argv[2];
  if (action === 'start') {
    const progress = setInterval(
      () => console.log('Starting local Supabase; first run may download container images…'),
      30000,
    );
    try {
      await localCli([
        'start',
        '-x',
        'studio,postgres-meta,logflare,vector,supavisor,edge-runtime,imgproxy',
      ]);
      console.log('Local Supabase started. No hosted project was contacted.');
    } finally {
      clearInterval(progress);
    }
  } else if (action === 'stop') {
    await localCli(['stop']);
    console.log('Local Supabase stopped; data preserved.');
  } else if (action === 'env') {
    const target = fileURLToPath(new URL('../.env', import.meta.url));
    if (existsSync(target))
      throw new Error('mobile/.env already exists; refusing to overwrite it.');
    const status = await localStatus();
    const host = process.argv[3] === 'android' ? '10.0.2.2' : '127.0.0.1';
    writeFileSync(
      target,
      `EXPO_PUBLIC_SUPABASE_URL=http://${host}:54321\nEXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${status.key}\nEXPO_PUBLIC_USE_LOCAL_BACKEND=true\n`,
      { mode: 0o600 },
    );
    console.log('Wrote ignored mobile/.env with local PUBLIC configuration only. Restart Expo.');
  } else {
    throw new Error('Use start, stop, or env [android].');
  }
}
