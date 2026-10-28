import { test } from 'node:test';
import assert from 'node:assert/strict';
import jpeg from 'jpeg-js';
import { sanitizePhoto } from '../../supabase/functions/_shared/photo-codec.ts';
import { photoUploadHandler } from '../../supabase/functions/_shared/photo-upload.ts';
const id = '00000000-0000-4000-8000-000000000001';
const original = jpeg.encode(
  { width: 2, height: 2, data: Buffer.alloc(16, 255), comments: ['private-comment'] },
  70,
).data;

test('profile-photo codec enforces smaller trusted dimensions and byte bounds', () => {
  const limits = { dimension: 320, bytes: 262144 };
  assert.ok(sanitizePhoto(original, jpeg, limits).length < 262144);
  assert.throws(() => sanitizePhoto(Buffer.alloc(262145), jpeg, limits));
  const wide = jpeg.encode({ width: 321, height: 1, data: Buffer.alloc(321 * 4, 255) }, 70).data;
  assert.throws(() => sanitizePhoto(wide, jpeg, limits));
  assert.ok(sanitizePhoto(wide, jpeg).length > 0, 'ordinary chat dimensions remain supported');
});

test('trusted photo codec decodes and re-encodes pixels without EXIF, comments or trailing payload', () => {
  const exif = Buffer.from('Exif\0\0PRIVATE-GPS-METADATA');
  const size = exif.length + 2;
  const input = Buffer.concat([
    original.subarray(0, 2),
    Buffer.from([255, 225, size >> 8, size & 255]),
    exif,
    original.subarray(2),
    Buffer.from('TRAILING-SECRET'),
  ]);
  const output = sanitizePhoto(input, jpeg);
  const decoded = jpeg.decode(output, { useTArray: true });
  assert.equal(decoded.width, 2);
  assert.equal(decoded.height, 2);
  assert.equal(decoded.exifBuffer, undefined);
  assert.equal(decoded.comments?.length ?? 0, 0);
  assert.equal(Buffer.from(output).includes(exif), false);
  assert.equal(Buffer.from(output).includes(Buffer.from('private-comment')), false);
  assert.equal(Buffer.from(output).includes(Buffer.from('TRAILING-SECRET')), false);
});
test('codec rejects malformed, over-byte-limit and oversized-frame inputs before decoding large frames', () => {
  assert.throws(() => sanitizePhoto(Buffer.from('<html>not a photo</html>'), jpeg));
  assert.throws(() => sanitizePhoto(Buffer.alloc(1048577), jpeg));
  assert.throws(() => sanitizePhoto(original.subarray(0, original.length - 10), jpeg));
  const large = Buffer.from(original);
  const frame = large.indexOf(Buffer.from([255, 192]));
  large[frame + 7] = 127;
  large[frame + 8] = 255;
  let called = false;
  assert.throws(() =>
    sanitizePhoto(large, {
      decode: () => {
        called = true;
        throw Error('must not decode');
      },
      encode: () => {
        throw Error('must not encode');
      },
    }),
  );
  assert.equal(called, false);
});
test('the maximum native resize dimensions fit the bounded server decoder', () => {
  const image = jpeg.encode(
    { width: 1280, height: 1280, data: Buffer.alloc(1280 * 1280 * 4, 255) },
    70,
  ).data;
  const output = sanitizePhoto(image, jpeg);
  const decoded = jpeg.decode(output, {
    useTArray: true,
    maxResolutionInMP: 1.7,
    maxMemoryUsageInMB: 64,
  });
  assert.equal(decoded.width, 1280);
  assert.equal(decoded.height, 1280);
  assert.ok(output.length <= 1048576);
});
function fixture() {
  const calls = [];
  const deps = {
    actor: async () => id,
    claim: async () => {
      calls.push('claim');
      return { id, path: 'server/path.jpg' };
    },
    sanitize: (bytes) => {
      calls.push('sanitize');
      return sanitizePhoto(bytes, jpeg);
    },
    store: async () => {
      calls.push('store');
    },
  };
  const request = (body = original, headers = {}) =>
    new Request('https://example.test/upload-photo', {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'content-type': 'image/jpeg',
        'x-photo-id': id,
        ...headers,
      },
      body,
    });
  return { calls, deps, request };
}
test('photo endpoint verifies identity and ownership before processing and stores only validated output', async () => {
  const { calls, deps, request } = fixture();
  assert.equal(
    (await photoUploadHandler({ ...deps, actor: async () => null })(request())).status,
    401,
  );
  assert.deepEqual(calls, []);
  assert.equal(
    (await photoUploadHandler({ ...deps, claim: async () => null })(request())).status,
    403,
  );
  assert.equal((await photoUploadHandler(deps)(request())).status, 200);
  assert.deepEqual(calls, ['claim', 'sanitize', 'store']);
});
test('bad image bytes, MIME, oversize streams and persistence failures never report upload success', async () => {
  const { calls, deps, request } = fixture();
  assert.equal(
    (await photoUploadHandler(deps)(request(original, { 'content-type': 'text/html' }))).status,
    415,
  );
  assert.equal((await photoUploadHandler(deps)(request(Buffer.alloc(1048577)))).status, 413);
  assert.equal((await photoUploadHandler(deps)(request(Buffer.from('invalid')))).status, 422);
  assert.equal(calls.includes('store'), false);
  const response = await photoUploadHandler({
    ...deps,
    store: async () => {
      throw Error('secret storage error');
    },
  })(request());
  assert.equal(response.status, 503);
  assert.equal((await response.text()).includes('secret'), false);
});
