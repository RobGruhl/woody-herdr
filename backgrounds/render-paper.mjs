// Renders Herdr's background textures to still PNGs (Herdr takes background
// images but not shaders).
//
// --style paper (default): ~/.config/ghostty/shaders/subtle-paper-vignette.glsl.
// Kept: vignette, inner shadow, film grain, fiber emboss, page-curl crest,
// frozen at iTime = 0. Dropped: the glyph drop-shadow (needs the terminal's
// pixels) and focus framing (Herdr's pane focus border does that job). The
// image replaces the terminal's background (terminal_opacity 0), so render it
// on the theme's `background` color, and again after changing theme.
//
// --style steel: brushed steel for the window frame in light mode, rendered on
// the steel the theme's chrome would be (light chrome is see-through).
//
//   node render-paper.mjs --bg '#17191d' --out paper-dark.png
//   node render-paper.mjs --bg '#f4e8d8' --out paper-light-f4e8d8.png  (new name each time: Herdr caches images by path)
//   node render-paper.mjs --style steel --bg '#dce4ed' --width 2560 --height 1440 --out steel-light.png

import { writeFileSync } from "node:fs";
import { deflateSync, crc32 } from "node:zlib";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const STYLE = args.style ?? "paper";
const W = Number(args.width ?? 1920);
const H = Number(args.height ?? 1200);
const BG = args.bg ?? "#17191d";
const OUT = args.out ?? "paper-dark.png";

// Same knobs as the shader.
const VIGNETTE_STRENGTH = 0.20;
const VIGNETTE_SOFTNESS = 0.90;
const GRAIN_AMOUNT = 0.018;
const EMBOSS_AMOUNT = 0.014;
const INNER_SHADOW = 0.02;
const CURL_AMOUNT = 0.004;
const TIME = 0;

// Brushed steel: peak-to-peak brightness of each layer.
const HAIRLINES = 0.04;  // one row each, streaking ~250px along x
const BANDS = 0.025;     // broader rolling marks
const STEEL_GRAIN = 0.01;
const SHEEN = 0.04;      // light from the upper left

const fract = (x) => x - Math.floor(x);
const mix = (a, b, t) => a + (b - a) * t;
const smoothstep = (e0, e1, x) => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
};
const lumaOf = (c) => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;

function hash12(px, py) {
  let x = fract(px * 0.1031), y = fract(py * 0.1031), z = fract(px * 0.1031);
  const d = x * (y + 33.33) + y * (z + 33.33) + z * (x + 33.33);
  x += d; y += d; z += d;
  return fract((x + y) * z);
}

function valueNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const sx = smoothstep(0, 1, x - ix), sy = smoothstep(0, 1, y - iy);
  return mix(mix(hash12(ix, iy), hash12(ix + 1, iy), sx), mix(hash12(ix, iy + 1), hash12(ix + 1, iy + 1), sx), sy);
}

// fragCoord (pixel centers, origin bottom-left) and uv, as in the shader.
function paper(fx, fy, ux, uy, base) {
  let col = [...base];

  // 1. Vignette
  const cx = (ux - 0.5) * (W / H), cy = uy - 0.5;
  const dist = Math.hypot(cx, cy);
  const vig = 1 - smoothstep(0.35, 0.35 + VIGNETTE_SOFTNESS, dist + VIGNETTE_SOFTNESS - 0.35);
  const vigMul = mix(1 - VIGNETTE_STRENGTH, 1, vig);
  col = col.map((v) => v * vigMul);

  // 1b. Inner shadow
  const band = smoothstep(0.45, 0.62, dist) * (1 - smoothstep(0.62, 0.78, dist));
  col = col.map((v) => v * (1 - INNER_SHADOW * band));

  const luma = lumaOf(col);

  // 3. Grain: high-frequency hash plus smoothed mid-frequency fiber noise
  const hi = hash12(fx + Math.floor(TIME * 12), fy + Math.floor(TIME * 12)) - 0.5;
  const lx = fx * 0.07 + TIME * 0.12, ly = fy * 0.07 + TIME * 0.07;
  const lfx = Math.floor(lx), lfy = Math.floor(ly);
  const sx = smoothstep(0, 1, lx - lfx), sy = smoothstep(0, 1, ly - lfy);
  const a = hash12(lfx, lfy), b = hash12(lfx + 1, lfy);
  const c = hash12(lfx, lfy + 1), d = hash12(lfx + 1, lfy + 1);
  const lo = mix(mix(a, b, sx), mix(c, d, sx), sy) - 0.5;
  const n = hi * 0.85 + lo * 0.12;
  const breathe = 1 + 0.15 * Math.sin(TIME * 0.4);
  const grainMask = smoothstep(0.02, 0.08, luma) * (1 - smoothstep(0.92, 0.98, luma));
  col = col.map((v) => v + n * GRAIN_AMOUNT * grainMask * breathe);

  // 4. Fiber emboss, light from upper left
  const gx = mix(b - a, d - c, sy), gy = mix(c - a, d - b, sx);
  const emboss = gx * -0.707 + gy * -0.707;
  col = col.map((v) => v + emboss * EMBOSS_AMOUNT * grainMask);

  // 5. Page-curl crest, highlights only
  const curl = smoothstep(0.75, 1, Math.sin((ux + uy) * 1.4 - TIME * 0.25) * 0.5 + 0.5);
  return col.map((v) => v + CURL_AMOUNT * curl * smoothstep(0.30, 0.85, luma));
}

function steel(fx, fy, ux, uy, base) {
  const hair = valueNoise(fx * 0.004, fy) - 0.5;
  const band = valueNoise(fx * 0.0015, fy * 0.2 + 17) - 0.5;
  const grain = hash12(fx + 71, fy + 13) - 0.5;
  const sheen = (1 - ux) * 0.5 + uy * 0.5 - 0.5;
  const d = hair * HAIRLINES + band * BANDS + grain * STEEL_GRAIN + sheen * SHEEN;
  return base.map((v) => v + d);
}

const pixel = { paper, steel }[STYLE];
if (!pixel) throw new Error(`unknown --style ${STYLE} (paper or steel)`);
const base = [1, 3, 5].map((i) => parseInt(BG.slice(i, i + 2), 16) / 255);
const rows = Buffer.alloc((W * 3 + 1) * H);

for (let row = 0; row < H; row++) {
  rows[row * (W * 3 + 1)] = 0; // PNG filter: none
  for (let x = 0; x < W; x++) {
    const fx = x + 0.5, fy = H - row - 0.5;
    const col = pixel(fx, fy, fx / W, fy / H, base);
    const o = row * (W * 3 + 1) + 1 + x * 3;
    for (let k = 0; k < 3; k++) rows[o + k] = Math.round(Math.min(Math.max(col[k], 0), 1) * 255);
  }
}

const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
writeFileSync(OUT, Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
]));
console.log(`${OUT}: ${STYLE} ${W}x${H} on ${BG}`);
