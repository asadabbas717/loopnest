import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const artifact = JSON.parse(
  await readFile(new URL('../eas-preview-artifact.json', import.meta.url), 'utf8'),
);
const url = new URL(artifact.url);
if (
  url.origin !== 'https://expo.dev' ||
  !/^\/artifacts\/eas\/[A-Za-z0-9_-]+\.apk$/.test(url.pathname) ||
  url.search ||
  url.hash ||
  !/^[a-f0-9]{64}$/.test(artifact.sha256)
)
  throw new Error('Expected a pinned Expo APK URL and SHA-256.');
const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
if (!response.ok || !response.body) throw new Error('Expo artifact download failed.');
const chunks = [];
let size = 0;
for await (const chunk of response.body) {
  size += chunk.length;
  if (size > 200 * 1024 * 1024) throw new Error('Preview artifact exceeds the download bound.');
  chunks.push(chunk);
}
const apk = Buffer.concat(chunks);
if (createHash('sha256').update(apk).digest('hex') !== artifact.sha256)
  throw new Error('Expo artifact checksum mismatch.');
const folder = new URL('../android/app/build/outputs/apk/release/', import.meta.url);
await mkdir(folder, { recursive: true });
await writeFile(new URL('app-release.apk', folder), apk);
console.log(`Verified Expo APK: ${size} bytes; source ${artifact.source}.`);
