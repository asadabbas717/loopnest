import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { checkAndroidSafeArea } from './android-safe-area.mjs';

// This probe must never install, stop or inspect an app on the owner's phone.
if (process.env.CI !== 'true' || process.platform !== 'linux')
  throw new Error('Launch verification is restricted to an isolated Linux CI emulator.');
const run = (...args) => execFileSync('adb', args, { encoding: 'utf8', timeout: 20000 });
const devices = run('devices')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => /\tdevice$/.test(line));
if (devices.length !== 1 || !/^emulator-\d+\tdevice$/.test(devices[0]))
  throw new Error('Expected exactly one isolated emulator and no physical devices.');
const pkg = 'app.loopnest.mobile';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  run('install', '-r', resolve('android/app/build/outputs/apk/release/app-release.apk'));
  const permissions = run('shell', 'dumpsys', 'package', pkg);
  if (!/android\.permission\.DETECT_SCREEN_CAPTURE: granted=true/.test(permissions))
    throw new Error('Installed APK lacks the screen-capture callback permission grant.');
  for (const name of [
    'CAMERA',
    'RECORD_AUDIO',
    'READ_MEDIA_IMAGES',
    'READ_EXTERNAL_STORAGE',
    'WRITE_EXTERNAL_STORAGE',
  ])
    if (permissions.includes(`android.permission.${name}`))
      throw new Error(`Unexpected broad permission in installed APK: ${name}`);
  for (let launch = 0; launch < 2; launch++) {
    run('shell', 'am', 'force-stop', pkg);
    const navigationMode = launch === 0 ? 'threebutton' : 'gestural';
    if (process.env.CHECK_SAFE_AREA === 'true') {
      run(
        'shell',
        'cmd',
        'overlay',
        'enable-exclusive',
        '--category',
        `com.android.internal.systemui.navbar.${navigationMode}`,
      );
      await pause(1500);
    }
    run('logcat', '-c');
    run('shell', 'am', 'start', '-W', '-n', `${pkg}/.MainActivity`);
    let ready = false;
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      await pause(1500);
      let pid = '';
      try {
        pid = run('shell', 'pidof', pkg).trim();
      } catch {
        /* missing process */
      }
      if (!pid) throw new Error('Release process exited during startup.');
      run('shell', 'uiautomator', 'dump', '/sdcard/loopnest-launch.xml');
      const xml = run('shell', 'cat', '/sdcard/loopnest-launch.xml');
      if (/text="Email"/.test(xml) && /text="Password"/.test(xml) && /Sign in/.test(xml)) {
        if (process.env.CHECK_SAFE_AREA === 'true') {
          const displays = run('shell', 'dumpsys', 'window', 'displays');
          try {
            const geometry = checkAndroidSafeArea(xml, displays);
            console.log(`Safe content geometry (${navigationMode}): ${JSON.stringify(geometry)}`);
          } catch (issue) {
            // Geometry/resource IDs only; never print UI field values.
            console.error(
              displays
                .split('\n')
                .filter((line) => line.includes('navigationBars'))
                .slice(0, 5)
                .map((line) => line.slice(0, 500))
                .join('\n'),
            );
            console.error(
              'Native view IDs:',
              [...xml.matchAll(/resource-id="([^"]+)"/g)].map((match) => match[1]).slice(0, 60),
            );
            throw issue;
          }
        }
        ready = true;
        break;
      }
    }
    if (!ready) throw new Error('Sign-in screen did not become ready within 60 seconds.');
    await pause(3000);
    run('shell', 'pidof', pkg);
    console.log(`Release cold launch ${launch + 1}: sign-in rendered and process remained alive.`);
  }
} catch (issue) {
  // An empty CI installation has no user accounts/messages. Still redact key-like
  // strings and bound diagnostics rather than dumping all emulator logs.
  try {
    console.error(
      run('logcat', '-d', '-s', 'AndroidRuntime:E', 'ReactNativeJS:E', 'libc:F')
        .slice(-24000)
        .replace(/sb_[A-Za-z0-9_-]+/g, '[key redacted]')
        .replace(/eyJ[A-Za-z0-9_.-]{30,}/g, '[token redacted]'),
    );
  } catch {
    /* retain the original failure */
  }
  throw issue;
}
