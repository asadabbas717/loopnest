import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanAbandonedPhotos } from '../scripts/photo-cleanup.mjs';

function fixture({ failStorage = false, endless = false } = {}) {
  const calls = [];
  let finished = false;
  const client = {
    rpc: async (name) => {
      calls.push(name);
      if (name === 'photo_cleanup_count') return { data: finished ? 0 : 1 };
      if (name === 'claim_photo_cleanup')
        return { data: finished && !endless ? [] : [{ id: 'asset', path: 'private.jpg' }] };
      finished = true;
      return { data: 1 };
    },
    storage: {
      from: (bucket) => {
        assert.equal(bucket, 'chat-photos');
        return {
          remove: async (paths) => {
            assert.deepEqual(paths, ['private.jpg']);
            calls.push('physical-delete');
            return { error: failStorage ? new Error('internal secret details') : null };
          },
        };
      },
    },
  };
  return { client, calls };
}

test('photo maintenance defaults to a non-mutating count-only dry run', async () => {
  const { client, calls } = fixture();
  assert.deepEqual(await cleanAbandonedPhotos(client), { dryRun: true, eligible: 1, removed: 0 });
  assert.deepEqual(calls, ['photo_cleanup_count']);
});
test('photo maintenance removes physical media before finalizing metadata', async () => {
  const { client, calls } = fixture();
  assert.deepEqual(await cleanAbandonedPhotos(client, { apply: true }), {
    dryRun: false,
    eligible: 1,
    removed: 1,
    remaining: 0,
  });
  assert.deepEqual(calls.slice(1, 4), [
    'claim_photo_cleanup',
    'physical-delete',
    'finish_photo_cleanup',
  ]);
});
test('failed physical removal preserves retryable metadata and sanitizes errors', async () => {
  const { client, calls } = fixture({ failStorage: true });
  await assert.rejects(
    cleanAbandonedPhotos(client, { apply: true }),
    /Physical photo cleanup failed; retry maintenance\./,
  );
  assert.equal(calls.includes('finish_photo_cleanup'), false);
});
test('photo maintenance bounds work and rejects invalid bounds', async () => {
  const { client, calls } = fixture({ endless: true });
  await cleanAbandonedPhotos(client, { apply: true, maxBatches: 2 });
  assert.equal(calls.filter((name) => name === 'claim_photo_cleanup').length, 2);
  await assert.rejects(cleanAbandonedPhotos(client, { apply: true, maxBatches: 0 }));
});
