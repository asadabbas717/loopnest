import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const require = createRequire(import.meta.url);
const expoRequire = createRequire(require.resolve('expo/package.json'));
const cliRoot = dirname(expoRequire.resolve('@expo/cli/package.json'));
const cliRequire = createRequire(join(cliRoot, 'package.json'));
const cliModule = (name) => require(join(cliRoot, 'build/src/start/server', name));

test('Expo plugin schemas and command arguments retain validation with scoped Zod 4', () => {
  const { PluginSchema, DevToolsPluginOutputSchema } = cliModule('DevToolsPlugin.schema.js');
  const { createMCPDevToolsExtensionSchema } = cliModule('createMCPDevToolsExtensionSchema.js');
  const plugin = {
    packageName: 'synthetic-plugin',
    packageRoot: '/synthetic-plugin',
    cliExtensions: {
      description: 'Synthetic test only',
      entryPoint: 'index.js',
      commands: [
        {
          name: 'check',
          title: 'Check',
          environments: ['cli', 'mcp'],
          parameters: [
            { name: 'count', type: 'number' },
            { name: 'confirm', type: 'confirm' },
            { name: 'text', type: 'text' },
          ],
        },
      ],
    },
  };
  assert.equal(PluginSchema.safeParse(plugin).success, true);
  assert.equal(
    PluginSchema.safeParse({ ...plugin, cliExtensions: { ...plugin.cliExtensions, commands: [] } })
      .success,
    false,
  );
  const schema = createMCPDevToolsExtensionSchema(plugin);
  assert.equal(
    schema.safeParse({ command: 'check', count: 2, confirm: true, text: 'hello' }).success,
    true,
  );
  for (const invalid of [
    { command: 'unknown' },
    { command: 'check', count: '2' },
    { command: 'check', confirm: 'yes' },
    { command: 'check', unexpected: true },
  ])
    assert.equal(schema.safeParse(invalid).success, false);
  assert.equal(
    DevToolsPluginOutputSchema.safeParse([
      { type: 'text', text: 'ok', level: 'info' },
      { type: 'image', url: 'https://example.invalid/image' },
    ]).success,
    true,
  );
  const invalid = DevToolsPluginOutputSchema.safeParse([{ type: 'image', url: 'invalid URL' }]);
  assert.equal(invalid.success, false);
  assert.ok(invalid.error.issues.length);
  const { DevToolsPluginCliExtensionResults } = cliModule('DevToolsPluginCliExtensionResults.js');
  const output = new DevToolsPluginCliExtensionResults();
  output.append(JSON.stringify([{ type: 'text', text: 'ok', level: 'info' }]));
  output.append(JSON.stringify([{ type: 'image', url: 'invalid URL' }]));
  assert.equal(output.getOutput()[0].text, 'ok');
  assert.equal(output.getOutput()[1].level, 'error');
});

test('the Zod resolved by Expo rejects oversized constrained arrays before parsing children', () => {
  const { z } = cliRequire('zod');
  let visited = 0;
  const schema = z
    .array(
      z.string().superRefine(() => {
        visited++;
      }),
    )
    .max(3);
  const result = schema.safeParse(Array(100000).fill('synthetic'));
  assert.equal(result.success, false);
  assert.equal(visited, 0);
  assert.equal(result.error.issues.length, 1);
  assert.equal(result.error.issues[0].code, 'too_big');
});

test('patched Forge preserves Expo certificate signing and rejects extra DigestAlgorithm fields', () => {
  const certs = cliRequire('@expo/code-signing-certificates');
  const certRequire = createRequire(cliRequire.resolve('@expo/code-signing-certificates'));
  const forge = certRequire('node-forge');
  const keyPair = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 65537 });
  const now = Date.now();
  const certificate = certs.generateSelfSignedCodeSigningCertificate({
    keyPair,
    validityNotBefore: new Date(now - 60000),
    validityNotAfter: new Date(now + 3600000),
    commonName: 'Synthetic regression certificate',
  });
  certs.validateSelfSignedCertificate(certificate, keyPair);
  const pem = certs.convertCertificateToCertificatePEM(certificate);
  assert.equal(forge.pem.decode(Buffer.from(pem))[0].type, 'CERTIFICATE');
  const payload = Buffer.from('synthetic bundle');
  assert.ok(certs.signBufferRSASHA256AndVerify(keyPair.privateKey, certificate, payload));
  const digest = forge.md.sha256.create().update(payload.toString('binary')).digest().getBytes();
  const { asn1 } = forge;
  const malformed = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
      asn1.create(
        asn1.Class.UNIVERSAL,
        asn1.Type.OID,
        false,
        asn1.oidToDer(forge.pki.oids.sha256).getBytes(),
      ),
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, ''),
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, ''),
    ]),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, digest),
  ]);
  const signature = keyPair.privateKey.sign(asn1.toDer(malformed).getBytes(), 'NONE');
  let accepted = false;
  try {
    accepted = keyPair.publicKey.verify(digest, signature);
  } catch {
    /* Explicit rejection is valid. */
  }
  assert.equal(accepted, false);
});

test('Expo config resolves the documented local merge fix with no unrelated source edits', () => {
  const configRequire = createRequire(expoRequire.resolve('@expo/config'));
  assert.equal(configRequire.resolve('deepmerge'), require.resolve('deepmerge'));
  const source = readFileSync(configRequire.resolve('deepmerge'), 'utf8').replaceAll('\r\n', '\n');
  const upstream = source
    .replace(
      "function keyIsForbidden(key) {\n\treturn key === '__proto__' || key === 'constructor' || key === 'prototype'\n}\n\n",
      '',
    )
    .replaceAll(/\n\t+if \(keyIsForbidden\(key\)\) return/g, '');
  assert.equal(
    createHash('sha256').update(upstream).digest('hex'),
    '2e5160f84a1141bd927264afe4d15766f1e6cf07daef182b37ff53fea121de7d',
  );
  // Reproduce the pre-fix result using only the hash-verified source and tiny
  // synthetic data, then the following tests require the fixed path to reject it.
  const legacy = { exports: {} };
  runInNewContext(upstream, { module: legacy }, { timeout: 1000 });
  const poisoned = legacy.exports(
    { session: null },
    JSON.parse('{"session":{"__proto__":{"admin":true}}}'),
  );
  assert.equal(poisoned.session.admin, true);
});

test('merge rejects prototype keys from both operands including null and nested placeholders', () => {
  const merge = require('deepmerge');
  const malicious = JSON.parse(
    '{"__proto__":{"admin":true},"constructor":{"prototype":{"admin":true}},"prototype":{"admin":true},"safe":1}',
  );
  for (const target of [{}, Object.create(null), malicious]) {
    const output = merge(target, malicious);
    assert.equal(Object.getPrototypeOf(output), Object.prototype);
    assert.equal(output.admin, undefined);
    for (const key of ['__proto__', 'constructor', 'prototype'])
      assert.equal(Object.hasOwn(output, key), false);
    assert.equal(output.safe, 1);
  }
  for (const placeholder of [null, undefined, 1]) {
    const output = merge({ session: placeholder }, { session: malicious });
    assert.equal(output.session.admin, undefined);
    assert.equal(Object.getPrototypeOf(output.session), Object.prototype);
  }
  assert.equal({}.admin, undefined);
});

test('configuration merge preserves cloning, symbols, arrays and caller merge options', () => {
  const merge = require('deepmerge');
  const symbol = Symbol('metadata');
  const source = { nested: { y: 2 }, list: [{ x: 1 }], [symbol]: 'kept' };
  const result = merge({ nested: { x: 1 }, list: [1] }, source);
  assert.deepEqual(result.nested, { x: 1, y: 2 });
  assert.deepEqual(result.list, [1, { x: 1 }]);
  assert.notEqual(result.nested, source.nested);
  assert.notEqual(result.list[1], source.list[0]);
  assert.equal(result[symbol], 'kept');
  assert.deepEqual(
    merge({ list: [1, 2] }, { list: [2, 3] }, { arrayMerge: (a, b) => [...new Set([...a, ...b])] }),
    { list: [1, 2, 3] },
  );
  assert.equal(merge({}, source, { clone: false }).nested, source.nested);
  assert.deepEqual(merge.all([{ a: 1 }, { b: 2 }]), { a: 1, b: 2 });
  assert.deepEqual(
    merge(
      { nested: { a: 1 } },
      { nested: { b: 2 } },
      { customMerge: (key) => (key === 'nested' ? () => ({ custom: true }) : undefined) },
    ),
    { nested: { custom: true } },
  );
});

test('Expo config modification preserves plugin settings and rejects nested prototype poisoning', async (t) => {
  const tempRoot = realpathSync(tmpdir());
  const root = realpathSync(mkdtempSync(join(tempRoot, 'loopnest-config-')));
  t.after(() => {
    if (dirname(root) !== tempRoot || !basename(root).startsWith('loopnest-config-'))
      throw new Error('Unexpected fixture cleanup path');
    rmSync(root, { recursive: true, force: true });
  });
  const config = {
    expo: {
      name: 'Synthetic',
      slug: 'synthetic',
      extra: { session: null },
      plugins: [['synthetic-plugin', { nested: { x: 1 } }]],
    },
  };
  const original = JSON.stringify(config);
  writeFileSync(join(root, 'app.json'), original);
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: 'synthetic', version: '1.0.0' }),
  );
  const { modifyConfigAsync } = expoRequire('@expo/config');
  const result = await modifyConfigAsync(
    root,
    {
      extra: JSON.parse('{"session":{"__proto__":{"admin":true},"ok":true}}'),
      plugins: [['synthetic-plugin', { nested: { y: 2 } }]],
    },
    { skipSDKVersionRequirement: true, skipPlugins: true },
    { dryRun: true },
  );
  assert.equal(result.type, 'success');
  assert.equal(result.config.extra.session.admin, undefined);
  assert.equal(result.config.extra.session.ok, true);
  assert.deepEqual(result.config.plugins[0][1].nested, { x: 1, y: 2 });
  assert.equal(readFileSync(join(root, 'app.json'), 'utf8'), original);
});
