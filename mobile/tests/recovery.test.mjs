import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRecoveryApi } from '../src/lib/recovery-api.ts';

test('recovery cannot change a password before verification and validates the code', async () => {
  const api = createRecoveryApi({ auth: {} });
  await assert.rejects(api.complete('long-enough-password'));
  await assert.rejects(api.verify('test@example.test', 'invalid'));
});
test('retrying failed global sign-out does not repeat a completed password change', async () => {
  let updates = 0;
  let signouts = 0;
  const api = createRecoveryApi({
    auth: {
      verifyOtp: async () => ({
        data: { user: { email: 'test@example.test' }, session: {} },
        error: null,
      }),
      updateUser: async () => {
        updates++;
        return { error: null };
      },
      signOut: async ({ scope }) => {
        assert.equal(scope, 'global');
        return { error: ++signouts === 1 ? new Error('offline') : null };
      },
    },
  });
  await api.verify('test@example.test', '123456');
  await assert.rejects(api.complete('a-new-long-password'));
  await api.complete('a-new-long-password');
  assert.equal(updates, 1);
  assert.equal(signouts, 2);
});
