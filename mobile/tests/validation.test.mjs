import { test } from 'node:test';
import assert from 'node:assert/strict';
import { username, displayName, credentials, messageText, uuid } from '../src/domain/validation.ts';

test('handles normalize but disallow email addresses, paths, SQL syntax and ambiguous characters', () => {
  assert.equal(username(' Alice_42 '), 'alice_42');
  for (const value of [
    'ab',
    '1alice',
    'a/b',
    'a@example.test',
    "alice';--",
    'Ａlice',
    'a'.repeat(25),
  ])
    assert.throws(() => username(value));
});
test('display names trim and use Unicode code points rather than UTF-16 length', () => {
  assert.equal(displayName(' Ada '), 'Ada');
  assert.doesNotThrow(() => displayName('🙂'.repeat(60)));
  assert.throws(() => displayName('🙂'.repeat(61)));
  assert.throws(() => displayName('  '));
});
test('authentication preserves password bytes and requires long signup passwords', () => {
  assert.deepEqual(credentials(' person@example.test ', ' secret with spaces ', true), {
    email: 'person@example.test',
    password: ' secret with spaces ',
  });
  assert.throws(() => credentials('bad', 'long-password', true));
  assert.throws(() => credentials('a@example.test', 'short', true));
  assert.doesNotThrow(() => credentials('a@example.test', 'short', false));
});
test('messages require content or a photo and match PostgreSQL character limits', () => {
  assert.equal(messageText(' hi ', false), 'hi');
  assert.equal(messageText(' ', true), '');
  assert.throws(() => messageText(' ', false));
  assert.doesNotThrow(() => messageText('🙂'.repeat(4000), false));
  assert.throws(() => messageText('🙂'.repeat(4001), false));
});
test('route identifiers reject query injection and malformed UUIDs', () => {
  assert.equal(
    uuid('00000000-0000-4000-8000-000000000001'),
    '00000000-0000-4000-8000-000000000001',
  );
  for (const value of [
    'not-an-id',
    'id.eq.anything',
    '../../private',
    '00000000-0000-4000-8000-000000000001/',
  ])
    assert.throws(() => uuid(value));
});
