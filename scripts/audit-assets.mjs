import sharp from 'sharp';
import { promises as fs } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '../public/assets');
const SPEC = join(__dirname, '../../Art/01 - Art Assets Specification.md');

const expectedSizes = new Map([
  ['ui/btn_play.png', [32, 32]],
  ['ui/btn_pause.png', [32, 32]],
  ['ui/btn_fast.png', [32, 32]],
  ['ui/ui_morale_1.png', [60, 16]],
  ['ui/ui_morale_5.png', [60, 16]],
  ['icons/map_icon_player.png', [16, 16]],
  ['icons/map_icon_event.png', [16, 16]],
  ['characters/scholar_yildiz_idle.png', [128, 48]],
  ['characters/scholar_ossavi_idle.png', [128, 48]],
  ['characters/scholar_meridian_idle.png', [128, 48]],
  ['characters/scholar_vasara_idle.png', [128, 48]],
  ['characters/scholar_harlow_idle.png', [128, 48]],
  ['characters/scholar_yildiz_walk.png', [128, 48]],
  ['characters/scholar_yildiz_sit.png', [64, 48]],
  ['characters/scholar_yildiz_react.png', [64, 48]],
  ['props/prop_lantern_on.png', [16, 24]],
  ['props/tile_flagstone.png', [16, 16]],
  ['props/tile_grass.png', [16, 16]],
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

const specText = await fs.readFile(SPEC, 'utf8');
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

const actualNames = new Set(await collectPngNames(OUT));
const missing = [...new Set(expectedNames)].filter((name) => !actualNames.has(name));
if (missing.length > 0) {
  throw new Error(`Missing concrete spec PNGs: ${missing.join(', ')}`);
}

console.log('Asset audit passed.');
