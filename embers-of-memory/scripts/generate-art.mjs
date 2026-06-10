#!/usr/bin/env node
/**
 * Art generation script for Embers of Memory
 * Uses Replicate (FLUX) to generate missing game assets.
 *
 * Usage:
 *   node scripts/generate-art.mjs          # generate Tier 1 only
 *   node scripts/generate-art.mjs 2        # generate Tier 2
 *   node scripts/generate-art.mjs 3        # generate Tier 3
 *   node scripts/generate-art.mjs all      # generate everything missing
 *
 * Requires: REPLICATE_API_TOKEN in environment
 *   set REPLICATE_API_TOKEN=r8_xxxx
 */

import Replicate from 'replicate';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ART_OUTPUT = path.resolve(__dirname, '../../../Art/Generated');

// --- Model ---
// flux-schnell: fast + cheap, great for iteration
// flux-1.1-pro: slower + higher quality, use for final assets
const MODEL = 'black-forest-labs/flux-schnell';

const replicate = new Replicate();

// --- Helpers ---

function out(...parts) {
  return path.join(ART_OUTPUT, ...parts);
}

function ensureDir(filepath) {
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
}

function exists(filepath) {
  return fs.existsSync(filepath);
}

function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (res) => {
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => {
      fs.unlink(filepath, () => {});
      reject(err);
    });
  });
}

async function generate({ file, prompt, width = 1024, height = 1024 }) {
  const filepath = out(file);

  if (exists(filepath)) {
    console.log(`  SKIP  ${file}`);
    return;
  }

  ensureDir(filepath);
  console.log(`  GEN   ${file}`);

  try {
    const output = await replicate.run(MODEL, {
      input: {
        prompt,
        width,
        height,
        num_outputs: 1,
        output_format: 'png',
        go_fast: true,
        num_inference_steps: 4,
      },
    });

    // Replicate returns FileOutput objects or URL strings
    const result = Array.isArray(output) ? output[0] : output;
    const url = typeof result === 'string' ? result : result.url?.() ?? String(result);

    await downloadFile(url, filepath);
    console.log(`  DONE  ${file}`);
  } catch (err) {
    console.error(`  FAIL  ${file}: ${err.message}`);
  }

  // Small delay to avoid rate-limiting
  await new Promise(r => setTimeout(r, 500));
}

async function runTier(label, assets) {
  console.log(`\n=== ${label} (${assets.length} assets) ===\n`);
  for (const asset of assets) {
    await generate(asset);
  }
}

// =============================================================================
// TIER 1 — Prototype Blockers
// =============================================================================

const TIER1 = [

  // --- Scholar Portraits (80×80 face art for scholar cards) ---

  {
    file: 'characters/portraits/portrait_yildiz.png',
    width: 512, height: 512,
    prompt: '80x80 pixel art portrait, female scholar, mid-30s, dark braided hair loosely swept back, warm brown skin, sharp curious eyes, slight smile, teal robe collar #4A7C59, small gold star earring, cozy management game portrait style, warm palette, dark ink outline #1A1009, parchment background #E8D5A3, illuminated manuscript aesthetic, high detail face, clean pixel art style',
  },
  {
    file: 'characters/portraits/portrait_ossavi.png',
    width: 512, height: 512,
    prompt: '80x80 pixel art portrait, male scholar archivist, early 50s, graying temples, round wire glasses in gold, medium brown skin, calm evaluating expression, navy robe collar #26619C with ink stain, slightly hunched posture implied, cozy management game portrait style, warm palette, dark ink outline, parchment background #E8D5A3, illuminated manuscript aesthetic',
  },
  {
    file: 'characters/portraits/portrait_meridian.png',
    width: 512, height: 512,
    prompt: '80x80 pixel art portrait, androgynous scholar philosopher, early 40s, short dark hair with silver threads at temples, warm olive skin, slightly furrowed questioning brow, sage green robe collar #7DA882, searching mid-thought expression, cozy management game portrait style, warm palette, dark ink outline, parchment background #E8D5A3, illuminated manuscript aesthetic',
  },
  {
    file: 'characters/portraits/portrait_vasara.png',
    width: 512, height: 512,
    prompt: '80x80 pixel art portrait, young female musician scholar, late 20s, long dark hair with small gold bells woven in, warm brown skin, bright warm eyes, joyful expression, saffron yellow robe collar #FFD66B with burgundy edge #8B2D42, cozy management game portrait style, warm palette, dark ink outline, parchment background #E8D5A3, illuminated manuscript aesthetic',
  },
  {
    file: 'characters/portraits/portrait_harlow.png',
    width: 512, height: 512,
    prompt: '80x80 pixel art portrait, male cartographer scholar, mid-40s, reddish-brown hair and short beard, warm brown skin, precise squinting eyes, slight ink smudge on cheek, cream shirt collar with dark brown vest, steady evaluating expression, cozy management game portrait style, warm palette, dark ink outline, parchment background #E8D5A3, illuminated manuscript aesthetic',
  },

  // --- Scholar Idle Sprite Sheets (128×48 — 4 frames of 32×48 each) ---

  {
    file: 'characters/sprites/scholar_yildiz_idle.png',
    width: 512, height: 192,
    prompt: '32x48 pixel art character sprite sheet, 4 frames horizontal idle animation, female scholar traveler, mid-30s, layered travel robes in teal and dusty brown, loose dark braid, brass astrolabe at belt, scroll tube on back, sharp curious eyes, cozy management game style, warm color palette, dark ink outline #1A1009, transparent background, subtle breathing animation, pixel art game sprite',
  },
  {
    file: 'characters/sprites/scholar_ossavi_idle.png',
    width: 512, height: 192,
    prompt: '32x48 pixel art character sprite sheet, 4 frames horizontal idle animation, male scholar archivist, early 50s, dark navy ink-stained robes, wire reading glasses, graying temples, large leather ledger under arm, slightly hunched, methodical and calm, cozy management game style, warm palette, dark ink outline, transparent background, pixel art game sprite',
  },
  {
    file: 'characters/sprites/scholar_meridian_idle.png',
    width: 512, height: 192,
    prompt: '32x48 pixel art character sprite sheet, 4 frames horizontal idle animation, androgynous philosopher scholar, early 40s, plain sage green robe, short dark hair with gray streaks, slightly furrowed brow, small wax tablet in hand, sandaled feet, restless intellectual energy, cozy management game style, warm palette, dark ink outline, transparent background, pixel art game sprite',
  },
  {
    file: 'characters/sprites/scholar_vasara_idle.png',
    width: 512, height: 192,
    prompt: '32x48 pixel art character sprite sheet, 4 frames horizontal idle animation, young female musician scholar, late 20s, bright saffron yellow robes with burgundy sash, long dark hair with small gold bells, small lute strapped to back, warm expressive face, joyful energy, cozy management game style, warm palette, dark ink outline, transparent background, slight sway animation, pixel art game sprite',
  },
  {
    file: 'characters/sprites/scholar_harlow_idle.png',
    width: 512, height: 192,
    prompt: '32x48 pixel art character sprite sheet, 4 frames horizontal idle animation, male cartographer scholar, mid-40s, cream linen shirt rolled sleeves, multi-pocket cartographer vest in deep brown, leather breeches, reddish-brown hair and short beard, ink-stained fingers, brass compass, rolled map, precise squinting expression, cozy management game style, warm palette, transparent background, pixel art game sprite',
  },

  // --- Format Icons (32×32 each) ---

  {
    file: 'icons/format/icon_format_illustrated_atlas.png',
    width: 512, height: 512,
    prompt: '32x32 pixel art icon, folded map with small drawn mountains visible, parchment tone #E8D5A3 with ink illustrations, dark ink outline #1A1009, cartographic aesthetic, warm color palette, simple bold readable design, square icon, transparent background',
  },
  {
    file: 'icons/format/icon_format_hymn.png',
    width: 512, height: 512,
    prompt: '32x32 pixel art icon, single musical note inside ornate gold circle, parchment background #E8D5A3, gold circle #D4AF37, sacred music aesthetic, dark ink outline #1A1009, simple bold design, square icon, transparent background',
  },
  {
    file: 'icons/format/icon_format_educational_handbook.png',
    width: 512, height: 512,
    prompt: '32x32 pixel art icon, thick closed book with ribbon bookmark, green cover #4A7C59, red ribbon #8B2D42, cream pages #F4ECD4, dark ink outline #1A1009, bold and readable, square icon, transparent background',
  },
  {
    file: 'icons/format/icon_format_philosophical_treatise.png',
    width: 512, height: 512,
    prompt: '32x32 pixel art icon, open horizontal scroll with dense lines of text marks, parchment tone #E8D5A3, dark ink text lines #3D2B1F, scholarly and dense, dark ink outline, square icon, transparent background',
  },
  {
    file: 'icons/format/icon_format_scientific_compendium.png',
    width: 512, height: 512,
    prompt: '32x32 pixel art icon, magnifying glass held over parchment document, gold frame #D4AF37, cream document #E8D5A3, dark ink outline #1A1009, scientific investigation aesthetic, simple bold design, square icon, transparent background',
  },
  {
    file: 'icons/format/icon_format_epic_poetry.png',
    width: 512, height: 512,
    prompt: '32x32 pixel art icon, rolled scroll with a feather quill resting against it, cream parchment #E8D5A3, white-gray feather, dark ink nib, dark ink outline #1A1009, literary aesthetic, simple bold design, square icon, transparent background',
  },

  // --- UI: Ornate Panel Border ---
  {
    file: 'ui/ui_border_ornate.png',
    width: 512, height: 768,
    prompt: 'Illuminated manuscript border frame, 400x600px proportions, ornate ink interlacing vine pattern along edges, corner illustrations of candle flame / feather quill / open book / compass rose, dark brown ink #3D2B1F with gold leaf accents #D4AF37, medieval scholarly aesthetic, hand-drawn feel, transparent background inside border area, for UI panel frame use',
  },

  // --- UI: Progress Bar ---
  {
    file: 'ui/ui_progress_bar_track.png',
    width: 960, height: 96,
    prompt: 'Horizontal progress bar UI element for medieval management game, parchment interior #E8D5A3, dark ink border #3D2B1F, small tick marks at quarter intervals, manuscript ruler aesthetic, 240x18px proportions, rounded end caps, warm color palette, transparent background',
  },
  {
    file: 'ui/ui_progress_bar_fill.png',
    width: 896, height: 64,
    prompt: 'Horizontal progress bar fill sprite, warm amber fill #C8872A with gold highlight edge #FFD66B, like ink or wax being poured into a channel, 230x10px proportions, medieval manuscript aesthetic, transparent background',
  },

  // --- UI: Scholar Card Background ---
  {
    file: 'ui/card_scholar.png',
    width: 512, height: 640,
    prompt: '200x260px scholar information card, illuminated manuscript aesthetic, parchment background #E8D5A3, ornate ink vine border around card edges, square portrait area at top 80x80px with decorated ink border, space below for text, space at bottom for trait tags, medieval scholarly aesthetic, warm palette, for scholar roster in management game',
  },
];

// =============================================================================
// TIER 2 — Visual Polish
// =============================================================================

const TIER2 = [

  // --- Campus Backgrounds ---
  {
    file: 'backgrounds/campus_founding_hall_night.png',
    width: 1280, height: 720,
    prompt: 'Cozy medieval monastery building at night, pixel art game background, 1280x720, glowing warm candlelit windows, deep blue-black sky with stars, crescent moon, building silhouette against night sky, cool blue tones #1C2B4A with warm interior glow #FFD66B, intimate and atmospheric, top-down slightly elevated perspective, no characters, indie game art style',
  },
  {
    file: 'backgrounds/campus_founding_hall_winter.png',
    width: 1280, height: 720,
    prompt: 'Cozy medieval monastery building in winter snowfall, pixel art game background, 1280x720, snow covering rooftop and courtyard, gnarled tree with snow on branches, warm glowing windows #FFD66B, snowflakes falling gently, cool blue-white exterior with warm amber interior light contrast, snow-capped mountains, intimate and peaceful, top-down slightly elevated perspective, no characters',
  },
  {
    file: 'backgrounds/interior_scriptorium.png',
    width: 1280, height: 720,
    prompt: 'Medieval scriptorium interior, pixel art game background, 1280x720, long wooden writing tables with candles, inkwells and quills, parchment rolls, high narrow windows with light shafts, manuscript shelves, low wooden beam ceiling, warm candlelight #FFD66B, dust motes, cozy and intimate, no characters, slightly elevated perspective, indie game background art',
  },
  {
    file: 'backgrounds/interior_library.png',
    width: 1280, height: 720,
    prompt: 'Cozy medieval library interior, pixel art game background, 1280x720, floor-to-ceiling manuscript shelves, illuminated manuscripts open on central table, oil lamp, window seat with cushions, rolling ladder, warm amber #C8872A and brown #6B4226 tones, rich and layered atmosphere, no characters, slightly elevated perspective, indie management game',
  },

  // --- Scholar Walk Animations ---
  {
    file: 'characters/sprites/scholar_yildiz_walk.png',
    width: 512, height: 192,
    prompt: '32x48 pixel art walk animation sprite sheet, 4 frames horizontal, female traveler scholar in teal robes, gentle walking motion with slight head bob, astrolabe swinging at belt, cozy game style, dark ink outline, transparent background, pixel art walking animation',
  },
  {
    file: 'characters/sprites/scholar_ossavi_walk.png',
    width: 512, height: 192,
    prompt: '32x48 pixel art walk animation sprite sheet, 4 frames horizontal, male archivist in navy robes, walking with ledger under arm, deliberate measured steps, head slightly forward, cozy game style, dark ink outline, transparent background, pixel art walking animation',
  },
  {
    file: 'characters/sprites/scholar_meridian_walk.png',
    width: 512, height: 192,
    prompt: '32x48 pixel art walk animation sprite sheet, 4 frames horizontal, androgynous philosopher in sage robes, energetic walk with slight arm gesture, thinking expression, sandals visible, cozy game style, dark ink outline, transparent background, pixel art walking animation',
  },
  {
    file: 'characters/sprites/scholar_vasara_walk.png',
    width: 512, height: 192,
    prompt: '32x48 pixel art walk animation sprite sheet, 4 frames horizontal, young female musician in saffron robes, light bouncy walk, lute on back, joyful expression, cozy game style, dark ink outline, transparent background, pixel art walking animation',
  },
  {
    file: 'characters/sprites/scholar_harlow_walk.png',
    width: 512, height: 192,
    prompt: '32x48 pixel art walk animation sprite sheet, 4 frames horizontal, male cartographer in vest and breeches, purposeful stride, compass visible at belt, rolled map tucked under arm, cozy game style, dark ink outline, transparent background, pixel art walking animation',
  },

  // --- Scholar Sit/Work Animations ---
  {
    file: 'characters/sprites/scholar_yildiz_sit.png',
    width: 256, height: 192,
    prompt: '32x48 pixel art sprite sheet, 2 frames, female traveler scholar seated at desk, leaning forward writing or reading, working pose, teal robes, cozy game style, dark ink outline, transparent background',
  },
  {
    file: 'characters/sprites/scholar_ossavi_sit.png',
    width: 256, height: 192,
    prompt: '32x48 pixel art sprite sheet, 2 frames, male archivist seated and writing in large ledger, concentrated expression, navy robes and reading glasses, cozy game style, dark ink outline, transparent background',
  },
  {
    file: 'characters/sprites/scholar_meridian_sit.png',
    width: 256, height: 192,
    prompt: '32x48 pixel art sprite sheet, 2 frames, androgynous philosopher seated, leaning forward intently writing on wax tablet, concentrated expression, sage green robes, cozy game style, dark ink outline, transparent background',
  },
  {
    file: 'characters/sprites/scholar_vasara_sit.png',
    width: 256, height: 192,
    prompt: '32x48 pixel art sprite sheet, 2 frames, young female musician seated playing her small lute, eyes closed in concentration, saffron robes, cozy game style, dark ink outline, transparent background',
  },
  {
    file: 'characters/sprites/scholar_harlow_sit.png',
    width: 256, height: 192,
    prompt: '32x48 pixel art sprite sheet, 2 frames, male cartographer leaning over spread map on table, measuring with compass, focused expression, vest and breeches, cozy game style, dark ink outline, transparent background',
  },

  // --- Scholar React Animations ---
  {
    file: 'characters/sprites/scholar_yildiz_react.png',
    width: 256, height: 192,
    prompt: '32x48 pixel art sprite sheet, 2 frames, female traveler scholar slight surprised or delighted expression, small gesture, teal robes, cozy game style, dark ink outline, transparent background, expressive reaction pose',
  },
  {
    file: 'characters/sprites/scholar_ossavi_react.png',
    width: 256, height: 192,
    prompt: '32x48 pixel art sprite sheet, 2 frames, male archivist reaction pose, adjusting glasses, nodding or raising an eyebrow, navy robes, cozy game style, dark ink outline, transparent background',
  },
  {
    file: 'characters/sprites/scholar_meridian_react.png',
    width: 256, height: 192,
    prompt: '32x48 pixel art sprite sheet, 2 frames, androgynous philosopher reaction pose, hand raised in argument or sudden insight, expressive gesture, sage robes, cozy game style, dark ink outline, transparent background',
  },
  {
    file: 'characters/sprites/scholar_vasara_react.png',
    width: 256, height: 192,
    prompt: '32x48 pixel art sprite sheet, 2 frames, young female musician delighted surprise or emotional response, hands slightly raised, saffron robes, cozy game style, dark ink outline, transparent background',
  },
  {
    file: 'characters/sprites/scholar_harlow_react.png',
    width: 256, height: 192,
    prompt: '32x48 pixel art sprite sheet, 2 frames, male cartographer looking up from work, slightly surprised expression, compass raised, vest and breeches, cozy game style, dark ink outline, transparent background',
  },

  // --- Quality Descriptor Badges ---
  {
    file: 'ui/badge_quality_6.png',
    width: 800, height: 240,
    prompt: '200x60px illustrated text badge, text "A Landmark Work", gold background #D4AF37, ornate illuminated manuscript border with vine details, large elegant serif letterforms, dark ink text #3D2B1F with slight emboss, prestigious and celebratory, medieval scholarly aesthetic',
  },
  {
    file: 'ui/badge_quality_5.png',
    width: 800, height: 240,
    prompt: '200x60px illustrated text badge, text "A Celebrated Achievement", deep amber background #C8872A, ornate border, elegant serif letterforms, dark ink text, prestigious medieval scholarly aesthetic',
  },
  {
    file: 'ui/badge_quality_4.png',
    width: 800, height: 240,
    prompt: '200x60px illustrated text badge, text "A Respected Contribution", warm brown background #6B4226, simple border, clean serif text, warm parchment tones, medieval scholarly aesthetic',
  },
  {
    file: 'ui/badge_quality_3.png',
    width: 800, height: 240,
    prompt: '200x60px illustrated text badge, text "A Competent Work", neutral parchment background #E8D5A3, minimal border, clean readable serif text, medieval scholarly aesthetic',
  },
  {
    file: 'ui/badge_quality_2.png',
    width: 800, height: 240,
    prompt: '200x60px illustrated text badge, text "A Modest Effort", slightly grayed parchment background, no decoration, plain serif text, understated medieval aesthetic',
  },
  {
    file: 'ui/badge_quality_1.png',
    width: 800, height: 240,
    prompt: '200x60px illustrated text badge, text "A Flawed but Earnest Attempt", slightly cool parchment background, simple text, humble and modest medieval aesthetic',
  },

  // --- Buildings ---
  {
    file: 'buildings/building_founding_hall.png',
    width: 512, height: 384,
    prompt: '128x96 pixel art building sprite, small stone monastery hall, curved arch doorway, two glowing amber windows, small bell tower, wooden overhanging roof with terracotta tiles #C8872A, warm stone color #7A6E5F, cozy and intimate, dark ink outline #1A1009, slightly elevated isometric view, transparent background',
  },
  {
    file: 'buildings/building_library.png',
    width: 512, height: 448,
    prompt: '128x112 pixel art building sprite, stone library building slightly taller, many narrow arched windows, carved stone entrance arch with small open-book motif above, climbing vines on one side, warm stone #7A6E5F, darker stone accents #4A4035, glowing amber window light, dark ink outline, slightly elevated isometric view, transparent background',
  },
  {
    file: 'buildings/building_observatory.png',
    width: 320, height: 512,
    prompt: '80x140 pixel art building sprite, tall round stone observatory tower, narrow slit windows, open top platform with small brass armillary sphere #D4AF37, stone texture #7A6E5F, few faint stars visible in sky above tower, purposeful aged appearance, dark ink outline, slightly elevated perspective, transparent background',
  },

  // --- Morale Indicators ---
  {
    file: 'ui/ui_morale_5.png',
    width: 480, height: 128,
    prompt: 'pixel art morale indicator, 60x16px proportions, 5 small candle flame icons in a row, all five flames lit in warm yellow #FFD66B, dark ink outline, cozy management game UI style, transparent background',
  },
  {
    file: 'ui/ui_morale_4.png',
    width: 480, height: 128,
    prompt: 'pixel art morale indicator, 60x16px proportions, 5 small candle flame icons in a row, four lit in warm yellow #FFD66B and one unlit in dark brown #6B4226, dark ink outline, cozy management game UI, transparent background',
  },
  {
    file: 'ui/ui_morale_3.png',
    width: 480, height: 128,
    prompt: 'pixel art morale indicator, 60x16px proportions, 5 small candle flame icons in a row, three lit in yellow #FFD66B and two unlit in dark brown #6B4226, dark ink outline, cozy management game UI, transparent background',
  },
  {
    file: 'ui/ui_morale_2.png',
    width: 480, height: 128,
    prompt: 'pixel art morale indicator, 60x16px proportions, 5 small candle flame icons, two lit in yellow #FFD66B and three unlit in dark brown #6B4226, dark ink outline, cozy management game UI, transparent background',
  },
  {
    file: 'ui/ui_morale_1.png',
    width: 480, height: 128,
    prompt: 'pixel art morale indicator, 60x16px proportions, 5 small candle flame icons, one small flickering flame in amber #C8872A and four unlit in dark brown #6B4226, dark ink outline, cozy management game UI, transparent background',
  },

  // --- Trait Chips ---
  {
    file: 'ui/ui_trait_chip_base.png',
    width: 512, height: 128,
    prompt: 'Small pill-shaped UI tag chip, 80x20px proportions, parchment background #E8D5A3, thin dark ink border #3D2B1F, slightly rounded ends, medieval manuscript label aesthetic, transparent background, 3 color variants side by side: standard parchment #E8D5A3, warm gold #D4AF37, muted tan #C4A87A',
  },

  // --- Tab Navigation ---
  {
    file: 'ui/ui_tab_active.png',
    width: 480, height: 144,
    prompt: 'UI tab element, 120x36px, medieval manuscript aesthetic, raised parchment effect #F4ECD4, ornate top and side border in dark ink, no bottom border, physically raised tab shape, cozy scholarly game style, transparent background',
  },
  {
    file: 'ui/ui_tab_inactive.png',
    width: 480, height: 144,
    prompt: 'UI tab element, 120x36px, medieval manuscript aesthetic, recessed parchment tone #C4A87A, simple border, slightly shadowed, behind active tab appearance, cozy scholarly game style, transparent background',
  },

  // --- Notification & Time Controls ---
  {
    file: 'ui/ui_notification.png',
    width: 640, height: 112,
    prompt: '320x56px notification bar UI, compact elegant design, warm amber tint #C8872A on parchment, thin gold border #D4AF37, 16px square icon area on left side, slightly darker bottom edge for depth, medieval manuscript aesthetic, cozy game UI',
  },
  {
    file: 'ui/btn_pause.png',
    width: 128, height: 128,
    prompt: '32x32px pixel art time control button, circular shape, parchment background #E8D5A3, dark ink border, two vertical bars for pause symbol in dark ink #3D2B1F, medieval management game style, transparent background',
  },
  {
    file: 'ui/btn_play.png',
    width: 128, height: 128,
    prompt: '32x32px pixel art time control button, circular shape, parchment background #E8D5A3, dark ink border, rightward pointing triangle in amber #C8872A for play symbol, medieval management game style, transparent background',
  },
  {
    file: 'ui/btn_fast.png',
    width: 128, height: 128,
    prompt: '32x32px pixel art time control button, circular shape, parchment background #E8D5A3, dark ink border, two rightward triangles in amber #C8872A for fast forward symbol, medieval management game style, transparent background',
  },
  {
    file: 'ui/btn_pause_active.png',
    width: 128, height: 128,
    prompt: '32x32px pixel art time control button active state, circular shape, amber glow background #C8872A, gold border #D4AF37, two vertical bars pause symbol brighter, pressed appearance, medieval management game style, transparent background',
  },
  {
    file: 'ui/btn_play_active.png',
    width: 128, height: 128,
    prompt: '32x32px pixel art time control button active state, circular shape, amber glow background #C8872A, gold border #D4AF37, play triangle brighter, pressed appearance, medieval management game style, transparent background',
  },
  {
    file: 'ui/btn_fast_active.png',
    width: 128, height: 128,
    prompt: '32x32px pixel art time control button active state, circular shape, amber glow background #C8872A, gold border #D4AF37, fast forward triangles brighter, pressed appearance, medieval management game style, transparent background',
  },

  // --- Generic Scholar Sprites ---
  {
    file: 'characters/sprites/scholar_generic_a_idle.png',
    width: 512, height: 192,
    prompt: '32x48 pixel art character sprite sheet, 4 frames idle animation, elderly male scholar, deep brown robes #3D2B1F, white-gray hair, carrying a closed book, slightly stooped, dignified expression, cozy management game style, warm palette, dark outline, transparent background',
  },
  {
    file: 'characters/sprites/scholar_generic_b_idle.png',
    width: 512, height: 192,
    prompt: '32x48 pixel art character sprite sheet, 4 frames idle animation, middle-aged female scholar, muted blue robes #26619C, dark hair with gray streaks pulled back, holding a scroll, upright and composed, cozy management game style, warm palette, dark outline, transparent background',
  },
  {
    file: 'characters/sprites/scholar_generic_c_idle.png',
    width: 512, height: 192,
    prompt: '32x48 pixel art character sprite sheet, 4 frames idle animation, young scholar in their early 20s, plain undyed linen robes #F4ECD4, carrying a small scroll, earnest slightly nervous expression, cozy management game style, warm palette, dark outline, transparent background',
  },

  // --- Student Sprites ---
  {
    file: 'characters/sprites/student_idle.png',
    width: 512, height: 192,
    prompt: '32x44 pixel art character sprite sheet, 4 frames idle animation, young student 16-22 years old, slightly oversized undyed linen student robes #F4ECD4, earnest slightly overwhelmed expression, carrying a stack of books, shorter than adult scholars, cozy management game style, warm palette, dark outline, transparent background',
  },
  {
    file: 'characters/sprites/student_walk.png',
    width: 512, height: 192,
    prompt: '32x44 pixel art walk animation sprite sheet, 4 frames, young student in linen robes, slightly awkward walk, books clutched to chest, earnest expression, cozy management game style, dark outline, transparent background',
  },

  // --- Candle FX ---
  {
    file: 'fx/fx_candle_flame.png',
    width: 384, height: 96,
    prompt: '48x12 pixel art sprite sheet, 6 frames horizontal, candle flame animation, base yellow #FFD66B, mid amber #C8872A, tip cream #F4ECD4, gentle flickering loop, 8x12 per frame, transparent background, tiny ambient candle effect',
  },
];

// =============================================================================
// TIER 3 — Full Game
// =============================================================================

const TIER3 = [

  // --- Remaining Topic Icons ---
  {
    file: 'icons/topic/icon_topic_astronomy.png',
    width: 512, height: 512,
    prompt: '32x32 pixel art icon, crescent moon with single star, blue moon #5B8FCC, yellow star #FFD66B, parchment background #E8D5A3, dark ink outline #1A1009, bold and readable, no anti-aliasing, square icon, transparent background',
  },
  {
    file: 'icons/topic/icon_topic_philosophy.png',
    width: 512, height: 512,
    prompt: '32x32 pixel art icon, small oil lamp with lit flame, amber lamp #C8872A, yellow flame #FFD66B, parchment background #E8D5A3, dark ink outline, simple bold design, square icon, transparent background',
  },
  {
    file: 'icons/topic/icon_topic_medicine.png',
    width: 512, height: 512,
    prompt: '32x32 pixel art icon, mortar and pestle with small herbs, stone mortar #7A6E5F, green herbs #4A7C59, parchment background #E8D5A3, dark ink outline, simple bold design, square icon, transparent background',
  },
  {
    file: 'icons/topic/icon_topic_theology.png',
    width: 512, height: 512,
    prompt: '32x32 pixel art icon, ornate chalice or sacred vessel, gold #D4AF37 with small ruby gem #8B2D42, parchment background #E8D5A3, dark ink outline, medieval sacred aesthetic, square icon, transparent background',
  },
  {
    file: 'icons/topic/icon_topic_music.png',
    width: 512, height: 512,
    prompt: '32x32 pixel art icon, small lute or stringed instrument, warm brown wood #6B4226, gold strings #FFD66B, parchment background #E8D5A3, dark ink outline, simple bold design, square icon, transparent background',
  },
  {
    file: 'icons/topic/icon_topic_cartography.png',
    width: 512, height: 512,
    prompt: '32x32 pixel art icon, unrolled map with compass rose, parchment map with inked lines, gold compass #D4AF37, dark ink outline #1A1009, cartographic aesthetic, square icon, transparent background',
  },
  {
    file: 'icons/topic/icon_topic_politics.png',
    width: 512, height: 512,
    prompt: '32x32 pixel art icon, rolled scroll with red wax seal and ribbon, parchment scroll #E8D5A3, deep red seal #8B2D42, dark ink outline, square icon, transparent background',
  },
  {
    file: 'icons/topic/icon_topic_literature.png',
    width: 512, height: 512,
    prompt: '32x32 pixel art icon, open book seen from front, blue cover #26619C, cream pages with line marks, dark ink outline, simple bold design, square icon, transparent background',
  },
  {
    file: 'icons/topic/icon_topic_architecture.png',
    width: 512, height: 512,
    prompt: '32x32 pixel art icon, small stone arch or single column, stone gray #7A6E5F with lighter highlight #AFA090, parchment background #E8D5A3, dark ink outline, simple bold design, square icon, transparent background',
  },
  {
    file: 'icons/topic/icon_topic_education.png',
    width: 512, height: 512,
    prompt: '32x32 pixel art icon, stack of 3 closed books, red #8B2D42, blue #26619C, and green #4A7C59 books, dark ink outlines, side view showing spines, square icon, transparent background',
  },
  {
    file: 'icons/topic/icon_topic_mathematics.png',
    width: 512, height: 512,
    prompt: '32x32 pixel art icon, small abacus with wooden frame and gold beads, wood #6B4226, gold beads #D4AF37, dark ink outline, simple bold design, square icon, transparent background',
  },
  {
    file: 'icons/topic/icon_topic_natural_history.png',
    width: 512, height: 512,
    prompt: '32x32 pixel art icon, pressed plant specimen on parchment, leaf or flower in green #4A7C59, parchment background #E8D5A3, botanical illustration style, dark ink outline, square icon, transparent background',
  },
  {
    file: 'icons/topic/icon_topic_engineering.png',
    width: 512, height: 512,
    prompt: '32x32 pixel art icon, two interlocking gears or a small pulley, stone gray #7A6E5F with gold accent #D4AF37, dark ink outline, simple bold design, square icon, transparent background',
  },
  {
    file: 'icons/topic/icon_topic_history.png',
    width: 512, height: 512,
    prompt: '32x32 pixel art icon, hourglass, wooden frame #6B4226, glass body with blue tint #5B8FCC, amber sand #C8872A, dark ink outline, simple bold design, square icon, transparent background',
  },
  {
    file: 'icons/topic/icon_topic_trade.png',
    width: 512, height: 512,
    prompt: '32x32 pixel art icon, merchant balance scales, gold pans #D4AF37, wooden arm #6B4226, dark ink outline, balanced and symmetrical, square icon, transparent background',
  },
  {
    file: 'icons/topic/icon_topic_mysticism.png',
    width: 512, height: 512,
    prompt: '32x32 pixel art icon, single eye inside a triangle, blue eye #26619C, dark amber triangle #8B5E00, parchment background #E8D5A3, mysterious but simple, dark ink outline, square icon, transparent background',
  },
  {
    file: 'icons/topic/icon_topic_law.png',
    width: 512, height: 512,
    prompt: '32x32 pixel art icon, tightly rolled scroll bound with cord and wax seal, parchment scroll #E8D5A3, red cord #8B2D42, gold seal #D4AF37, dark ink outline, square icon, transparent background',
  },

  // --- Remaining Format Icons ---
  {
    file: 'icons/format/icon_format_illuminated_manuscript.png',
    width: 512, height: 512,
    prompt: '32x32 pixel art icon, open illuminated manuscript book, one page has decorative floral illustration in gold #D4AF37 and ink, medieval manuscript aesthetic, dark ink outline #1A1009, square icon, transparent background',
  },
  {
    file: 'icons/format/icon_format_sacred_text.png',
    width: 512, height: 512,
    prompt: '32x32 pixel art icon, closed sacred book, dark burgundy cover #5C1F30, gold clasp #D4AF37 with small blue gem #26619C, solemn and precious, dark ink outline, square icon, transparent background',
  },
  {
    file: 'icons/format/icon_format_stage_performance.png',
    width: 512, height: 512,
    prompt: '32x32 pixel art icon, two theatrical masks side by side, one happy and one sad, gold comedy mask #FFD66B, blue tragedy mask #5B8FCC, dark ink outline, square icon, transparent background',
  },
  {
    file: 'icons/format/icon_format_chronicle.png',
    width: 512, height: 512,
    prompt: '32x32 pixel art icon, feather quill caught mid-stroke writing in open book, cream pages with ink lines appearing, writing in progress, dark ink outline #1A1009, square icon, transparent background',
  },
  {
    file: 'icons/format/icon_format_architectural_plans.png',
    width: 512, height: 512,
    prompt: '32x32 pixel art icon, rolled drafting paper with drawing compass resting against it, cream paper #F4ECD4, gold compass #D4AF37, ink blue construction lines visible #26619C, dark ink outline, square icon, transparent background',
  },
  {
    file: 'icons/format/icon_format_musical_composition.png',
    width: 512, height: 512,
    prompt: '32x32 pixel art icon, small sheet of music with staff lines and musical notes, cream paper #F4ECD4, dark ink lines and notes #1A1009, five-line staff visible, dark ink outline, square icon, transparent background',
  },
  {
    file: 'icons/format/icon_format_propaganda_pamphlet.png',
    width: 512, height: 512,
    prompt: '32x32 pixel art icon, small folded pamphlet, slightly worn at edges, parchment tone with thin red border #C43030, dark ink outline, square icon, transparent background',
  },
  {
    file: 'icons/format/icon_format_encyclopedia.png',
    width: 512, height: 512,
    prompt: '32x32 pixel art icon, three encyclopedia volumes standing upright, red #8B2D42, blue #26619C, and green #4A7C59 covers, spines with Roman numerals, dark ink outline, square icon, transparent background',
  },
  {
    file: 'icons/format/icon_format_commentary.png',
    width: 512, height: 512,
    prompt: '32x32 pixel art icon, manuscript page covered in margin annotations on both sides, cream center #E8D5A3, darker margins #C4A87A filled with tiny ink marks, scholarly and cluttered, dark ink outline, square icon, transparent background',
  },
  {
    file: 'icons/format/icon_format_correspondence.png',
    width: 512, height: 512,
    prompt: '32x32 pixel art icon, folded letter sealed with red wax, parchment letter #E8D5A3, deep red seal #8B2D42, dark ink outline, intimate private communication, square icon, transparent background',
  },
  {
    file: 'icons/format/icon_format_field_survey.png',
    width: 512, height: 512,
    prompt: '32x32 pixel art icon, rough hand-drawn terrain map with a red X marker, parchment background, ink terrain lines, red X #C43030, practical and utilitarian, dark ink outline, square icon, transparent background',
  },
  {
    file: 'icons/format/icon_format_public_lecture.png',
    width: 512, height: 512,
    prompt: '32x32 pixel art icon, simple wooden lectern or podium, warm brown wood #6B4226, angled reading surface, dark ink outline, simple bold design, square icon, transparent background',
  },

  // --- More Buildings ---
  {
    file: 'buildings/building_music_hall.png',
    width: 512, height: 352,
    prompt: '128x88 pixel art building sprite, wooden music hall with round open windows, small stage visible inside, lantern strings hung from eaves, warm wood tones #6B4226 and #3D2B1F, organic and welcoming character, warm interior glow, dark ink outline, slightly elevated perspective, transparent background',
  },
  {
    file: 'buildings/prop_garden.png',
    width: 384, height: 256,
    prompt: '96x64 pixel art garden scene sprite, small stone bench, flowering tree with pink-white blossoms, shallow round stone water basin, peaceful and inviting, green foliage #4A7C59, stone #7A6E5F, blossom pink, cozy management game style, dark ink outline, transparent background',
  },
  {
    file: 'buildings/building_scriptorium_wing.png',
    width: 512, height: 320,
    prompt: '128x80 pixel art building sprite, long low scriptorium workshop wing, row of 4-5 adjacent windows for maximum light, wooden beam construction, flat tiled roof with warm terracotta, external covered walkway along front, inhabited working atmosphere, warm stone and wood tones, amber window glow, dark ink outline, elevated perspective, transparent background',
  },
  {
    file: 'buildings/prop_teaching_courtyard.png',
    width: 640, height: 384,
    prompt: '160x96 pixel art outdoor courtyard scene sprite, central low stone lecture platform, stone benches in semicircle, large shade tree at side, flagstone ground, open and airy, stone gray #7A6E5F, foliage #4A7C59, dark ink outline, top-down elevated view, transparent background',
  },
  {
    file: 'buildings/building_archive_vault.png',
    width: 384, height: 352,
    prompt: '96x88 pixel art building sprite, squat solid stone archive vault, thick stone walls #4A4035 and #7A6E5F, small narrow windows placed high, heavy wooden door with iron fittings, no exterior decoration, functional and protective, darker and more imposing, dark ink outline, transparent background',
  },
  {
    file: 'buildings/building_guest_quarters.png',
    width: 512, height: 320,
    prompt: '128x80 pixel art building sprite, guest accommodation quarters, stone base with timber upper floor, multiple windows, small covered porch with hanging lanterns, climbing plants on one wall, warm and welcoming, stone #7A6E5F and timber #6B4226, amber window glow, dark ink outline, transparent background',
  },
  {
    file: 'buildings/building_public_hall.png',
    width: 576, height: 384,
    prompt: '144x96 pixel art building sprite, public assembly hall, wide facade with grand arched entrance and steps, large round window above arch, grander architecture, high vaulted interior glimpsed through open doors, stone construction #7A6E5F, warm interior amber glow, dark ink outline, slightly elevated perspective, transparent background',
  },
  {
    file: 'buildings/building_founders_tower.png',
    width: 288, height: 512,
    prompt: '72x128 pixel art building sprite, slender elegant founder tower, stone construction with slight age-implied lean, large windows at top floor, small stone balcony, ivy climbing around base, oldest building on campus, warm amber glow from top windows, more elegant than functional, stone #7A6E5F with ivy #2A4A38, dark ink outline, transparent background',
  },

  // --- Campus Props ---
  {
    file: 'props/prop_bench.png',
    width: 256, height: 128,
    prompt: '32x16 pixel art prop, simple wooden bench worn smooth, warm wood #6B4226, dark ink outline, transparent background',
  },
  {
    file: 'props/prop_inkquill.png',
    width: 128, height: 128,
    prompt: '16x16 pixel art desk prop, small ink pot with feather quill, dark ink pot #1A1009, white-gray quill #F4ECD4, dark ink outline, transparent background',
  },
  {
    file: 'props/prop_manuscripts.png',
    width: 128, height: 192,
    prompt: '16x24 pixel art prop, 4-5 stacked scrolls and books, mixed parchment and color spines, cozy warm palette, dark ink outline, transparent background',
  },
  {
    file: 'props/prop_lantern_on.png',
    width: 128, height: 192,
    prompt: '16x24 pixel art hanging lantern prop, lit with warm yellow glow, gold frame #D4AF37, glow #FFD66B radiating, dark ink outline, transparent background',
  },
  {
    file: 'props/prop_lantern_off.png',
    width: 128, height: 192,
    prompt: '16x24 pixel art hanging lantern prop, unlit, gold frame #D4AF37, dark glass #7A6E5F, no glow, dark ink outline, transparent background',
  },
  {
    file: 'props/prop_tree.png',
    width: 384, height: 512,
    prompt: '48x64 pixel art courtyard tree sprite, old gnarled tree with character, thick twisted trunk in dark brown #3D2B1F, autumn-colored leaves mixing amber #C8872A and remaining green #4A7C59, slightly asymmetric and aged, dark ink outline, transparent background',
  },
  {
    file: 'props/prop_well.png',
    width: 256, height: 256,
    prompt: '32x32 pixel art courtyard well, stone construction #7A6E5F, wooden roof #6B4226, rope visible, dark ink outline, transparent background',
  },
  {
    file: 'props/tile_flagstone.png',
    width: 128, height: 128,
    prompt: '16x16 pixel art tileable stone floor tile, worn flagstone, stone gray #7A6E5F with darker grout lines #4A4035, subtle variation, tileable seamlessly, transparent background',
  },
  {
    file: 'props/tile_grass.png',
    width: 128, height: 128,
    prompt: '16x16 pixel art tileable grass tile, short grass, forest green #4A7C59 with darker accents #2A4A38, subtle variation, tileable seamlessly, transparent background',
  },
  {
    file: 'props/tile_wall.png',
    width: 128, height: 128,
    prompt: '16x16 pixel art tileable stone wall tile, cut stone blocks, stone gray #7A6E5F with darker mortar lines #4A4035, tileable seamlessly, transparent background',
  },

  // --- World Map ---
  {
    file: 'worldmap/worldmap_base.png',
    width: 960, height: 540,
    prompt: '960x540 pixel art world map, aged parchment style, hand-drawn cartographic illustrations of mountains, forests, coastlines, seas with wave patterns, sepia ink line style, warm parchment background #E8D5A3, no text labels, historical map aesthetic, top-down, clean edges, indie game world map',
  },
  {
    file: 'worldmap/map_icon_player.png',
    width: 128, height: 128,
    prompt: '16x16 pixel art map icon, tiny glowing lantern, gold frame #D4AF37, warm yellow inner glow #FFD66B, dark ink outline, simple and readable at tiny size, transparent background',
  },
  {
    file: 'worldmap/map_icon_rival.png',
    width: 128, height: 128,
    prompt: '16x16 pixel art map icon, scroll with a colored seal, parchment #E8D5A3, deep red seal #8B2D42, dark ink outline, tiny and readable, transparent background',
  },
  {
    file: 'worldmap/map_icon_city.png',
    width: 128, height: 128,
    prompt: '16x16 pixel art map icon, small tower, stone #7A6E5F, dark ink outline, tiny and readable, transparent background',
  },
  {
    file: 'worldmap/map_icon_event.png',
    width: 128, height: 128,
    prompt: '16x16 pixel art map icon, exclamation mark inside a circle, red circle #C43030, cream mark #F4ECD4, dark ink outline, urgent and readable, transparent background',
  },

  // --- Title Screen & Menus ---
  {
    file: 'title/title_background.png',
    width: 1280, height: 720,
    prompt: '1280x720 pixel art title screen background, cozy medieval monastery at golden dusk, glowing windows, scholar desk in foreground with open illuminated manuscript and candle, view looking outward at institution, warm amber and deep blue dusk sky, empty upper-center sky area for title text, intimate and inviting, no characters, indie game art',
  },
  {
    file: 'title/logo_embers_of_memory.png',
    width: 600, height: 200,
    prompt: 'Game logo text "Embers of Memory", illuminated manuscript lettering style, "Embers" in amber gold #C8872A, "of Memory" in warm cream #FFF8E8, elegant medieval serif font, small decorative ember or flame ornament below text, transparent background, warm and literary aesthetic',
  },
  {
    file: 'title/screen_loading.png',
    width: 1280, height: 720,
    prompt: '1280x720 pixel art loading screen, single lit candle centered on screen, warm candlelight pool #FFD66B spreading into deep parchment darkness #3D2B1F, simple and elegant, space below candle for progress bar, intimate and anticipatory atmosphere, no text, no characters, cozy scholarly aesthetic',
  },

  // --- Custom Cursor ---
  {
    file: 'ui/cursor_default.png',
    width: 128, height: 192,
    prompt: '16x24 pixel art cursor, feather quill pen design at rest, white-gray feather #F4ECD4 pointing up-right, gold nib tip #D4AF37 pointing down-left as hotspot, dark ink #1A1009, transparent background, clean pixel art',
  },
  {
    file: 'ui/cursor_hover.png',
    width: 128, height: 192,
    prompt: '16x24 pixel art cursor, feather quill pen slightly angled forward with small ink dot at nib, white-gray feather #F4ECD4, gold nib #D4AF37, transparent background',
  },
  {
    file: 'ui/cursor_click.png',
    width: 128, height: 192,
    prompt: '16x24 pixel art cursor, feather quill pen pressed down, tilted as if pressing, tiny 2px ink splash at nib, white-gray feather #F4ECD4, gold nib #D4AF37, ink #1A1009, transparent background',
  },

  // --- FX Sprite Sheets ---
  {
    file: 'fx/fx_ink_splatter.png',
    width: 640, height: 128,
    prompt: '160x32 pixel art sprite sheet, 5 frames horizontal, ink splatter animation, dark ink #1A1009 drops radiating from center outward then settling, 32x32 per frame, transparent background, project completion celebration effect',
  },
  {
    file: 'fx/fx_gold_sparkle.png',
    width: 384, height: 64,
    prompt: '96x16 pixel art sprite sheet, 6 frames horizontal, gold sparkle particle animation, gold #D4AF37 and bright yellow #FFD66B particles radiating outward then fading, 16x16 per frame, transparent background, revenue earned effect',
  },
  {
    file: 'fx/fx_work_progress.png',
    width: 128, height: 32,
    prompt: '32x8 pixel art sprite sheet, 4 frames horizontal, tiny ambient particle animation, mix of small ink dot #1A1009, tiny letter mark, small amber spark #C8872A, floating upward and fading, 8x8 per frame, very subtle, transparent background',
  },

  // --- Modal Backgrounds ---
  {
    file: 'ui/ui_modal_decision.png',
    width: 560, height: 380,
    prompt: '560x380px modal background, illuminated manuscript decision frame, double border: thick outer dark brown #3D2B1F, inner gold interlacing vine border #D4AF37, parchment interior #E8D5A3 with subtle vignette darkening corners, small candle flame motif at top center between open books, important and weighty medieval aesthetic',
  },
  {
    file: 'ui/ui_modal_release.png',
    width: 560, height: 440,
    prompt: '560x440px release celebration modal, illuminated manuscript frame, rich gold border #D4AF37 with decorative corners featuring quill, book, and star motifs, parchment interior #F4ECD4 with subtle warm gold gradient at center, small illuminated manuscript page ornament at top with decorative flourishes, celebratory and literary medieval aesthetic',
  },
  {
    file: 'ui/ui_border_simple.png',
    width: 512, height: 768,
    prompt: 'Simple manuscript border frame, 400x600px proportions, clean straight dark ink lines #3D2B1F, small decorative marks at corners, ink dot pattern along edges, thin inner gold line #D4AF37, medieval scholarly aesthetic, for UI frame use, transparent inside border area',
  },
  {
    file: 'ui/ui_world_report_letter.png',
    width: 480, height: 340,
    prompt: '480x340px letter dispatch UI element, traveled correspondence aesthetic, parchment with slight rough edges, faint vertical fold line down center, soft ink stain in one corner, minimal thin ink border rule, broken wax seal imprint in bottom right corner, slightly aged and well-traveled feel, warm parchment #E8D5A3 and #C4A87A tones, medieval correspondence aesthetic',
  },
  {
    file: 'ui/ui_skill_bar_track.png',
    width: 480, height: 40,
    prompt: '120x10px pixel art UI skill bar track, very thin and precise, dark ink border #3D2B1F, beige interior #C4A87A, scholarly management game UI, clean and minimal, transparent background',
  },
  {
    file: 'ui/ui_skill_bar_fill_low.png',
    width: 440, height: 32,
    prompt: '110x4px pixel art skill bar fill, low skill level, muted brown #6B4226, clean fill for narrow skill bar, transparent background',
  },
  {
    file: 'ui/ui_skill_bar_fill_mid.png',
    width: 440, height: 32,
    prompt: '110x4px pixel art skill bar fill, mid skill level, warm amber #C8872A, clean fill for narrow skill bar, transparent background',
  },
  {
    file: 'ui/ui_skill_bar_fill_high.png',
    width: 440, height: 32,
    prompt: '110x4px pixel art skill bar fill, high skill level, bright gold #D4AF37 with tiny specular highlight, clean fill for narrow skill bar, transparent background',
  },
  {
    file: 'ui/slider_track.png',
    width: 800, height: 48,
    prompt: '200x12px horizontal slider track UI, narrow parchment-colored channel #E8D5A3 with dark ink border #3D2B1F, medieval manuscript aesthetic, transparent background',
  },
  {
    file: 'ui/slider_thumb.png',
    width: 64, height: 80,
    prompt: '16x20px slider thumb UI element, small wax seal or stamp shape in gold #D4AF37, dark ink outline, medieval manuscript aesthetic, transparent background',
  },

  // --- Ideology Axis Indicators ---
  {
    file: 'ui/ui_ideology_access.png',
    width: 800, height: 96,
    prompt: '200x24px horizontal gradient bar UI, smooth gradient from deep plum #4A2060 on left to forest green #4A7C59 on right, slightly textured parchment overlay, thin dark ink border #3D2B1F, small gold circular marker #D4AF37 at center position, medieval manuscript aesthetic',
  },
  {
    file: 'ui/ui_ideology_authority.png',
    width: 800, height: 96,
    prompt: '200x24px horizontal gradient bar UI, gradient from burgundy #8B2D42 on left to lapis blue #26619C on right, parchment texture overlay, thin dark ink border, small gold marker at center, medieval manuscript aesthetic',
  },
  {
    file: 'ui/ui_ideology_cosmology.png',
    width: 800, height: 96,
    prompt: '200x24px horizontal gradient bar UI, gradient from gold #D4AF37 on left to stone gray #7A6E5F on right, parchment texture overlay, thin dark ink border, small gold marker at center, medieval manuscript aesthetic',
  },
  {
    file: 'ui/ui_ideology_method.png',
    width: 800, height: 96,
    prompt: '200x24px horizontal gradient bar UI, gradient from deep lapis #1A3A6B on left to sage green #7DA882 on right, parchment texture overlay, thin dark ink border, small gold marker at center, medieval manuscript aesthetic',
  },
  {
    file: 'ui/ui_ideology_purpose.png',
    width: 800, height: 96,
    prompt: '200x24px horizontal gradient bar UI, gradient from deep amber #8B5E00 on left to daytime sky #7A9CC4 on right, parchment texture overlay, thin dark ink border, small gold marker at center, medieval manuscript aesthetic',
  },

  // --- Patron Icons ---
  {
    file: 'icons/patron/icon_patron_temple.png',
    width: 512, height: 512,
    prompt: '32x32 pixel art icon, small sacred flame inside a stone arch, gold flame #D4AF37, stone arch #7A6E5F, parchment background #E8D5A3, dark ink outline, square icon, transparent background',
  },
  {
    file: 'icons/patron/icon_patron_merchant.png',
    width: 512, height: 512,
    prompt: '32x32 pixel art icon, small leather coin purse with gold coins spilling out, warm amber purse #C8872A, gold coins #D4AF37, parchment background, dark ink outline, merchant aesthetic, square icon, transparent background',
  },
  {
    file: 'icons/patron/icon_patron_ruler.png',
    width: 512, height: 512,
    prompt: '32x32 pixel art icon, small crown, gold #D4AF37 with dark amber shadow #8B5E00, parchment background #E8D5A3, dark ink outline, simple bold design, square icon, transparent background',
  },
  {
    file: 'icons/patron/icon_patron_scholarly.png',
    width: 512, height: 512,
    prompt: '32x32 pixel art icon, ink quill resting on an open book, dark ink quill #1A1009 with cream feather #F4ECD4, parchment book #E8D5A3, dark ink outline, square icon, transparent background',
  },
  {
    file: 'icons/patron/icon_patron_community.png',
    width: 512, height: 512,
    prompt: '32x32 pixel art icon, three small simplified figures standing together, warm tan #C4A87A and brown #6B4226, parchment background, dark ink outline, community and togetherness, square icon, transparent background',
  },
];

// =============================================================================
// Entry Point
// =============================================================================

const arg = process.argv[2] ?? '1';

(async () => {
  if (!process.env.REPLICATE_API_TOKEN) {
    console.error('Error: REPLICATE_API_TOKEN environment variable not set.');
    console.error('  set REPLICATE_API_TOKEN=r8_your_token_here');
    process.exit(1);
  }

  console.log(`Art output directory: ${ART_OUTPUT}`);
  console.log(`Model: ${MODEL}`);

  if (arg === '1' || arg === 'all') await runTier('TIER 1 — Prototype Blockers', TIER1);
  if (arg === '2' || arg === 'all') await runTier('TIER 2 — Visual Polish', TIER2);
  if (arg === '3' || arg === 'all') await runTier('TIER 3 — Full Game', TIER3);

  console.log('\nDone.');
})();
