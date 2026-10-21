import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountErasureHandler } from '../../supabase/functions/_shared/erasure.ts';

const request = (body, token = 'verified-token') =>
  new Request('http://localhost/delete-account', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
function fixture() {
  const calls = [];
  const deps = {
    actor: async () => ({ id: 'real-user', email: 'synthetic@example.test' }),
    reauthenticate: async () => true,
    freeze: async (id) => {
      calls.push(`freeze:${id}`);
    },
    paths: async () => ['private-photo.jpg'],
    remove: async () => {
      calls.push('media');
    },
    deleteUser: async (id) => {
      calls.push(`delete:${id}`);
    },
  };
  return { deps, calls };
}
test('erasure requires verified auth, current password, confirmation, and rejects supplied target IDs', async () => {
  const { deps, calls } = fixture();
  const handler = accountErasureHandler(deps);
  assert.equal(
    (await handler(request({ password: 'valid', confirmation: 'DELETE' }, ''))).status,
    401,
  );
  assert.equal(
    (await handler(request({ password: 'valid', confirmation: 'DELETE', user_id: 'victim' })))
      .status,
    400,
  );
  assert.equal(
    (
      await accountErasureHandler({ ...deps, actor: async () => null })(
        request({ password: 'valid', confirmation: 'DELETE' }),
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await accountErasureHandler({ ...deps, reauthenticate: async () => false })(
        request({ password: 'wrong', confirmation: 'DELETE' }),
      )
    ).status,
    403,
  );
  assert.deepEqual(calls, []);
});
test('erasure freezes first, removes media before account deletion and targets only verified user', async () => {
  const { deps, calls } = fixture();
  const response = await accountErasureHandler(deps)(
    request({ password: 'valid', confirmation: 'DELETE' }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(calls, ['freeze:real-user', 'media', 'delete:real-user']);
});
test('failed media cleanup never deletes the account or falsely reports success', async () => {
  const { deps, calls } = fixture();
  const handler = accountErasureHandler({
    ...deps,
    remove: async () => {
      throw new Error('offline');
    },
  });
  const response = await handler(request({ password: 'valid', confirmation: 'DELETE' }));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).deleted, false);
  assert.deepEqual(calls, ['freeze:real-user']);
});
test('erasure bounds request bodies and never logs or reflects secrets', async () => {
  const { deps } = fixture();
  const response = await accountErasureHandler(deps)(
    request({ password: 'secret'.repeat(1000), confirmation: 'DELETE' }),
  );
  assert.equal(response.status, 413);
  assert.equal((await response.text()).includes('secret'), false);
});
test('erasure reports wrong password separately from unavailable Auth or throttling', async () => {
  const { deps, calls } = fixture();
  const attempt = (reauthenticate) =>
    accountErasureHandler({ ...deps, reauthenticate })(
      request({ password: 'private-password', confirmation: 'DELETE' }),
    );
  assert.equal((await (await attempt(async () => false)).json()).code, 'wrong_password');
  assert.equal(
    (
      await (
        await attempt(async () => {
          throw new Error('Auth unavailable');
        })
      ).json()
    ).code,
    'deletion_unavailable',
  );
  const throttled = await attempt(async () => {
    throw { code: 'over_request_rate_limit' };
  });
  assert.equal(throttled.status, 429);
  assert.equal((await throttled.json()).code, 'rate_limited');
  assert.deepEqual(calls, []);
});
