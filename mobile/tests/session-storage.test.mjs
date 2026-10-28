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

test('corrupt session markers can be cleared and incomplete chunks cannot trap later sign-in', async () => {
  const { storage, values } = fixture();
  values.set('session', 'not JSON');
  await storage.removeItem('session');
  assert.equal(await storage.getItem('session'), null);
  values.set('session', '{"version":"bad","count":999999}');
  await assert.rejects(storage.getItem('session'), /Invalid stored/);
  assert.equal(await storage.getItem('session'), null);
  await storage.setItem('session', 'x'.repeat(1000));
  const marker = JSON.parse(values.get('session'));
  values.delete(`session.${marker.version}.1`);
  await assert.rejects(storage.getItem('session'), /Incomplete/);
  assert.equal(values.size, 0);
  await storage.setItem('session', 'fresh valid session');
  assert.equal(await storage.getItem('session'), 'fresh valid session');
});
test('temporary vault read failure does not erase a potentially valid session', async () => {
  let removals = 0;
  const storage = createSessionStorage(
    {
      getItem: async () => {
        throw new Error('Vault locked');
      },
      setItem: async () => {},
      removeItem: async () => {
        removals++;
      },
    },
    () => 'version',
  );
  await assert.rejects(storage.getItem('session'), /Vault locked/);
  assert.equal(removals, 0);
});
