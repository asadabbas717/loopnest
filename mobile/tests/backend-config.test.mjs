import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backendConfiguration } from '../src/domain/backend-config.ts';

const key = 'sb_publishable_testkey';
const jwt = (role) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
test('hosted configuration requires HTTPS and a publishable key', () => {
  const input = { url: 'https://example.supabase.co', key, allowLocal: false, development: false };
  assert.equal(backendConfiguration(input), 'hosted');
  for (const bad of [
    'sb_secret_private',
    jwt('service_role'),
    jwt('anon'),
    'sb_publishable_REPLACE_ME',
  ])
    assert.equal(backendConfiguration({ ...input, key: bad }), null);
  for (const url of [
    'http://example.supabase.co',
    'https://example.supabase.co.evil.test',
    'https://user@example.supabase.co',
    'https://example.supabase.co/path',
  ])
    assert.equal(backendConfiguration({ ...input, url }), null);
});
test('local backend requires both debug runtime and explicit opt-in', () => {
  for (const host of ['localhost', '127.0.0.1', '10.0.2.2']) {
    const input = {
      url: `http://${host}:54321`,
      key: jwt('anon'),
      allowLocal: true,
      development: true,
    };
    assert.equal(backendConfiguration(input), 'local');
    assert.equal(backendConfiguration({ ...input, development: false }), null);
    assert.equal(backendConfiguration({ ...input, allowLocal: false }), null);
    assert.equal(backendConfiguration({ ...input, key: jwt('service_role') }), null);
    assert.equal(backendConfiguration({ ...input, key: 'malformed' }), null);
  }
});
test('local configuration never allows arbitrary LAN hosts, ports, credentials, or paths', () => {
  for (const url of [
    'http://192.168.1.20:54321',
    'http://10.0.2.2:80',
    'http://127.0.0.1:54321/path',
    'http://127.0.0.1.evil.test:54321',
    'http://user:pass@localhost:54321',
  ])
    assert.equal(backendConfiguration({ url, key, development: true, allowLocal: true }), null);
});
