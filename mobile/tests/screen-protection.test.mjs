import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScreenProtection } from '../src/domain/screen-protection.ts';

test('privacy readiness waits for native prevention and the app-switcher overlay', async () => {
  const calls = [];
  let proceed;
  const gate = new Promise((resolve) => {
    proceed = resolve;
  });
  const privacy = createScreenProtection({
    prevent: async () => {
      await gate;
      calls.push('prevent');
    },
    enableOverlay: async () => {
      calls.push('overlay');
    },
    disableOverlay: async () => {},
    allow: async () => {},
  });
  const lease = privacy.acquire();
  let ready = false;
  lease.ready.then(() => {
    ready = true;
  });
  await Promise.resolve();
  assert.equal(ready, false);
  proceed();
  await lease.ready;
  assert.deepEqual(calls, ['prevent', 'overlay']);
  await lease.release();
});
test('overlapping owners never let an older cleanup disable current screen protection', async () => {
  const calls = [];
  const privacy = createScreenProtection({
    prevent: async () => {
      calls.push('prevent');
    },
    enableOverlay: async () => {},
    disableOverlay: async () => {
      calls.push('disable');
    },
    allow: async () => {
      calls.push('allow');
    },
  });
  const first = privacy.acquire();
  await first.ready;
  const cleanup = first.release();
  const second = privacy.acquire();
  await cleanup;
  await second.ready;
  assert.equal(calls.includes('allow'), false);
  await second.release();
  await second.release();
  assert.equal(calls.filter((x) => x === 'allow').length, 1);
});
test('native setup failure rejects readiness and supports a subsequent retry', async () => {
  let fail = true;
  const privacy = createScreenProtection({
    prevent: async () => {
      if (fail) throw Error('unavailable');
    },
    enableOverlay: async () => {},
    disableOverlay: async () => {},
    allow: async () => {},
  });
  const first = privacy.acquire();
  await assert.rejects(first.ready);
  await first.release();
  fail = false;
  const next = privacy.acquire();
  await next.ready;
  await next.release();
});
