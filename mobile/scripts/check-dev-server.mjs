import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Exercise the real overridden CLI without exposing a LAN server or contacting
// Expo/Supabase. Never stop another terminal's server or forward CLI diagnostics.
const require = createRequire(import.meta.url);
const projectRoot = new URL('..', import.meta.url);
const reservation = createServer();
await new Promise((resolve, reject) => {
  reservation.once('error', reject);
  reservation.listen(0, 'localhost', resolve);
});
const port = reservation.address().port;
await new Promise((resolve, reject) =>
  reservation.close((error) => (error ? reject(error) : resolve())),
);
const cli = join(dirname(require.resolve('expo/package.json')), 'bin/cli');
const child = spawn(
  process.execPath,
  [cli, 'start', '--go', '--localhost', '--port', String(port)],
  {
    cwd: projectRoot,
    env: {
      ...process.env,
      CI: '1',
      EXPO_OFFLINE: '1',
      EXPO_NO_DOTENV: '1',
      EXPO_NO_TELEMETRY: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  },
);
let output = '';
let spawnFailed = false;
child.on('error', () => {
  spawnFailed = true;
});
child.stdout.on('data', (data) => {
  output = (output + data.toString()).slice(-8192);
});
child.stderr.resume();
const exited = new Promise((resolve) => child.once('exit', resolve));
const running = () => child.exitCode === null && child.signalCode === null && !spawnFailed;
let ready = false;
try {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline && running()) {
    if (output.includes('Waiting on')) {
      try {
        const response = await fetch(`http://localhost:${port}/status`, {
          signal: AbortSignal.timeout(1000),
        });
        ready = response.ok && (await response.text()) === 'packager-status:running';
      } catch {
        /* Startup may still be completing. */
      }
      if (ready) break;
    }
    await delay(250);
  }
  if (!ready) throw new Error('Expo localhost startup/status check failed.');
} finally {
  if (child.pid && running()) {
    if (process.platform === 'win32') {
      // This PID belongs to the child we just spawned; /T includes only its tree.
      const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      await new Promise((resolve, reject) => {
        killer.once('error', reject);
        killer.once('exit', (code) =>
          code === 0 || !running()
            ? resolve()
            : reject(new Error('Could not stop smoke-test server.')),
        );
      });
    } else {
      child.kill('SIGTERM');
      await Promise.race([exited, delay(3000)]);
      if (running()) child.kill('SIGKILL');
    }
    await Promise.race([exited, delay(3000)]);
    if (running()) throw new Error('Smoke-test server did not stop.');
  }
}
console.log('Expo localhost startup and status passed; smoke-test server stopped.');
