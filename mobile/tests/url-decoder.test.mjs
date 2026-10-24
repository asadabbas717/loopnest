import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const require = createRequire(import.meta.url);
const query = require('query-string');

test('routing uses the reviewed fixed decoder through the CommonJS caller', () => {
  const fromQuery = createRequire(require.resolve('query-string'));
  assert.equal(fromQuery.resolve('decode-uri-component'), require.resolve('decode-uri-component'));
  assert.equal(typeof fromQuery('decode-uri-component'), 'function');
  const source = readFileSync(require.resolve('decode-uri-component'), 'utf8');
  const upstream = source.replace(
    'module.exports = function decodeUriComponent(encodedURI)',
    'export default function decodeUriComponent(encodedURI)',
  );
  assert.equal(
    createHash('sha256').update(upstream).digest('hex'),
    '9401353df38f8010ad7035fe8d666bce6a4902bc1cff809afc4ab23fa2e0bdaa',
  );
  assert.deepEqual(
    { ...query.parse('name=A%2BB+%E2%9C%93&item=one&item=two&empty=&flag&bad=%FF%41') },
    {
      name: 'A+B ✓',
      item: ['one', 'two'],
      empty: '',
      flag: null,
      bad: '%FFA',
    },
  );
  const params = { name: 'مرحبا + ✓', path: '/chat/a?b=c', empty: '' };
  assert.deepEqual({ ...query.parse(query.stringify(params)) }, params);
});

test('long malformed query input finishes in an isolated process without recursion exhaustion', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=commonjs',
      '-e',
      `
    const assert = require('node:assert/strict');
    const query = require('query-string');
    const bad = '%FF'.repeat(100000);
    assert.equal(query.parse('value=' + bad).value, bad);
    assert.equal(query.parse('value=' + '%E0%A4'.repeat(10000)).value.length, 60000);
  `,
    ],
    { cwd: new URL('..', import.meta.url), timeout: 5000, encoding: 'utf8', maxBuffer: 4096 },
  );
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
});
