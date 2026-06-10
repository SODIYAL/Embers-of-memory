// Verifies every asset the game references actually exists on disk.
// Phaser scenes load via BootScene; the DOM overlay references portraits
// and trait chips by URL. Keep this list in sync with BootScene.ts and
// the src/ui CSS/markup.

import { access } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, '../public');

const imagePaths = [
  // Procedural backdrops + ambient (scripts/gen-pixel-assets.mjs)
  '/assets/backgrounds/bg_campus_sky.png',
  '/assets/backgrounds/bg_title_px.png',
  '/assets/ambient/cloud_px_a.png',
  '/assets/ambient/cloud_px_b.png',
  '/assets/ambient/ambient_birds_sheet.png',

  // UI chrome (scripts/draw-pixel-ui.mjs)
  '/assets/ui/ui_ember_mark.png',
  '/assets/ui/btn_primary.png',
  '/assets/ui/btn_primary_hover.png',
  '/assets/ui/btn_play.png',
  '/assets/ui/btn_play_active.png',
  '/assets/ui/btn_pause.png',
  '/assets/ui/btn_pause_active.png',
  '/assets/ui/btn_fast.png',
  '/assets/ui/btn_fast_active.png',
  ...['critical', 'strained', 'stable', 'prosperous'].map((s) => `/assets/ui/indicator_${s}.png`),
  ...['base', 'gold', 'muted'].map((s) => `/assets/ui/ui_trait_chip_${s}.png`),

  // DOM overlay portraits
  ...['harlow', 'meridian', 'ossavi', 'vasara', 'yildiz'].map((name) => `/assets/portraits/portrait_${name}.png`),

  // Characters
  ...['harlow', 'meridian', 'ossavi', 'vasara', 'yildiz'].flatMap((name) =>
    ['idle', 'walk', 'sit', 'react'].map((state) => `/assets/characters/scholar_${name}_${state}.png`)
  ),
  ...['a', 'b', 'c'].map((v) => `/assets/characters/scholar_generic_${v}_idle.png`),
  '/assets/characters/student_idle.png',
  '/assets/characters/student_walk.png',

  // Campus stage kit
  ...['founders_tower', 'founding_hall', 'library', 'observatory', 'scriptorium_wing']
    .map((name) => `/assets/buildings/building_${name}.png`),
  '/assets/buildings/prop_garden.png',
  '/assets/buildings/prop_teaching_courtyard.png',
  ...['bench', 'lantern_off', 'lantern_on', 'tree', 'well'].map((name) => `/assets/props/prop_${name}.png`),
  ...['flagstone', 'grass', 'wall'].map((name) => `/assets/props/tile_${name}.png`),
  ...['research', 'drafting', 'refinement'].map((stage) => `/assets/workstations/workstation_${stage}.png`),

  // FX strips
  '/assets/fx/fx_gold_sparkle.png',
  '/assets/fx/fx_ink_splatter.png',
];

const fontPaths = [
  '/fonts/alagard.ttf',
];

const audioPaths = [
  '/assets/audio/sfx/ui_click.wav',
  '/assets/audio/sfx/ui_hover.wav',
  '/assets/audio/sfx/ui_select.wav',
  '/assets/audio/sfx/ui_back.wav',
  '/assets/audio/sfx/modal_open.wav',
  '/assets/audio/sfx/modal_close.wav',
  '/assets/audio/sfx/project_start.wav',
  '/assets/audio/sfx/project_complete.wav',
  '/assets/audio/sfx/coin_gain.wav',
  '/assets/audio/sfx/page_turn.wav',
  '/assets/audio/sfx/quill_scratch.wav',
  '/assets/audio/sfx/error.wav',
];

const missing = [];
for (const path of [...imagePaths, ...fontPaths, ...audioPaths]) {
  try {
    await access(join(PUBLIC, path.replace(/^\//, '')));
  } catch {
    missing.push(path);
  }
}

if (missing.length > 0) {
  throw new Error(`Missing linked assets:\n${missing.join('\n')}`);
}

console.log(`Asset link verification passed for ${imagePaths.length} images, ${fontPaths.length} fonts, and ${audioPaths.length} audio files.`);
