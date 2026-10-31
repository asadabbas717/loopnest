import assert from 'node:assert/strict';
import test from 'node:test';
import config from '../app.config.ts';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
test('capture callback permission survives native merging while media and sensor access stay blocked', () => {
  const blocked = config.android.blockedPermissions;
  assert.equal(blocked.includes('android.permission.DETECT_SCREEN_CAPTURE'), false);
  for (const name of [
    'CAMERA',
    'RECORD_AUDIO',
    'READ_MEDIA_IMAGES',
    'READ_EXTERNAL_STORAGE',
    'WRITE_EXTERNAL_STORAGE',
  ])
    assert.equal(blocked.includes(`android.permission.${name}`), true, name);
  const manifest = readFileSync(
    join(
      dirname(require.resolve('expo-screen-capture/package.json')),
      'android/src/main/AndroidManifest.xml',
    ),
    'utf8',
  );
  assert.match(manifest, /android.permission.DETECT_SCREEN_CAPTURE/);
});
