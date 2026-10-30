import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { localStatus } from './backend.mjs';
// Local isolated-stack operators only. SQL is piped directly to psql, never
// interpolated into a shell command or accompanied by a database password.
export async function localSQL(sql) {
  await localStatus();
  const config = readFileSync(new URL('../../supabase/config.toml', import.meta.url), 'utf8');
  const id = config.match(/^project_id\s*=\s*"([a-z0-9_-]{1,60})"/m)?.[1];
  if (!id) throw new Error('Invalid local project identifier');
  return new Promise((resolve, reject) => {
    const child = spawn(
      'docker',
      [
        'exec',
        '-i',
        `supabase_db_${id}`,
        'psql',
        '-X',
        '-A',
        '-t',
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-v',
        'ON_ERROR_STOP=1',
        '-v',
        'VERBOSITY=sqlstate',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let output = '',
      diagnostic = '';
    child.stdout.on('data', (data) => {
      output += data;
    });
    child.stderr.on('data', (data) => {
      diagnostic = (diagnostic + data).slice(-4000);
    });
    child.on('error', () => reject(new Error('Local PostgreSQL execution unavailable')));
    child.on('close', (code) => {
      if (code === 0) resolve(output.trim());
      else {
        const state = diagnostic.match(/ERROR:\s+([0-9A-Z]{5})/)?.[1];
        reject(new Error(`Local SQL failed${state ? ` (SQLSTATE ${state})` : ''}`));
      }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(sql);
  });
}
