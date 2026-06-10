// Asserts the pixel assets on disk match the sizes the engine assumes.
// Everything is 1×-resolution pixel art drawn at scale 2 in-engine; if a
// generator change breaks a frame grid or backdrop size, this catches it.

import sharp from 'sharp';
import { promises as fs } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '../public/assets');
const SPEC = join(__dirname, '../../Art/01 - Art Assets Specification.md');

const expectedSizes = new Map([
  // Procedural backdrops (gen-pixel-assets.mjs) — 640×360 drawn at 2×.
  ['backgrounds/bg_campus_sky.png', [640, 360]],
  ['backgrounds/bg_title_px.png', [640, 360]],

  // Drawn UI (draw-pixel-ui.mjs)
  ['ui/btn_primary.png', [80, 22]],
  ['ui/btn_play.png', [12, 12]],
  ['ui/btn_pause.png', [12, 12]],
  ['ui/btn_fast.png', [12, 12]],
  ['ui/ui_morale_1.png', [30, 8]],
  ['ui/ui_morale_5.png', [30, 8]],
  ['ui/indicator_prosperous.png', [14, 21]],
  ['ui/indicator_critical.png', [14, 21]],
  ['icons/map_icon_player.png', [8, 8]],
  ['icons/map_icon_event.png', [8, 8]],
  ['fx/fx_gold_sparkle.png', [64, 16]],   // 4 × 16×16 frames
  ['fx/fx_ink_splatter.png', [160, 32]],  // 5 × 32×32 frames

  // Character frame grids (32×48 per frame)
  ['characters/scholar_yildiz_idle.png', [128, 48]],
  ['characters/scholar_ossavi_idle.png', [128, 48]],
  ['characters/scholar_meridian_idle.png', [128, 48]],
  ['characters/scholar_vasara_idle.png', [128, 48]],
  ['characters/scholar_harlow_idle.png', [128, 48]],
  ['characters/scholar_yildiz_walk.png', [128, 48]],
  ['characters/scholar_yildiz_sit.png', [64, 48]],
  ['characters/scholar_yildiz_react.png', [64, 48]],
  ['characters/scholar_generic_a_idle.png', [128, 48]],
  ['characters/scholar_generic_b_idle.png', [128, 48]],
  ['characters/scholar_generic_c_idle.png', [128, 48]],
  ['characters/student_idle.png', [128, 48]],
  ['characters/student_walk.png', [128, 48]],

  // Stage kit
  ['props/prop_lantern_on.png', [16, 24]],
  ['props/tile_flagstone.png', [16, 16]],
  ['props/tile_grass.png', [16, 16]],
  ['portraits/portrait_yildiz.png', [40, 40]],
]);

async function assertSize(rel, expected) {
  const full = join(OUT, rel);
  const meta = await sharp(full).metadata();
  if (meta.width !== expected[0] || meta.height !== expected[1]) {
    throw new Error(`${rel} expected ${expected[0]}x${expected[1]}, got ${meta.width}x${meta.height}`);
  }
}

for (const [rel, size] of expectedSizes) {
  await assertSize(rel, size);
}

const rootEntries = await fs.readdir(OUT);
const strayPngs = rootEntries.filter((name) => name.endsWith('.png'));
if (strayPngs.length > 0) {
  throw new Error(`public/assets contains stray root PNGs: ${strayPngs.join(', ')}`);
}

// Optional spec cross-check — the spec doc lives in an external Art/
// directory that not every checkout has. Retired source art counts: it
// lives under art-src/ rather than public/assets/.
let specText;
try {
  specText = await fs.readFile(SPEC, 'utf8');
} catch {
  console.log('Asset audit passed (spec doc not present — size checks only).');
  process.exit(0);
}

const expectedNames = [...specText.matchAll(/`([^`]+\.png)`/g)]
  .map((match) => match[1].split(/[\\/]/).pop())
  .filter((name) => name !== 'icon_format_[name].png');

async function collectPngNames(dir) {
  const names = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) names.push(...await collectPngNames(full));
    else if (entry.name.endsWith('.png')) names.push(entry.name);
  }
  return names;
}

const actualNames = new Set([
  ...await collectPngNames(OUT),
  ...await collectPngNames(join(__dirname, '../art-src')),
]);
const missing = [...new Set(expectedNames)].filter((name) => !actualNames.has(name));
if (missing.length > 0) {
  throw new Error(`Missing concrete spec PNGs: ${missing.join(', ')}`);
}

console.log('Asset audit passed.');
