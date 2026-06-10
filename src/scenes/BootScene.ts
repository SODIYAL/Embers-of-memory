import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' });
  }

  preload() {
    // Explicitly clear camera to the game's base colour so Phaser 4 WebGL doesn't
    // leave the canvas transparent during asset loading.
    this.cameras.main.setBackgroundColor('#1a0f0a');

    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;

    // Loading bar
    this.add.rectangle(cx, cy + 40, 402, 10, 0x3d2010);
    const bar = this.add.rectangle(cx - 200, cy + 40, 0, 8, 0xd4a855).setOrigin(0, 0.5);
    this.add.text(cx, cy + 16, 'Loading…', {
      fontSize: '14px',
      color: '#c8a87a',
      fontFamily: 'serif',
    }).setOrigin(0.5);

    this.load.on('progress', (v: number) => { bar.width = 400 * v; });

    // ── Backgrounds ────────────────────────────────────────────
    this.load.image('bg_title',       '/assets/backgrounds/title_background.png');
    this.load.image('bg_loading',     '/assets/backgrounds/screen_loading.png');
    this.load.image('bg_hall_day',    '/assets/backgrounds/campus_founding_hall_day.png');
    this.load.image('bg_hall_night',  '/assets/backgrounds/campus_founding_hall_night.png');
    this.load.image('bg_hall_winter', '/assets/backgrounds/campus_founding_hall_winter.png');
    this.load.image('bg_library',     '/assets/backgrounds/interior_library.png');
    this.load.image('bg_scriptorium', '/assets/backgrounds/interior_scriptorium.png');
    this.load.image('bg_worldmap',    '/assets/backgrounds/worldmap_base.png');
    this.load.image('title_cloud_band',   '/assets/title/title_cloud_band.png');
    this.load.image('title_birds_sheet',  '/assets/title/title_birds_sheet.png');
    this.load.image('title_curtain_edge', '/assets/title/title_curtain_edge.png');
    this.load.image('title_light_rays',   '/assets/title/title_light_rays.png');
    this.load.image('title_dust_mote',    '/assets/title/title_dust_mote.png');

    // ── UI chrome ──────────────────────────────────────────────
    this.load.image('logo',               '/assets/ui/logo_embers_of_memory.png');
    this.load.image('panel_parchment',    '/assets/ui/ui_panel_parchment.png');
    this.load.image('ui_border_ornate',   '/assets/ui/ui_border_ornate.png');
    this.load.image('ui_border_simple',   '/assets/ui/ui_border_simple.png');
    this.load.image('card_scholar',       '/assets/ui/card_scholar.png');
    this.load.image('ui_modal_decision',  '/assets/ui/ui_modal_decision.png');
    this.load.image('ui_modal_release',   '/assets/ui/ui_modal_release.png');
    this.load.image('ui_notification',    '/assets/ui/ui_notification.png');
    this.load.image('ui_world_report',    '/assets/ui/ui_world_report_letter.png');
    this.load.image('ui_tab_active',      '/assets/ui/ui_tab_active.png');
    this.load.image('ui_tab_inactive',    '/assets/ui/ui_tab_inactive.png');

    // Buttons
    this.load.image('btn_primary',        '/assets/ui/btn_primary.png');
    this.load.image('btn_primary_hover',  '/assets/ui/btn_primary_hover.png');
    this.load.image('btn_secondary',      '/assets/ui/btn_secondary.png');
    this.load.image('btn_secondary_hover','/assets/ui/btn_secondary_hover.png');
    this.load.image('btn_disabled',       '/assets/ui/btn_disabled.png');
    this.load.image('btn_play',           '/assets/ui/btn_play.png');
    this.load.image('btn_play_active',    '/assets/ui/btn_play_active.png');
    this.load.image('btn_pause',          '/assets/ui/btn_pause.png');
    this.load.image('btn_pause_active',   '/assets/ui/btn_pause_active.png');
    this.load.image('btn_fast',           '/assets/ui/btn_fast.png');
    this.load.image('btn_fast_active',    '/assets/ui/btn_fast_active.png');

    // Progress & skill bars
    this.load.image('ui_progress_track',  '/assets/ui/ui_progress_bar_track.png');
    this.load.image('ui_progress_fill',   '/assets/ui/ui_progress_bar_fill.png');
    this.load.image('ui_skill_track',     '/assets/ui/ui_skill_bar_track.png');
    this.load.image('ui_skill_low',       '/assets/ui/ui_skill_bar_fill_low.png');
    this.load.image('ui_skill_mid',       '/assets/ui/ui_skill_bar_fill_mid.png');
    this.load.image('ui_skill_high',      '/assets/ui/ui_skill_bar_fill_high.png');

    // Slider
    this.load.image('slider_track',       '/assets/ui/slider_track.png');
    this.load.image('slider_thumb',       '/assets/ui/slider_thumb.png');

    // Morale (1–5)
    for (let i = 1; i <= 5; i++) {
      this.load.image(`ui_morale_${i}`, `/assets/ui/ui_morale_${i}.png`);
    }

    // Treasury indicators
    for (const s of ['critical', 'strained', 'stable', 'prosperous']) {
      this.load.image(`indicator_${s}`, `/assets/ui/indicator_${s}.png`);
    }

    // Quality badges (1–6)
    for (let i = 1; i <= 6; i++) {
      this.load.image(`badge_quality_${i}`, `/assets/ui/badge_quality_${i}.png`);
    }

    // Ideology panels
    for (const s of ['access', 'authority', 'cosmology', 'method', 'purpose']) {
      this.load.image(`ideology_${s}`, `/assets/ui/ui_ideology_${s}.png`);
    }

    // ── Portraits ──────────────────────────────────────────────
    for (const name of ['harlow', 'meridian', 'ossavi', 'vasara', 'yildiz']) {
      this.load.image(`portrait_${name}`, `/assets/portraits/portrait_${name}.png`);
    }

    // ── Characters ─────────────────────────────────────────────
    // All character sprites are horizontal frame strips — 32×48 px per frame
    const FRAME = { frameWidth: 32, frameHeight: 48 };
    const named = ['harlow', 'meridian', 'ossavi', 'vasara', 'yildiz'];
    const states = ['idle', 'walk', 'sit', 'react'];
    for (const name of named) {
      for (const state of states) {
        this.load.spritesheet(`scholar_${name}_${state}`, `/assets/characters/scholar_${name}_${state}.png`, FRAME);
      }
    }
    for (const v of ['a', 'b', 'c']) {
      this.load.spritesheet(`scholar_generic_${v}_idle`, `/assets/characters/scholar_generic_${v}_idle.png`, FRAME);
    }
    this.load.spritesheet('student_idle', '/assets/characters/student_idle.png', FRAME);
    this.load.spritesheet('student_walk', '/assets/characters/student_walk.png', FRAME);

    // ── Buildings & props ──────────────────────────────────────
    for (const name of [
      'archive_vault', 'founders_tower', 'founding_hall', 'guest_quarters',
      'library', 'music_hall', 'observatory', 'public_hall', 'scriptorium_wing',
    ]) {
      this.load.image(`building_${name}`, `/assets/buildings/building_${name}.png`);
    }
    this.load.image('prop_garden',             '/assets/buildings/prop_garden.png');
    this.load.image('prop_teaching_courtyard', '/assets/buildings/prop_teaching_courtyard.png');
    for (const name of ['bench', 'inkquill', 'lantern_off', 'lantern_on', 'manuscripts', 'tree', 'well']) {
      this.load.image(`prop_${name}`, `/assets/props/prop_${name}.png`);
    }
    for (const name of ['flagstone', 'grass', 'wall']) {
      this.load.image(`tile_${name}`, `/assets/props/tile_${name}.png`);
    }
    for (const name of ['birds_sheet', 'prayer_flags_overlay', 'tree_canopy_overlay']) {
      this.load.image(`ambient_${name}`, `/assets/ambient/ambient_${name}.png`);
    }
    // The bird sheet again as an animatable spritesheet (6 flap frames).
    this.load.spritesheet('bird_sheet', '/assets/ambient/ambient_birds_sheet.png', { frameWidth: 85, frameHeight: 75 });
    for (const stage of ['research', 'drafting', 'refinement']) {
      this.load.image(`workstation_${stage}`, `/assets/workstations/workstation_${stage}.png`);
    }

    // ── Icons ──────────────────────────────────────────────────
    for (const name of [
      'architecture', 'astronomy', 'cartography', 'education', 'engineering',
      'history', 'law', 'literature', 'mathematics', 'medicine', 'music',
      'mysticism', 'natural_history', 'philosophy', 'politics', 'theology', 'trade',
    ]) {
      this.load.image(`icon_topic_${name}`, `/assets/icons/icon_topic_${name}.png`);
    }
    for (const name of [
      'architectural_plans', 'atlas', 'chronicle', 'commentary', 'correspondence',
      'encyclopedia', 'epic_poetry', 'field_survey', 'handbook', 'hymn',
      'illuminated_manuscript', 'lecture', 'musical_composition', 'philosophical_treatise',
      'propaganda_pamphlet', 'sacred_text', 'scientific_compendium', 'stage_performance',
    ]) {
      this.load.image(`icon_format_${name}`, `/assets/icons/icon_format_${name}.png`);
    }
    for (const name of [
      'court_scholar', 'institutional_builder', 'kindler', 'master_craftsperson',
      'mathematical_mind', 'natural_philosopher', 'oral_keeper', 'political_theorist',
      'pragmatic_chronicler', 'skeptical_empiricist', 'spiritual_composer',
      'theological_debater', 'wandering_mystic',
    ]) {
      this.load.image(`badge_archetype_${name}`, `/assets/icons/badge_archetype_${name}.png`);
    }
    for (const name of ['community', 'merchant', 'ruler', 'scholarly', 'temple']) {
      this.load.image(`icon_patron_${name}`, `/assets/icons/icon_patron_${name}.png`);
    }
    for (const name of ['city', 'event', 'player', 'rival', 'trade']) {
      this.load.image(`map_icon_${name}`, `/assets/icons/map_icon_${name}.png`);
    }

    // ── Cursors ────────────────────────────────────────────────
    for (const name of ['default', 'hover', 'click']) {
      this.load.image(`cursor_${name}`, `/assets/cursors/cursor_${name}.png`);
    }

    // ── FX ─────────────────────────────────────────────────────
    for (const name of ['candle_flame', 'gold_sparkle', 'ink_splatter', 'work_progress']) {
      this.load.image(`fx_${name}`, `/assets/fx/fx_${name}.png`);
    }

    // Audio — SFX
    for (const name of [
      'ui_click', 'ui_hover', 'ui_select', 'ui_back',
      'modal_open', 'modal_close',
      'project_start', 'project_complete',
      'coin_gain', 'page_turn', 'quill_scratch', 'error',
    ]) {
      this.load.audio(name, `/assets/audio/sfx/${name}.wav`);
    }

    // Music — looped ambient tracks. These files are optional; the Audio
    // service no-ops on missing keys, so play() is safe even if the asset
    // hasn't been authored yet. Drop a real file at the path below to wire
    // it up.
    //   public/assets/audio/music/campus_ambient.mp3
    //   public/assets/audio/music/menu_theme.mp3
    // We use `load.audio` with a `.silent` skip via a "file not found" 404
    // tolerance: Phaser logs a warning but doesn't crash. If you'd rather
    // not see the warning, remove these two lines until the assets exist.
    // (Commented out for now to avoid 404s in the console.)
    // this.load.audio('music_menu',    '/assets/audio/music/menu_theme.mp3');
    // this.load.audio('music_campus',  '/assets/audio/music/campus_ambient.mp3');
  }

  create() {
    this.scene.start('Menu');
  }
}
