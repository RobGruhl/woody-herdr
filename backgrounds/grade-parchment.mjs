// Grades an image-generated paper texture onto Herdr's paper colour, so its
// colour is the theme's and only its fibre and mottling come from the picture.
//
// 1. Flatten: divide each channel by a wide blur of itself, which removes the
//    picture's own lighting, tint and any baked-in vignette.
// 2. Scale the texture that is left so its luma spread is --texture levels
//    (8-bit), softly clip spots past 3 sd, and lay it on --bg.
//    --chroma scales the texture's colour variation (0 = tone only, 1 = as drawn).
// 3. Apply render-paper.mjs's vignette, inner shadow and page-curl crest
//    (--vignette 0 leaves them off), so it sits in the same family as the
//    procedural papers.
//
// Needs ffmpeg (brew) to decode and encode.
//
//   node grade-parchment.mjs --in generated/parchment_v1.png --out paper-light-gen-v1.png --texture 5
//   node grade-parchment.mjs --in generated/parchment_v1.png --out x.png --texture 5 --chroma 0.5 --vignette 0
//
// New output name each time: Herdr caches images by path.
//
// How the paper-grain textures were made (2026-11-02):
//   generated/parchment_v{1,2,3}.png: gpt-image-2 via ~/Toolbelt gpt-image,
//     generate -q high -s 2560x1440 -n 3, with the prompt below.
//   paper-light-gen-vN.png: --texture 5 (default --bg '#f4e8d8')
//   paper-dark-gen-vN.png:  --bg '#17191d' --texture 1.7
//
//   Intended use: a full-pane background texture behind a terminal in a desktop
//   app. Small dark monospace text sits on top of it, so it must be calm, even
//   and low in contrast.
//   Subject: a photorealistic top-down flatbed scan of one continuous flat sheet
//   of real parchment paper. Its colour is a warm off-white, like antique white
//   or linen: warm and slightly rosy-tan, never yellow, never green.
//   Details: fine natural fibre texture and soft, faint cloudy mottling visible
//   up close, a gentle hand-made paper tooth, very subtle darker flecks of fibre.
//   No stains, no foxing spots, no burns, no torn or deckled edges, no folds, no
//   creases, no writing, no ink.
//   Lighting and framing: perfectly even diffuse scanner lighting, no vignette,
//   no shadows, no glare, no page curl. The paper fills the image edge to edge.
//   Constraints: no objects, no text, no logos, no watermark, no border or frame.

import { execFileSync } from "node:child_process";
import { writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
if (!args.in || !args.out) throw new Error("need --in and --out");
const BG = args.bg ?? "#f4e8d8";
const TEXTURE = Number(args.texture ?? 3.5);
const CHROMA = Number(args.chroma ?? 1);
const FLATTEN = Number(args.flatten ?? 240);
const VIGNETTE = Number(args.vignette ?? 1);

// The shader's knobs, as in render-paper.mjs.
const VIGNETTE_STRENGTH = 0.20;
const VIGNETTE_SOFTNESS = 0.90;
const INNER_SHADOW = 0.02;
const CURL_AMOUNT = 0.004;

const smoothstep = (e0, e1, x) => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;

const [W, H] = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", args.in])
  .toString().trim().split(",").map(Number);
const raw = execFileSync("ffmpeg", ["-v", "error", "-i", args.in, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 30 });
const N = W * H;
const chan = [0, 1, 2].map((k) => { const a = new Float32Array(N); for (let i = 0; i < N; i++) a[i] = raw[i * 3 + k] / 255; return a; });

// Box blur along rows then columns, edges clamped; three passes approximate a Gaussian.
function boxPass(src, dst, r, len, count, stride, step) {
  for (let line = 0; line < count; line++) {
    const o = line * stride;
    let s = 0;
    for (let j = -r; j <= r; j++) s += src[o + Math.min(Math.max(j, 0), len - 1) * step];
    for (let j = 0; j < len; j++) {
      dst[o + j * step] = s / (2 * r + 1);
      s += src[o + Math.min(j + r + 1, len - 1) * step] - src[o + Math.max(j - r, 0) * step];
    }
  }
}
function blur(a, r) {
  let x = Float32Array.from(a), t = new Float32Array(N);
  for (let p = 0; p < 3; p++) {
    boxPass(x, t, r, W, H, W, 1);
    boxPass(t, x, r, H, W, 1, W);
  }
  return x;
}

const r = Math.max(1, Math.round(FLATTEN / 3));
const ratio = chan.map((c) => { const m = blur(c, r); const out = new Float32Array(N); for (let i = 0; i < N; i++) out[i] = c[i] / Math.max(m[i], 1e-4) - 1; return out; });
const lumaDev = new Float32Array(N);
for (let i = 0; i < N; i++) lumaDev[i] = 0.2126 * ratio[0][i] + 0.7152 * ratio[1][i] + 0.0722 * ratio[2][i];
let sd = 0;
for (let i = 0; i < N; i++) sd += lumaDev[i] ** 2;
sd = Math.sqrt(sd / N);

const base = [1, 3, 5].map((i) => parseInt(BG.slice(i, i + 2), 16) / 255);
const baseLuma = base[0] * 0.2126 + base[1] * 0.7152 + base[2] * 0.0722;
const gain = TEXTURE / 255 / (sd * baseLuma);
const clip = 3 * sd; // soft limit for spots and flecks, in ratio units
const soft = (v) => clip * Math.tanh(v / clip);

const out = Buffer.alloc(N * 3);
for (let row = 0; row < H; row++) {
  for (let x = 0; x < W; x++) {
    const i = row * W + x;
    const ux = (x + 0.5) / W, uy = (H - row - 0.5) / H; // origin bottom-left, as in the shader
    let mul = 1, add = 0;
    if (VIGNETTE) {
      const dist = Math.hypot((ux - 0.5) * (W / H), uy - 0.5);
      const vig = 1 - smoothstep(0.35, 0.35 + VIGNETTE_SOFTNESS, dist + VIGNETTE_SOFTNESS - 0.35);
      const band = smoothstep(0.45, 0.62, dist) * (1 - smoothstep(0.62, 0.78, dist));
      mul = mix(1 - VIGNETTE_STRENGTH, 1, vig) * (1 - INNER_SHADOW * band);
      const curl = smoothstep(0.75, 1, Math.sin((ux + uy) * 1.4) * 0.5 + 0.5);
      add = CURL_AMOUNT * curl * smoothstep(0.30, 0.85, baseLuma * mul);
    }
    const l = lumaDev[i], ls = soft(l);
    for (let k = 0; k < 3; k++) {
      const dev = ls + CHROMA * (soft(ratio[k][i]) - soft(l));
      const v = base[k] * (1 + gain * dev) * mul + add;
      out[i * 3 + k] = Math.round(Math.min(Math.max(v, 0), 1) * 255);
    }
  }
}

// ffmpeg reads a piped raw frame in 64 KB packets, so hand it a file.
const dir = mkdtempSync(join(tmpdir(), "grade-parchment-"));
writeFileSync(join(dir, "frame.rgb"), out);
execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H}`, "-i", join(dir, "frame.rgb"), "-frames:v", "1", "-pix_fmt", "rgb24", args.out]);
rmSync(dir, { recursive: true });
console.log(`${args.out}: ${W}x${H} on ${BG}, texture ${TEXTURE} levels (drawn sd ${(sd * baseLuma * 255).toFixed(2)}), chroma ${CHROMA}, flatten ${FLATTEN}px, vignette ${VIGNETTE ? "on" : "off"}`);
