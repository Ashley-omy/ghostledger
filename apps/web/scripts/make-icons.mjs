// Generates placeholder PNG app icons (a ghost on a dark background) with no dependencies.
// Replace public/icons/*.png with real artwork later. Usage: npm run icons -w @ghostledger/web
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [0x0f, 0x17, 0x2a];
const FG = [0xf8, 0xfa, 0xfc];

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Ghost in a 64×64 design space (same shape as favicon.svg), scaled by `inset` for maskable icons. */
function isGhost(x, y, inset) {
  const s = 64 / (1 - 2 * inset);
  const gx = x * s - inset * s;
  const gy = y * s - inset * s;
  const eye = (cx) => (gx - cx) ** 2 + (gy - 30) ** 2 < 3.2 ** 2;
  if (eye(26) || eye(38)) return false;
  if (gx < 16 || gx > 48) return false;
  if (gy < 30) return (gx - 32) ** 2 + (gy - 30) ** 2 <= 16 ** 2;
  // Wavy bottom: zig-zag between y=50 and y=54
  const phase = ((gx - 16) / 5.33) % 2;
  const bottom = 50 + 4 * (phase < 1 ? 1 - phase : phase - 1);
  return gy <= bottom;
}

function png(size, inset) {
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x++) {
      // 2×2 supersampling for smoother edges
      let hits = 0;
      for (const [dx, dy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
        if (isGhost((x + dx) / size, (y + dy) / size, inset)) hits++;
      }
      const a = hits / 4;
      for (let c = 0; c < 3; c++) row[1 + x * 3 + c] = Math.round(BG[c] * (1 - a) + FG[c] * a);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = new URL('../public/icons/', import.meta.url);
const icons = [
  ['icon-192.png', 192, 0.06],
  ['icon-512.png', 512, 0.06],
  ['icon-512-maskable.png', 512, 0.16], // keep the ghost inside the maskable safe zone
  ['apple-touch-icon.png', 180, 0.08],
];
for (const [name, size, inset] of icons) {
  writeFileSync(new URL(name, out), png(size, inset));
  console.log(`wrote public/icons/${name}`);
}
