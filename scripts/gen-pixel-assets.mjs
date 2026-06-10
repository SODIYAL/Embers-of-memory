// Pixel-asset generator — produces every processed/procedural pixel asset
// from sources in art-src/ (plus the named character sheets, which ship
// untouched). Deterministic and idempotent: running it twice yields
// byte-identical output. No AI generation — pure image processing.
//
// Usage:  node scripts/gen-pixel-assets.mjs
// Needs:  npm install (sharp)
//
// Outputs (all into public/assets/):
//   backgrounds/bg_campus_sky.png   640×360 procedural mountain sky (day)
//   backgrounds/bg_title_px.png     640×360 dusk vista with campus silhouette
//   ambient/cloud_px_a.png, cloud_px_b.png   drifting cloud sprites
//   characters/scholar_generic_{a,b,c}_idle.png   hue-remapped from yildiz
//   characters/student_idle.png, student_walk.png hue-remapped from yildiz
//   portraits/*.png      40×40 quantized from 80×80 sources
//   icons/*.png          ÷2 quantized (topic/format/patron 32×32, archetype 24×24)
//   workstations/*.png   downscaled to half display size (drawn at 2× in-scene)

import sharp from 'sharp';
import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'art-src';
const OUT = 'public/assets';

// ── Tiny helpers ───────────────────────────────────────────────────

// Deterministic PRNG — fixed seeds keep every run byte-identical.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
const bayer = (x, y) => (BAYER4[y & 3][x & 3] + 0.5) / 16;

function hex(c) {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}

function canvas(w, h) {
  const data = new Uint8Array(w * h * 4);
  const set = (x, y, [r, g, b], a = 255) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
  };
  return { w, h, data, set };
}

async function save(c, file, { colors = 48 } = {}) {
  const path = join(OUT, file);
  await sharp(Buffer.from(c.data), { raw: { width: c.w, height: c.h, channels: 4 } })
    .png({ palette: true, colors, effort: 10, dither: 0 })
    .toFile(path);
  console.log('wrote', path, `${c.w}x${c.h}`);
}

// rgb<->hsl for the character hue remap
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}
function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map(v => Math.round(v * 255));
}

// ── Sky builder ────────────────────────────────────────────────────
// Shared by the campus backdrop (day) and the title vista (dusk). 640×360,
// horizon at y=205: in-scene this is drawn at 2× so the horizon lands at
// screen y≈410, just above the tiled campus plateau.

const W = 640, H = 360, HORIZON = 205;

function ridgeLine(rand, baseY, amplitude, roughness, w = W) {
  // Midpoint-displacement ridge: returns y per x column.
  const pts = new Float32Array(w);
  const seg = 80;
  const anchors = [];
  for (let x = 0; x <= w; x += seg) anchors.push(baseY + (rand() - 0.5) * 2 * amplitude);
  for (let x = 0; x < w; x++) {
    const i = Math.floor(x / seg);
    const t = (x % seg) / seg;
    const smooth = t * t * (3 - 2 * t);
    let y = anchors[i] * (1 - smooth) + anchors[Math.min(i + 1, anchors.length - 1)] * smooth;
    y += (rand() - 0.5) * roughness; // per-column jitter for a rocky crest
    pts[x] = y;
  }
  return pts;
}

function paintSky(c, palette, rand) {
  // Vertical banded gradient with ordered dithering between bands.
  const bands = palette.skyBands; // [{to, color}], to = last y of band
  for (let y = 0; y < HORIZON; y++) {
    let idx = bands.findIndex(b => y <= b.to);
    if (idx < 0) idx = bands.length - 1;
    const band = bands[idx];
    const next = bands[Math.min(idx + 1, bands.length - 1)];
    const from = idx === 0 ? 0 : bands[idx - 1].to + 1;
    const t = band.to === from ? 0 : (y - from) / (band.to - from);
    for (let x = 0; x < W; x++) {
      const useNext = t > 0.55 && bayer(x, y) < (t - 0.55) * 2.2;
      c.set(x, y, hex(useNext ? next.color : band.color));
    }
  }

  // Sun / moon glow — concentric dithered discs.
  const [sx, sy, sr] = palette.sun;
  for (let y = Math.max(0, sy - sr * 3); y < sy + sr * 3 && y < HORIZON; y++) {
    for (let x = sx - sr * 3; x < sx + sr * 3; x++) {
      const d = Math.hypot(x - sx, y - sy);
      if (d < sr) c.set(x, y, hex(palette.sunCore));
      else if (d < sr * 1.8 && bayer(x, y) < 1 - (d - sr) / (sr * 0.8)) c.set(x, y, hex(palette.sunGlow));
      else if (d < sr * 3 && bayer(x, y) < 0.25 * (1 - (d - sr * 1.8) / (sr * 1.2))) c.set(x, y, hex(palette.sunGlow));
    }
  }

  // Static cloud banks — flat blobs with stepped edges.
  for (const [cx, cy, cw, ch, color] of palette.clouds) {
    for (let y = cy - ch; y <= cy + ch; y++) {
      for (let x = cx - cw; x <= cx + cw; x++) {
        const nx = (x - cx) / cw, ny = (y - cy) / ch;
        const d = nx * nx + ny * ny * 2.4 + (rand() - 0.5) * 0.16;
        if (d < 1) c.set(x, y, hex(color));
      }
    }
  }

  // Mountain ridges, far to near, with snowcaps and dithered fog seams.
  for (const m of palette.ridges) {
    const ridge = ridgeLine(rand, m.baseY, m.amp, m.rough);
    for (let x = 0; x < W; x++) {
      const top = Math.round(ridge[x]);
      for (let y = Math.max(0, top); y <= HORIZON; y++) {
        // Snow: upper slopes of tall crests fade out by dithering.
        const fromCrest = y - top;
        if (m.snow && fromCrest < m.snow && bayer(x, y) < 1 - fromCrest / m.snow) {
          c.set(x, y, hex(m.snowColor));
        } else {
          c.set(x, y, hex(m.color));
        }
      }
    }
    // Fog band along the ridge base for depth separation.
    if (m.fog) {
      for (let y = HORIZON - m.fogH; y <= HORIZON; y++) {
        for (let x = 0; x < W; x++) {
          if (bayer(x, y) < 0.5 * (1 - (HORIZON - y) / m.fogH)) c.set(x, y, hex(m.fog));
        }
      }
    }
  }

  // Below the horizon: shadowed valley falling away beneath the plateau.
  const [vTop, vBottom] = palette.valley.map(hex);
  for (let y = HORIZON; y < H; y++) {
    const t = (y - HORIZON) / (H - HORIZON);
    for (let x = 0; x < W; x++) {
      const m = bayer(x, y) < t ? vBottom : vTop;
      c.set(x, y, m);
    }
  }

  // Stars (dusk/night palettes only).
  if (palette.stars) {
    for (let i = 0; i < palette.stars; i++) {
      const x = Math.floor(rand() * W), y = Math.floor(rand() * 70);
      c.set(x, y, hex('#f4ecd8'));
    }
  }
}

const DAY_PALETTE = {
  skyBands: [
    { to: 40,  color: '#46729e' },
    { to: 85,  color: '#5d88b2' },
    { to: 125, color: '#7ba3c6' },
    { to: 160, color: '#9cbed6' },
    { to: 185, color: '#c3d5dc' },
    { to: HORIZON, color: '#e0d8b8' },
  ],
  sun: [474, 52, 9],
  sunCore: '#fdf6dc',
  sunGlow: '#f4e6ac',
  clouds: [
    [120, 58, 56, 9, '#eef2f4'], [180, 66, 34, 6, '#dde6ea'],
    [430, 96, 44, 7, '#eef2f4'], [560, 44, 38, 6, '#e6edf0'],
    [300, 120, 30, 5, '#dde6ea'],
  ],
  ridges: [
    { baseY: 148, amp: 30, rough: 1.6, color: '#8da4ba', snow: 7, snowColor: '#eef4f8', fog: '#d4d6c4', fogH: 20 },
    { baseY: 178, amp: 18, rough: 1.3, color: '#5c7188', snow: 4, snowColor: '#cfdde6', fog: '#bfc2ae', fogH: 10 },
    { baseY: 198, amp: 11, rough: 1.0, color: '#39434b', snow: 0, snowColor: '#fff' },
  ],
  valley: ['#36443a', '#1e2820'],
};

const DUSK_PALETTE = {
  skyBands: [
    { to: 36,  color: '#241f3e' },
    { to: 76,  color: '#3a2c50' },
    { to: 112, color: '#5c3a5c' },
    { to: 146, color: '#8a4a58' },
    { to: 176, color: '#bc6a4e' },
    { to: HORIZON, color: '#e09a58' },
  ],
  sun: [218, 166, 12],
  sunCore: '#ffe9b0',
  sunGlow: '#f0b870',
  clouds: [
    [140, 60, 52, 8, '#4c3a58'], [210, 70, 30, 5, '#5c4460'],
    [470, 110, 46, 7, '#6e4458'], [560, 60, 34, 6, '#503c58'],
  ],
  ridges: [
    { baseY: 152, amp: 26, rough: 1.4, color: '#4e4260', snow: 14, snowColor: '#c8a8a0', fog: '#9c6650', fogH: 22 },
    { baseY: 178, amp: 18, rough: 1.2, color: '#3a3048', snow: 6, snowColor: '#a08488', fog: '#7c5448', fogH: 12 },
    { baseY: 198, amp: 12, rough: 1.0, color: '#28202e', snow: 0, snowColor: '#fff' },
  ],
  valley: ['#241e28', '#16121c'],
  stars: 60,
};

async function genBackdrops() {
  const day = canvas(W, H);
  paintSky(day, DAY_PALETTE, mulberry32(101));
  await save(day, 'backgrounds/bg_campus_sky.png', { colors: 64 });

  // Title vista: dusk sky, then the campus silhouetted on the near ridge.
  const dusk = canvas(W, H);
  paintSky(dusk, DUSK_PALETTE, mulberry32(202));
  const duskPng = await sharp(Buffer.from(dusk.data), { raw: { width: W, height: H, channels: 4 } })
    .png().toBuffer();

  const hall = await sharp('public/assets/buildings/building_founding_hall.png')
    .modulate({ brightness: 0.62, saturation: 0.62 }).png().toBuffer();
  const tower = await sharp('public/assets/buildings/building_founders_tower.png')
    .modulate({ brightness: 0.58, saturation: 0.6 }).png().toBuffer();
  const tree = await sharp('public/assets/props/prop_tree.png')
    .modulate({ brightness: 0.5, saturation: 0.55 }).png().toBuffer();

  // Buildings sit on the near ridge (crest ≈ y198) in the right third —
  // the title and tagline own the sky on the left/center.
  await sharp(duskPng)
    .composite([
      { input: hall,  left: 420, top: 112 },  // 128×96 → feet at y≈208
      { input: tower, left: 552, top: 116 },  // 72×96  → feet at y≈212
      { input: tree,  left: 388, top: 148 },  // 48×64  → feet at y≈212
    ])
    .png({ palette: true, colors: 64, effort: 10, dither: 0 })
    .toFile(join(OUT, 'backgrounds/bg_title_px.png'));
  console.log('wrote', join(OUT, 'backgrounds/bg_title_px.png'), `${W}x${H}`);
}

// ── Seamless grass tile ────────────────────────────────────────────
// The sliced tile_grass.png has a dark grid border baked in, which reads
// as repeating posts when tiled. Replace it with a borderless speckle tile.

async function genGrassTile() {
  const rand = mulberry32(77);
  const c = canvas(16, 16);
  const base = hex('#566a3c');
  const tones = ['#4a5c34', '#5e7242', '#647848', '#50643a'].map(hex);
  const sparks = ['#7c8e54', '#8a9460'].map(hex);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const r = rand();
    c.set(x, y, r < 0.55 ? base : tones[Math.floor(rand() * tones.length)]);
  }
  // A few grass-blade flecks.
  for (let i = 0; i < 7; i++) {
    const x = Math.floor(rand() * 16), y = Math.floor(rand() * 16);
    c.set(x, y, sparks[i % 2]);
  }
  await save(c, 'props/tile_grass.png', { colors: 8 });

  // Flagstone: the sliced tile is a lone paver with a transparent gutter,
  // which tiles as stones floating on grass. Draw a tight brick-coursed
  // stone tile instead (mortar lines wrap seamlessly).
  const frand = mulberry32(91);
  const f = canvas(16, 16);
  const stones = ['#a09478', '#948a70', '#8c8268', '#988c72'].map(hex);
  const mortar = hex('#6a6052');
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const row = Math.floor(y / 8);
    const shifted = (x + row * 8) % 16;            // brick offset per course
    const stoneId = Math.floor(shifted / 8) + row * 2;
    const onMortar = (y % 8 === 7) || (shifted % 8 === 7);
    if (onMortar) f.set(x, y, mortar);
    else {
      const tone = stones[(stoneId + (frand() < 0.12 ? 1 : 0)) % stones.length];
      f.set(x, y, frand() < 0.08 ? hex('#b0a488') : tone);
    }
  }
  await save(f, 'props/tile_flagstone.png', { colors: 8 });
}

// ── Drifting cloud sprites ─────────────────────────────────────────

async function genClouds() {
  const specs = [
    { file: 'ambient/cloud_px_a.png', w: 112, h: 26, seed: 31, lobes: 5 },
    { file: 'ambient/cloud_px_b.png', w: 72, h: 18, seed: 47, lobes: 3 },
  ];
  for (const s of specs) {
    const rand = mulberry32(s.seed);
    const c = canvas(s.w, s.h);
    const body = hex('#eef2f4'), under = hex('#cdd9de');
    for (let i = 0; i < s.lobes; i++) {
      const cx = Math.round(s.w * (0.18 + 0.64 * (i / (s.lobes - 1)))) + Math.round((rand() - 0.5) * 8);
      const cy = Math.round(s.h * 0.55 + (rand() - 0.5) * 4);
      const rw = s.w * (0.16 + rand() * 0.1), rh = s.h * (0.3 + rand() * 0.18);
      for (let y = 0; y < s.h; y++) {
        for (let x = 0; x < s.w; x++) {
          const nx = (x - cx) / rw, ny = (y - cy) / rh;
          if (nx * nx + ny * ny < 1) c.set(x, y, y > cy + rh * 0.4 ? under : body);
        }
      }
    }
    await save(c, s.file, { colors: 8 });
  }
}

// ── Generic scholars & students — hue-remap of the yildiz sheets ───
// Yildiz wears a brown robe (hue 15–45) with green trim (hue 70–170).
// Each variant re-aims both bands at new hues. Skin shares the brown hue
// band but sits at higher lightness, so the dark-pixel guard keeps faces
// intact; recolored hair is a feature (variants differ more).

const VARIANTS = [
  // robeHue: where browns go; trimHue: where the green trim goes.
  { out: 'scholar_generic_a_idle.png', src: 'scholar_yildiz_idle.png', robeHue: 358, trimHue: 40,  satMin: 0.30 }, // maroon + gold
  { out: 'scholar_generic_b_idle.png', src: 'scholar_yildiz_idle.png', robeHue: 215, trimHue: 200, satMin: 0.28 }, // slate blue
  { out: 'scholar_generic_c_idle.png', src: 'scholar_yildiz_idle.png', robeHue: 285, trimHue: 265, satMin: 0.24 }, // plum
  // Students: undyed habit — browns stay, trim goes ochre, a touch lighter.
  { out: 'student_idle.png', src: 'scholar_yildiz_idle.png', robeHue: 35, trimHue: 45, satMin: 0.18, lightMul: 1.1 },
  { out: 'student_walk.png', src: 'scholar_yildiz_walk.png', robeHue: 35, trimHue: 45, satMin: 0.18, lightMul: 1.1 },
];

async function genCharacters() {
  for (const v of VARIANTS) {
    const srcPath = join('public/assets/characters', v.src);
    const { data, info } = await sharp(srcPath).raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 16) continue;
      const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
      let target;
      if (s > 0.12 && h >= 10 && h <= 55 && l < 0.55) target = v.robeHue;       // robe/hair browns (skin is lighter)
      else if (s > 0.10 && h >= 70 && h <= 175)       target = v.trimHue;       // green trim
      if (target === undefined) continue;
      const [r, g, b] = hslToRgb(
        target,
        Math.min(1, Math.max(s, v.satMin)),
        Math.min(1, l * (v.lightMul ?? 1)),
      );
      data[i] = r; data[i + 1] = g; data[i + 2] = b;
    }
    await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
      .png({ palette: true, colors: 64, effort: 10, dither: 0 })
      .toFile(join(OUT, 'characters', v.out));
    console.log('wrote', join(OUT, 'characters', v.out), `${info.width}x${info.height}`);
  }
}

// ── Source-processed categories ────────────────────────────────────

async function halveQuantize(srcDir, outDir, { colors, kernel = 'lanczos3', skip } = {}) {
  mkdirSync(join(OUT, outDir), { recursive: true });
  const files = readdirSync(join(SRC, srcDir))
    .filter(f => f.endsWith('.png') && !(skip && skip.test(f)))
    .sort();
  for (const f of files) {
    const img = sharp(join(SRC, srcDir, f));
    const meta = await img.metadata();
    await img
      .resize(Math.round(meta.width / 2), Math.round(meta.height / 2), { kernel })
      .png({ palette: true, colors, effort: 10, dither: 0 })
      .toFile(join(OUT, outDir, f));
    console.log('wrote', join(OUT, outDir, f), `${Math.round(meta.width / 2)}x${Math.round(meta.height / 2)}`);
  }
}

async function genWorkstations() {
  mkdirSync(join(OUT, 'workstations'), { recursive: true });
  // Previously painted at setScale(0.36); the rebuilt scene draws at 2×, so
  // target = original × 0.36 ÷ 2 → on-screen size is preserved.
  for (const f of readdirSync(join(SRC, 'workstations')).filter(f => f.endsWith('.png')).sort()) {
    const img = sharp(join(SRC, 'workstations', f));
    const meta = await img.metadata();
    const w = Math.round(meta.width * 0.36 / 2);
    const h = Math.round(meta.height * 0.36 / 2);
    await img
      .resize(w, h, { kernel: 'lanczos3' })
      .png({ palette: true, colors: 32, effort: 10, dither: 0 })
      .toFile(join(OUT, 'workstations', f));
    console.log('wrote', join(OUT, 'workstations', f), `${w}x${h}`);
  }
}

// ── Main ───────────────────────────────────────────────────────────

mkdirSync(join(OUT, 'backgrounds'), { recursive: true });
mkdirSync(join(OUT, 'ambient'), { recursive: true });

await genBackdrops();
await genGrassTile();
await genClouds();
await genCharacters();
await halveQuantize('portraits', 'portraits', { colors: 32 });
// map_icon_* are unusable crops — redrawn from scratch by draw-pixel-ui.mjs.
await halveQuantize('icons', 'icons', { colors: 24, skip: /^map_icon_/ });
await genWorkstations();

console.log('done.');
