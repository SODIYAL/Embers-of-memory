import { access } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, '../public');

const imagePaths = [
  '/assets/backgrounds/title_background.png',
  '/assets/backgrounds/screen_loading.png',
  '/assets/backgrounds/campus_founding_hall_day.png',
  '/assets/backgrounds/campus_founding_hall_night.png',
  '/assets/backgrounds/campus_founding_hall_winter.png',
  '/assets/backgrounds/interior_library.png',
  '/assets/backgrounds/interior_scriptorium.png',
  '/assets/backgrounds/worldmap_base.png',

  '/assets/ui/logo_embers_of_memory.png',
  '/assets/ui/ui_panel_parchment.png',
  '/assets/ui/ui_border_ornate.png',
  '/assets/ui/ui_border_simple.png',
  '/assets/ui/card_scholar.png',
  '/assets/ui/ui_modal_decision.png',
  '/assets/ui/ui_modal_release.png',
  '/assets/ui/ui_notification.png',
  '/assets/ui/ui_world_report_letter.png',
  '/assets/ui/ui_tab_active.png',
  '/assets/ui/ui_tab_inactive.png',
  '/assets/ui/btn_primary.png',
  '/assets/ui/btn_primary_hover.png',
  '/assets/ui/btn_secondary.png',
  '/assets/ui/btn_secondary_hover.png',
  '/assets/ui/btn_disabled.png',
  '/assets/ui/btn_play.png',
  '/assets/ui/btn_play_active.png',
  '/assets/ui/btn_pause.png',
  '/assets/ui/btn_pause_active.png',
  '/assets/ui/btn_fast.png',
  '/assets/ui/btn_fast_active.png',
  '/assets/ui/ui_progress_bar_track.png',
  '/assets/ui/ui_progress_bar_fill.png',
  '/assets/ui/ui_skill_bar_track.png',
  '/assets/ui/ui_skill_bar_fill_low.png',
  '/assets/ui/ui_skill_bar_fill_mid.png',
  '/assets/ui/ui_skill_bar_fill_high.png',
  '/assets/ui/slider_track.png',
  '/assets/ui/slider_thumb.png',
  ...[1, 2, 3, 4, 5].map((i) => `/assets/ui/ui_morale_${i}.png`),
  ...['critical', 'strained', 'stable', 'prosperous'].map((s) => `/assets/ui/indicator_${s}.png`),
  ...[1, 2, 3, 4, 5, 6].map((i) => `/assets/ui/badge_quality_${i}.png`),
  ...['access', 'authority', 'cosmology', 'method', 'purpose'].map((s) => `/assets/ui/ui_ideology_${s}.png`),

  ...['harlow', 'meridian', 'ossavi', 'vasara', 'yildiz'].map((name) => `/assets/portraits/portrait_${name}.png`),
  ...['harlow', 'meridian', 'ossavi', 'vasara', 'yildiz'].flatMap((name) =>
    ['idle', 'walk', 'sit', 'react'].map((state) => `/assets/characters/scholar_${name}_${state}.png`)
  ),
  ...['a', 'b', 'c'].map((v) => `/assets/characters/scholar_generic_${v}_idle.png`),
  '/assets/characters/student_idle.png',
  '/assets/characters/student_walk.png',

  ...[
    'archive_vault', 'founders_tower', 'founding_hall', 'guest_quarters',
    'library', 'music_hall', 'observatory', 'public_hall', 'scriptorium_wing',
  ].map((name) => `/assets/buildings/building_${name}.png`),
  '/assets/buildings/prop_garden.png',
  '/assets/buildings/prop_teaching_courtyard.png',
  ...['bench', 'inkquill', 'lantern_off', 'lantern_on', 'manuscripts', 'tree', 'well'].map((name) => `/assets/props/prop_${name}.png`),
  ...['flagstone', 'grass', 'wall'].map((name) => `/assets/props/tile_${name}.png`),

  ...[
    'architecture', 'astronomy', 'cartography', 'education', 'engineering',
    'history', 'law', 'literature', 'mathematics', 'medicine', 'music',
    'mysticism', 'natural_history', 'philosophy', 'politics', 'theology', 'trade',
  ].map((name) => `/assets/icons/icon_topic_${name}.png`),
  ...[
    'architectural_plans', 'atlas', 'chronicle', 'commentary', 'correspondence',
    'encyclopedia', 'epic_poetry', 'field_survey', 'handbook', 'hymn',
    'illuminated_manuscript', 'lecture', 'musical_composition', 'philosophical_treatise',
    'propaganda_pamphlet', 'sacred_text', 'scientific_compendium', 'stage_performance',
  ].map((name) => `/assets/icons/icon_format_${name}.png`),
  ...[
    'court_scholar', 'institutional_builder', 'kindler', 'master_craftsperson',
    'mathematical_mind', 'natural_philosopher', 'oral_keeper', 'political_theorist',
    'pragmatic_chronicler', 'skeptical_empiricist', 'spiritual_composer',
    'theological_debater', 'wandering_mystic',
  ].map((name) => `/assets/icons/badge_archetype_${name}.png`),
  ...['community', 'merchant', 'ruler', 'scholarly', 'temple'].map((name) => `/assets/icons/icon_patron_${name}.png`),
  ...['city', 'event', 'player', 'rival', 'trade'].map((name) => `/assets/icons/map_icon_${name}.png`),
  ...['default', 'hover', 'click'].map((name) => `/assets/cursors/cursor_${name}.png`),
  ...['candle_flame', 'gold_sparkle', 'ink_splatter', 'work_progress'].map((name) => `/assets/fx/fx_${name}.png`),
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
for (const path of [...imagePaths, ...audioPaths]) {
  try {
    await access(join(PUBLIC, path.replace(/^\//, '')));
  } catch {
    missing.push(path);
  }
}

if (missing.length > 0) {
  throw new Error(`Missing linked assets:\n${missing.join('\n')}`);
}

console.log(`Asset link verification passed for ${imagePaths.length} images and ${audioPaths.length} audio files.`);
