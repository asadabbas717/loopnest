import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionStorage } from '../src/domain/secure-storage.ts';

function fixture() {
  const values = new Map();
  let writes = 0;
  let failAt = Infinity;
  let version = 0;
  const storage = createSessionStorage(
    {
      getItem: async (key) => values.get(key) ?? null,
      setItem: async (key, value) => {
        if (++writes === failAt) throw new Error('Vault unavailable');
        assert.ok(Buffer.byteLength(value, 'utf8') < 2048);
        values.set(key, value);
      },
      removeItem: async (key) => {
        values.delete(key);
      },
    },
    () => `version-${++version}`,
  );
  return {
    values,
    storage,
    failNext: (offset) => {
      failAt = writes + offset;
    },
  };
}
test('large Unicode sessions round-trip through bounded encrypted-vault entries', async () => {
  const { storage, values } = fixture();
  const session = JSON.stringify({ token: 't'.repeat(12000), name: '🙂'.repeat(600) });
  await storage.setItem('session', session);
  assert.equal(await storage.getItem('session'), session);
  await storage.removeItem('session');
  assert.equal(await storage.getItem('session'), null);
  assert.equal(values.size, 0);
});
test('failed chunk write preserves the previous session and removes partial new pieces', async () => {
  const { storage, values, failNext } = fixture();
  await storage.setItem('session', 'previous');
  const before = [...values];
  failNext(2);
  await assert.rejects(storage.setItem('session', 'x'.repeat(3000)), /Vault unavailable/);
  assert.equal(await storage.getItem('session'), 'previous');
  assert.deepEqual([...values], before);
});
test('failed manifest commit never exposes an incomplete replacement', async () => {
  const { storage, failNext } = fixture();
  await storage.setItem('session', 'previous');
  failNext(2);
  await assert.rejects(storage.setItem('session', 'replacement'));
  assert.equal(await storage.getItem('session'), 'previous');
});
test('concurrent refresh, read and logout serialize without restoring a logged-out session', async () => {
  const { storage, values } = fixture();
  await storage.setItem('session', 'initial');
  const results = await Promise.all([
    storage.setItem('session', 'refreshed'),
    storage.getItem('session'),
    storage.removeItem('session'),
  ]);
  assert.equal(results[1], 'refreshed');
  assert.equal(await storage.getItem('session'), null);
  assert.equal(values.size, 0);
});
test('corrupt or incomplete vault contents fail closed without plaintext fallback', async () => {
  const { storage, values } = fixture();
  values.set('session', '{"version":"v1","count":9999999}');
  await assert.rejects(storage.getItem('session'));
  values.set('session', '{"version":"v1","count":1}');
  await assert.rejects(storage.getItem('session'), /Incomplete/);
});
