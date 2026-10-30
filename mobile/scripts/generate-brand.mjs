// Original Loopnest vector geometry. Node-only, deterministic supersampled PNGs;
// no image service, downloaded artwork, platform drawing API or new dependency.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
const out = new URL('../assets/brand/', import.meta.url);
mkdirSync(out, { recursive: true });
const colors = { dark: [8, 12, 17], lime: [195, 247, 115], cyan: [114, 215, 215] };
const rings = [
  { x: 420, y: 512, angle: -35, color: colors.lime },
  { x: 604, y: 512, angle: 35, color: colors.cyan },
];
const shapes = rings.map(({ x, y, angle, color }) => {
  const theta = (angle * Math.PI) / 180;
  return { x, y, c: Math.cos(theta), s: Math.sin(theta), color };
});
function stroke(x, y, ring) {
  const dx = x - ring.x,
    dy = y - ring.y;
  const px = dx * ring.c + dy * ring.s,
    py = -dx * ring.s + dy * ring.c;
  const qx = Math.abs(px) - 60,
    qy = Math.abs(py) - 120;
  const distance =
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - 105;
  return Math.abs(distance) <= 28;
}
function pixel(x, y, background, monochrome) {
  let result = background ? [...colors.dark, 255] : [0, 0, 0, 0];
  for (const ring of shapes)
    if (stroke(x, y, ring)) result = [...(monochrome ? [255, 255, 255] : ring.color), 255];
  return result;
}
function crc32(data) {
  let crc = -1;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ -1) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type),
    size = Buffer.alloc(4),
    crc = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([size, name, data, crc]);
}
function png(name, size, background = false, monochrome = false, scale = 1) {
  const data = Buffer.alloc((size * 4 + 1) * size),
    samples = 4;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const sum = [0, 0, 0, 0];
      for (let j = 0; j < samples; j++)
        for (let i = 0; i < samples; i++) {
          const px = (((x + (i + 0.5) / samples) / size) * 1024 - 512) / scale + 512;
          const py = (((y + (j + 0.5) / samples) / size) * 1024 - 512) / scale + 512;
          const rgba = pixel(px, py, background, monochrome);
          for (let c = 0; c < 3; c++) sum[c] += (rgba[c] * rgba[3]) / 255;
          sum[3] += rgba[3];
        }
      const at = y * (size * 4 + 1) + 1 + x * 4,
        alpha = sum[3] / 16;
      for (let c = 0; c < 3; c++)
        data[at + c] = alpha ? Math.round(((sum[c] / 16) * 255) / alpha) : 0;
      data[at + 3] = Math.round(alpha);
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  writeFileSync(
    new URL(name, out),
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(data, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}
const geometry = rings
  .map(
    (r) =>
      `<rect x="${r.x - 165}" y="${r.y - 225}" width="330" height="450" rx="105" fill="none" stroke="rgb(${r.color})" stroke-width="56" transform="rotate(${r.angle} ${r.x} ${r.y})"/>`,
  )
  .join('');
writeFileSync(
  new URL('mark.svg', out),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><title>Loopnest linked loops</title>${geometry}</svg>\n`,
);
png('icon.png', 1024, true);
png('adaptive-foreground.png', 1024, false, false, 0.8);
png('adaptive-monochrome.png', 1024, false, true, 0.8);
png('mark.png', 512);
console.log('Generated original Loopnest SVG and four PNG assets.');
