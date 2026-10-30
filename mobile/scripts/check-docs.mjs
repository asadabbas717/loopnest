import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const files = execFileSync('git', ['ls-files', '-z', '--', '*.md'], { cwd: root, encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const broken = [];
for (const file of files) {
  const markdown = new TextDecoder('utf-8', { fatal: true })
    .decode(readFileSync(resolve(root, file)))
    .replace(/```[^]*?```/g, '');
  for (const match of markdown.matchAll(/!?\[[^\]\n]*\]\(([^)\n]+)\)/g)) {
    const target = match[1].trim().replace(/^<|>$/g, '').split('#')[0];
    if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//')) continue;
    if (!existsSync(resolve(root, dirname(file), decodeURIComponent(target))))
      broken.push(`${file}: ${target}`);
  }
}
if (broken.length) {
  console.error(broken.join('\n'));
  process.exitCode = 1;
} else console.log(`Local documentation links pass (${files.length} Markdown files).`);
