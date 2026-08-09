/**
 * Generates the app icons. No image libraries: a few hundred lines of maths
 * and Node's own zlib are enough for a flat vector-ish mark.
 *
 *   node tools/make-icons.mjs
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');

const BG = [10, 12, 16, 255];
const AMBER = [255, 176, 46, 255];
const STEEL = [110, 126, 148, 255];

/* ------------------------------------------------------------------ shapes */

const dist2seg = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

/** Rounded bar of half-width r from a to b, rotated about (cx, cy) by deg. */
function bar(ax, ay, bx, by, r, deg = 0, cx = 0.5, cy = 0.5) {
  const a = (deg * Math.PI) / 180;
  const rot = (x, y) => [
    cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a),
    cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a),
  ];
  const [x1, y1] = rot(ax, ay);
  const [x2, y2] = rot(bx, by);
  return (px, py) => dist2seg(px, py, x1, y1, x2, y2) - r;
}

/** Signed distance to a rounded square centred on (0.5, 0.5). */
function roundedSquare(inset, radius) {
  const half = 0.5 - inset - radius;
  return (px, py) => {
    const qx = Math.abs(px - 0.5) - half;
    const qy = Math.abs(py - 0.5) - half;
    return (
      Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius
    );
  };
}

/* The mark: two wheels seen from above, toed in, over a horizontal axle. */
function markLayers(padded) {
  const s = padded ? 0.82 : 1; // the maskable icon shrinks into the safe zone
  const m = (v) => 0.5 + (v - 0.5) * s;
  return [
    { sdf: bar(m(0.5), m(0.2), m(0.5), m(0.8), 0.012 * s), color: STEEL },
    { sdf: bar(m(0.29), m(0.26), m(0.29), m(0.74), 0.062 * s, 7, 0.5, 0.5), color: AMBER },
    { sdf: bar(m(0.71), m(0.26), m(0.71), m(0.74), 0.062 * s, -7, 0.5, 0.5), color: AMBER },
    { sdf: bar(m(0.16), m(0.5), m(0.84), m(0.5), 0.011 * s), color: STEEL },
  ];
}

/* -------------------------------------------------------------- rasteriser */

function draw(size, { maskable = false } = {}) {
  const px = new Uint8Array(size * size * 4);
  const layers = markLayers(maskable);
  const plate = maskable ? null : roundedSquare(0.055, 0.16);
  const SS = 3;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let acc = [0, 0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size;
          const v = (y + (sy + 0.5) / SS) / size;
          let c = [0, 0, 0, 0];
          if (maskable || plate(u, v) <= 0) c = BG;
          for (const layer of layers) if (layer.sdf(u, v) <= 0) c = layer.color;
          acc = [acc[0] + c[0], acc[1] + c[1], acc[2] + c[2], acc[3] + c[3]];
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      px[i] = acc[0] / n;
      px[i + 1] = acc[1] / n;
      px[i + 2] = acc[2] / n;
      px[i + 3] = acc[3] / n;
    }
  }
  return px;
}

/* ------------------------------------------------------------ png encoding */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour + alpha
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    Buffer.from(pixels.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* --------------------------------------------------------------------- go */

mkdirSync(OUT, { recursive: true });
const targets = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['apple-touch-icon.png', 180, {}],
  ['icon-maskable-512.png', 512, { maskable: true }],
];
for (const [name, size, opts] of targets) {
  writeFileSync(join(OUT, name), png(size, draw(size, opts)));
  console.log(`wrote icons/${name} (${size}x${size})`);
}
