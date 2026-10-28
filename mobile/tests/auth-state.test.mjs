import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthState } from '../src/domain/auth-state.ts';
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};

test('late bootstrap cannot restore an old account after sign-out or account switching', async () => {
  for (const next of [null, 'new-account']) {
    const values = [],
      gate = deferred();
    const state = createAuthState({ onSession: (x) => values.push(x), onError: assert.fail });
    const read = state.read(() => gate.promise);
    state.event(next);
    gate.resolve({ session: 'old-account', error: null });
    await read;
    assert.deepEqual(values, [next]);
  }
});
test('late errors and disposed scopes cannot mask newer authentication or publish stale results', async () => {
  const values = [],
    gate = deferred();
  let errors = 0;
  const state = createAuthState({ onSession: (x) => values.push(x), onError: () => errors++ });
  const read = state.read(() => gate.promise);
  state.event('current');
  gate.reject(new Error('old failure'));
  await read;
  assert.equal(errors, 0);
  assert.deepEqual(values, ['current']);
  const later = deferred(),
    pending = state.read(() => later.promise);
  state.close();
  later.resolve({ session: 'stale', error: null });
  await pending;
  state.event('ignored');
  assert.deepEqual(values, ['current']);
});
test('latest retry wins and current read failures remain visible', async () => {
  const values = [],
    gate = deferred();
  let errors = 0;
  const state = createAuthState({ onSession: (x) => values.push(x), onError: () => errors++ });
  const old = state.read(() => gate.promise);
  await state.read(async () => ({ session: 'latest', error: null }));
  gate.resolve({ session: 'old', error: null });
  await old;
  await state.read(async () => ({ session: null, error: new Error('offline') }));
  assert.deepEqual(values, ['latest']);
  assert.equal(errors, 1);
});
