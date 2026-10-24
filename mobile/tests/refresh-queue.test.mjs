import assert from 'node:assert/strict';
import { setImmediate as flush } from 'node:timers/promises';
import test from 'node:test';
import { createRefreshQueue } from '../src/lib/refresh-queue.ts';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

test('bursts coalesce and events during an in-flight read cause one serialized catch-up', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const first = deferred(),
    second = deferred();
  let calls = 0;
  const values = [];
  const queue = createRefreshQueue({
    read: () => (++calls === 1 ? first.promise : second.promise),
    onValue: (value) => values.push(value),
    onError: assert.fail,
  });
  queue.request();
  queue.request();
  queue.request();
  t.mock.timers.tick(300);
  assert.equal(calls, 1);
  queue.request();
  queue.request();
  t.mock.timers.tick(300);
  assert.equal(calls, 1);
  first.resolve(['old']);
  await flush();
  t.mock.timers.tick(300);
  assert.equal(calls, 2);
  second.resolve(['new']);
  await flush();
  assert.deepEqual(values, [['old'], ['new']]);
  queue.dispose();
});

test('disposed scopes suppress pending reads and late successes or errors', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const failure of [false, true]) {
    const request = deferred();
    const queue = createRefreshQueue({
      read: () => request.promise,
      onValue: assert.fail,
      onError: assert.fail,
    });
    queue.request();
    t.mock.timers.tick(300);
    queue.request();
    queue.dispose();
    if (failure) request.reject(new Error('late failure'));
    else request.resolve('previous account');
    await flush();
    t.mock.timers.tick(1000);
  }
  const queue = createRefreshQueue({
    read: assert.fail,
    onValue: assert.fail,
    onError: assert.fail,
  });
  queue.request();
  queue.dispose();
  queue.request();
  t.mock.timers.tick(1000);
});

test('a failed read reports failure and the next request can recover', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const errors = [],
    values = [];
  let calls = 0;
  const queue = createRefreshQueue({
    read: async () => {
      if (++calls === 1) throw new Error('offline');
      return ['caught up'];
    },
    onValue: (value) => values.push(value),
    onError: (error) => errors.push(error.message),
  });
  queue.request();
  t.mock.timers.tick(300);
  await flush();
  assert.deepEqual(errors, ['offline']);
  queue.request();
  t.mock.timers.tick(300);
  await flush();
  assert.deepEqual(values, [['caught up']]);
  queue.dispose();
});
