import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);

test('legacy import rules still enforce forbidden paths through their makeRe test contract', async () => {
  const { ESLint } = require('eslint');
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        plugins: { import: require('eslint-plugin-import') },
        rules: { 'import/no-internal-modules': ['error', { forbid: ['library/private/**'] }] },
      },
    ],
  });
  const [denied] = await eslint.lintText("import value from 'library/private/item';", {
    filePath: 'fixture.js',
  });
  assert.equal(denied.errorCount, 1);
  assert.equal(denied.messages[0].ruleId, 'import/no-internal-modules');
  const [allowed] = await eslint.lintText("import value from 'library/public';", {
    filePath: 'fixture.js',
  });
  assert.equal(allowed.errorCount, 0);
});

test('legacy lint consumers use the callable patched matcher; modern consumers keep named exports', () => {
  const matcher = require('minimatch');
  for (const parent of [
    'eslint',
    '@eslint/config-array',
    '@eslint/eslintrc',
    'eslint-plugin-import',
    'eslint-plugin-react',
  ]) {
    const consumer = createRequire(require.resolve(parent));
    assert.equal(consumer('minimatch'), matcher, parent);
  }
  assert.equal(typeof matcher, 'function');
  assert.equal(matcher('src/chat.tsx', '**/*.{ts,tsx}'), true);
  assert.equal(matcher('src/.private.ts', '**/*.ts'), false);
  assert.equal(matcher('src/.private.ts', '**/*.ts', { dot: true }), true);
  assert.equal(matcher('a/b/view.ts', '*.ts', { matchBase: true }), true);
  assert.equal(matcher('a.js', '!*.ts'), true);
  assert.equal(matcher('Component', '@(Component|Other)'), true);
  assert.equal(matcher.makeRe('*.tsx').test('view.tsx'), true);
  assert.deepEqual(matcher.braceExpand('a{1,2}.ts'), ['a1.ts', 'a2.ts']);
  assert.deepEqual(matcher.match(['a.ts', 'b.js'], '*.ts'), ['a.ts']);
  assert.equal(matcher.filter('*.ts')('a.ts'), true);
  assert.equal(matcher.defaults({ nocase: true })('A.TS', '*.ts'), true);
  assert.equal(new matcher.Minimatch('**/*.ts').match('src/a.ts'), true);
  assert.equal(typeof matcher.GLOBSTAR, 'symbol');
  for (const parent of ['@expo/fingerprint', '@typescript-eslint/typescript-estree', 'glob']) {
    const consumer = createRequire(require.resolve(parent));
    assert.equal(typeof consumer('minimatch').minimatch, 'function', parent);
    assert.equal(consumer('minimatch/package.json').version, '11.0.1', parent);
  }
});

test('patched matcher bounds hostile expansion and glob cancellation prevents traversal', async () => {
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      `
    const {Minimatch}=require('minimatch');
    try { new Minimatch('**/../'.repeat(20)+'x', {optimizationLevel:2,braceExpandMax:64}); }
    catch (error) { if (!(error instanceof Error)) process.exit(1); }
  `,
    ],
    { cwd: new URL('../', import.meta.url), timeout: 5000 },
  );
  assert.equal(result.error, undefined, 'hostile pattern must terminate within five seconds');
  assert.equal(result.status, 0);
  const { glob, globSync } = require('glob');
  assert.equal(require('glob/package.json').version, '14.0.2');
  const root = fs.mkdtempSync(join(tmpdir(), 'loopnest-glob-'));
  try {
    fs.mkdirSync(join(root, 'src'));
    for (const file of ['a.ts', 'b.tsx', 'c.js', '.hidden.ts'])
      fs.writeFileSync(join(root, 'src', file), '');
    const options = { cwd: root, ignore: ['**/c.js'], posix: true };
    const expected = ['src/a.ts', 'src/b.tsx'];
    assert.deepEqual((await glob('**/*.{ts,tsx,js}', options)).sort(), expected);
    assert.deepEqual(globSync('**/*.{ts,tsx,js}', options).sort(), expected);
    let reads = 0;
    const controller = new AbortController();
    controller.abort(new Error('synthetic cancellation'));
    await assert.rejects(
      glob('**/*', {
        cwd: root,
        signal: controller.signal,
        fs: {
          ...fs,
          readdir(...args) {
            reads++;
            return fs.readdir(...args);
          },
        },
      }),
      /synthetic cancellation/,
    );
    assert.equal(reads, 0, 'pre-aborted traversal must not read directories');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
