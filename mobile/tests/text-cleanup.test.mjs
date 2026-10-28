import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanExpiredText } from '../scripts/text-cleanup.mjs';
test('expired text maintenance defaults to count-only and bounds apply work', async () => {
  const calls = [];
  let remaining = 501;
  const client = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === 'expired_text_cleanup_count') return { data: remaining, error: null };
      const removed = Math.min(remaining, 500);
      remaining -= removed;
      return { data: removed, error: null };
    },
  };
  assert.deepEqual(await cleanExpiredText(client), { dryRun: true, eligible: 501, removed: 0 });
  assert.equal(calls.length, 1);
  assert.deepEqual(await cleanExpiredText(client, { apply: true, maxBatches: 1 }), {
    dryRun: false,
    eligible: 501,
    removed: 500,
    remaining: 1,
  });
  assert.equal((await cleanExpiredText(client, { apply: true })).remaining, 0);
  assert.equal(calls.filter((x) => x.name === 'purge_expired_messages').length, 2);
});
test('text maintenance fails without reflecting diagnostics or exceeding batch bounds', async () => {
  for (const value of [0, 101, 1.5])
    await assert.rejects(cleanExpiredText({}, { maxBatches: value }), /Invalid cleanup bound/);
  await assert.rejects(
    cleanExpiredText({ rpc: async () => ({ error: new Error('secret diagnostic') }) }),
    (e) => !e.message.includes('secret'),
  );
  await assert.rejects(
    cleanExpiredText(
      { rpc: async (name) => ({ data: name === 'expired_text_cleanup_count' ? 1 : 501 }) },
      { apply: true },
    ),
    /Invalid cleanup result/,
  );
});
