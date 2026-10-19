import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const BRAND = [0x17, 0x8a, 0x5c, 0xff];
const WHITE = [0xff, 0xff, 0xff, 0xff];

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4);
  data.copy(out, 8);
  const crcBuf = Buffer.alloc(4 + data.length);
  crcBuf.write(type, 0);
  data.copy(crcBuf, 4);
  out.writeUInt32BE(crc32(crcBuf), 8 + data.length);
  return out;
}

function writePng(path, size, pixels) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    pixels.copy(raw, row + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return new Promise((resolve, reject) => {
    const stream = createWriteStream(path);
    stream.on('finish', resolve);
    stream.on('error', reject);
    stream.end(png);
  });
}

function setPixel(pixels, size, x, y, rgba) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const i = (y * size + x) * 4;
  pixels[i] = rgba[0];
  pixels[i + 1] = rgba[1];
  pixels[i + 2] = rgba[2];
  pixels[i + 3] = rgba[3];
}

function fillCircle(pixels, size, cx, cy, r, rgba) {
  const r2 = r * r;
  const x0 = Math.max(0, Math.floor(cx - r - 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1));
  const x1 = Math.min(size - 1, Math.ceil(cx + r + 1));
  const y1 = Math.min(size - 1, Math.ceil(cy + r + 1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r2) setPixel(pixels, size, x, y, rgba);
    }
  }
}

function strokeLine(pixels, size, x0, y0, x1, y1, width, rgba) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const steps = Math.ceil(len * 2);
  const r = width / 2;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    fillCircle(pixels, size, x0 + dx * t, y0 + dy * t, r, rgba);
  }
}

function paintIcon(size, insetRatio) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = BRAND[0];
    pixels[i + 1] = BRAND[1];
    pixels[i + 2] = BRAND[2];
    pixels[i + 3] = 255;
  }
  const inset = size * insetRatio;
  const scale = (size - inset * 2) / 48;
  const map = (n) => inset + n * scale;
  fillCircle(pixels, size, map(8.75), map(25.6), 1.9 * scale, [255, 255, 255, 154]);
  fillCircle(pixels, size, map(16.05), map(25.6), 2.8 * scale, [255, 255, 255, 217]);
  strokeLine(pixels, size, map(23.85), map(25.6), map(28.25), map(30), 4.8 * scale, WHITE);
  strokeLine(pixels, size, map(28.25), map(30), map(38.75), map(18), 4.8 * scale, WHITE);
  return pixels;
}

const files = [
  ['icons/icon-192.png', 192, 0],
  ['icons/icon-512.png', 512, 0],
  ['icons/maskable-512.png', 512, 0.12],
  ['apple-touch-icon.png', 180, 0],
];

await mkdir(join(root, 'icons'), { recursive: true });
for (const [rel, size, inset] of files) {
  const dest = join(root, rel);
  await writePng(dest, size, paintIcon(size, inset));
  console.log(dest);
}
