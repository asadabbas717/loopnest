import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('fresh app has no Firebase or paid cloud-build dependency', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(
    Object.keys(manifest.dependencies).some((name) => /firebase|eas-cli/.test(name)),
    false,
  );
});
