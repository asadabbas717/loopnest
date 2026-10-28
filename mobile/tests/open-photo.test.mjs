import assert from 'node:assert/strict';
import test from 'node:test';
import { openPhotoHandler } from '../../supabase/functions/_shared/open-photo.ts';
const id = '00000000-0000-4000-8000-000000000001';
const request = (body = JSON.stringify({ asset_id: id }), headers = {}) =>
  new Request('https://example.invalid/open-photo', {
    method: 'POST',
    headers: { Authorization: 'Bearer synthetic-token', ...headers },
    body,
  });

test('one-time delivery authenticates, claims once and sends non-cacheable binary without a URL', async () => {
  const steps = [];
  let claimed = false;
  const handler = openPhotoHandler({
    actor: async (token) => {
      assert.equal(token, 'synthetic-token');
      steps.push('auth');
      return 'recipient';
    },
    claim: async (actor, asset) => {
      assert.equal(actor, 'recipient');
      assert.equal(asset, id);
      steps.push('claim');
      if (claimed) return null;
      claimed = true;
      return 'server-only-path';
    },
    read: async (path) => {
      assert.equal(path, 'server-only-path');
      steps.push('read');
      return new Uint8Array([255, 216, 255, 217]);
    },
  });
  const result = await handler(request());
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('Content-Type'), 'image/jpeg');
  assert.match(result.headers.get('Cache-Control'), /no-store/);
  assert.deepEqual([...new Uint8Array(await result.arrayBuffer())], [255, 216, 255, 217]);
  assert.deepEqual(steps, ['auth', 'claim', 'read']);
  const retry = await handler(request());
  assert.equal(retry.status, 404);
  assert.deepEqual(await retry.json(), { code: 'photo_unavailable' });
  assert.equal(steps.filter((x) => x === 'read').length, 1);
});

test('one-time delivery bounds input, denies browser/anonymous access, and fails closed after a claim', async () => {
  let claims = 0;
  const handler = openPhotoHandler({
    actor: async () => 'recipient',
    claim: async () => {
      claims++;
      return 'private-path';
    },
    read: async () => {
      throw new Error('secret credential or path must not be reflected');
    },
  });
  assert.equal(
    (await handler(new Request('https://example.invalid', { method: 'POST' }))).status,
    401,
  );
  assert.equal((await handler(request('{}', { Origin: 'https://malicious.invalid' }))).status, 403);
  assert.equal((await handler(request('x'.repeat(513)))).status, 413);
  assert.equal((await handler(request('{invalid'))).status, 400);
  assert.equal((await handler(request('{"asset_id":"invalid"}'))).status, 400);
  assert.equal(claims, 0);
  const failed = await handler(request());
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { code: 'photo_delivery_unavailable' });
  assert.equal(claims, 1);
});
