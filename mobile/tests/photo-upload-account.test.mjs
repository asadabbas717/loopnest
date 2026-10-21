import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPhotoUploadApi } from '../src/lib/photo-upload-api.ts';
const alice = '00000000-0000-4000-8000-000000000001';
const bob = '00000000-0000-4000-8000-000000000002';
const asset = '00000000-0000-4000-8000-000000000003';
test('a changed account cannot upload previous-account bytes into a new-account reservation', async () => {
  let sent = false;
  const client = {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: alice }, access_token: 'alice-token' } },
      }),
    },
    rpc: () => ({ single: async () => ({ data: { id: asset, owner_id: bob } }) }),
    functions: {
      invoke: async () => {
        sent = true;
        return {};
      },
    },
  };
  await assert.rejects(
    createPhotoUploadApi(() => client).upload(asset, new ArrayBuffer(1), alice),
    /Session changed/,
  );
  assert.equal(sent, false);
});
test('an upload keeps its initiating bearer even if session state changes after reservation', async () => {
  let current = alice;
  const client = {
    auth: {
      getSession: async () => ({
        data: {
          session: {
            user: { id: current },
            access_token: current === alice ? 'alice-token' : 'bob-token',
          },
        },
      }),
    },
    rpc: () => ({
      single: async () => {
        current = bob;
        return { data: { id: asset, owner_id: alice } };
      },
    }),
    functions: {
      invoke: async (_name, options) => {
        assert.equal(current, bob);
        assert.equal(options.headers.Authorization, 'Bearer alice-token');
        return { data: { assetId: asset } };
      },
    },
  };
  assert.equal(
    await createPhotoUploadApi(() => client).upload(asset, new ArrayBuffer(1), alice),
    asset,
  );
  await assert.rejects(
    createPhotoUploadApi(() => client).upload(asset, new ArrayBuffer(1), alice),
    /Session changed/,
  );
});
