import assert from 'node:assert/strict';
import test from 'node:test';
import { expirationDeadline } from '../src/domain/ephemeral.ts';
import { createOpenPhotoApi } from '../src/lib/open-photo-api.ts';
const actor = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const asset = '00000000-0000-4000-8000-000000000003';
test('expiry uses server/monotonic time, subtracts network delay and fails closed on invalid timestamps', () => {
  assert.equal(
    expirationDeadline('2026-10-28T11:00:00Z', '2026-10-28T10:00:00Z', 1000, 1500),
    3601000,
  );
  assert.equal(expirationDeadline('2026-10-28T10:00:01Z', '2026-10-28T10:00:00Z', 0, 2000), 2000);
  assert.equal(expirationDeadline('invalid', 'invalid', 0, 250), 250);
  assert.equal(expirationDeadline(null, 'invalid', 0, 250), undefined);
});
test('one-time client binds the initiating bearer, reads binary and never retries delivery', async () => {
  let current = actor,
    calls = 0;
  const client = {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: current }, access_token: 'initiating-token' } },
        error: null,
      }),
    },
  };
  const open = createOpenPhotoApi(
    () => client,
    'https://example.invalid',
    'public-key',
    async (url, options) => {
      calls++;
      current = other;
      assert.equal(url, 'https://example.invalid/functions/v1/open-photo');
      assert.equal(options.headers.Authorization, 'Bearer initiating-token');
      assert.deepEqual(JSON.parse(options.body), { asset_id: asset });
      return new Response(new Uint8Array([255, 216, 255, 217]), {
        headers: { 'Content-Type': 'image/jpeg', 'X-Photo-View-Ms': '60000' },
      });
    },
  );
  const { blob, deadline } = await open(asset, actor, new AbortController().signal);
  assert.ok(deadline > performance.now());
  assert.ok(deadline <= performance.now() + 60000);
  assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())], [255, 216, 255, 217]);
  await assert.rejects(open(asset, actor, new AbortController().signal), /Session changed/);
  assert.equal(calls, 1);
});
test('one-time client rejects closed scopes and does not reflect server diagnostics or URLs', async () => {
  const client = {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: actor }, access_token: 'token' } },
      }),
    },
  };
  const closed = new AbortController();
  closed.abort();
  const noRequest = createOpenPhotoApi(
    () => client,
    'https://example.invalid',
    'public',
    assert.fail,
  );
  await assert.rejects(noRequest(asset, actor, closed.signal), /Photo closed/);
  for (const [status, code] of [
    [401, 'auth_required'],
    [404, 'one_time_unavailable'],
    [503, 'photo_delivery_unavailable'],
  ]) {
    let calls = 0;
    const open = createOpenPhotoApi(
      () => client,
      'https://example.invalid',
      'public',
      async () => {
        calls++;
        return new Response('secret diagnostics', { status });
      },
    );
    await assert.rejects(
      open(asset, actor, new AbortController().signal),
      (error) => error.code === code && !error.message.includes('secret'),
    );
    assert.equal(calls, 1);
  }
});
