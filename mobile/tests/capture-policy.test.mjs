import assert from 'node:assert/strict';
import test from 'node:test';
import { allowsTestCapture } from '../src/domain/capture-policy.ts';

test('screen capture testing requires explicit opt-in and cannot enable capture in release builds', () => {
  assert.equal(allowsTestCapture(true, 'true'), true);
  for (const flag of [undefined, '', 'false', 'TRUE', '1', ' true '])
    assert.equal(allowsTestCapture(true, flag), false);
  for (const flag of [undefined, '', 'false', 'true', '1'])
    assert.equal(allowsTestCapture(false, flag), false);
});
