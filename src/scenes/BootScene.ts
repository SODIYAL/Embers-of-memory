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

    // Only textures the scenes actually draw are loaded. The DOM overlay
    // (panels/modals) references its images by URL, not through Phaser.

    // ── Backdrops ──────────────────────────────────────────────
    // Procedural pixel backdrops (scripts/gen-pixel-assets.mjs)
    this.load.image('bg_campus_sky', 'assets/backgrounds/bg_campus_sky.png');
    this.load.image('bg_title_px',   'assets/backgrounds/bg_title_px.png');
    this.load.image('cloud_px_a',    'assets/ambient/cloud_px_a.png');
    this.load.image('cloud_px_b',    'assets/ambient/cloud_px_b.png');
    this.load.image('ui_ember_mark', 'assets/ui/ui_ember_mark.png');

    // ── UI chrome (scripts/draw-pixel-ui.mjs) ──────────────────
    this.load.image('btn_primary',        'assets/ui/btn_primary.png');
    this.load.image('btn_primary_hover',  'assets/ui/btn_primary_hover.png');
    this.load.image('btn_play',           'assets/ui/btn_play.png');
    this.load.image('btn_play_active',    'assets/ui/btn_play_active.png');
    this.load.image('btn_pause',          'assets/ui/btn_pause.png');
    this.load.image('btn_pause_active',   'assets/ui/btn_pause_active.png');
    this.load.image('btn_fast',           'assets/ui/btn_fast.png');
    this.load.image('btn_fast_active',    'assets/ui/btn_fast_active.png');

    // Treasury indicators
    for (const s of ['critical', 'strained', 'stable', 'prosperous']) {
      this.load.image(`indicator_${s}`, `assets/ui/indicator_${s}.png`);
    }

    // ── Characters ─────────────────────────────────────────────
    // All character sprites are horizontal frame strips — 32×48 px per frame
    const FRAME = { frameWidth: 32, frameHeight: 48 };
    const named = ['harlow', 'meridian', 'ossavi', 'vasara', 'yildiz'];
    const states = ['idle', 'walk', 'sit', 'react'];
    for (const name of named) {
      for (const state of states) {
        this.load.spritesheet(`scholar_${name}_${state}`, `assets/characters/scholar_${name}_${state}.png`, FRAME);
      }
    }
    for (const v of ['a', 'b', 'c']) {
      this.load.spritesheet(`scholar_generic_${v}_idle`, `assets/characters/scholar_generic_${v}_idle.png`, FRAME);
    }
    this.load.spritesheet('student_idle', 'assets/characters/student_idle.png', FRAME);
    this.load.spritesheet('student_walk', 'assets/characters/student_walk.png', FRAME);

    // ── Buildings & props (the campus stage kit) ───────────────
    for (const name of ['founders_tower', 'founding_hall', 'library', 'observatory', 'scriptorium_wing']) {
      this.load.image(`building_${name}`, `assets/buildings/building_${name}.png`);
    }
    this.load.image('prop_garden',             'assets/buildings/prop_garden.png');
    this.load.image('prop_teaching_courtyard', 'assets/buildings/prop_teaching_courtyard.png');
    for (const name of ['bench', 'lantern_off', 'lantern_on', 'tree', 'well']) {
      this.load.image(`prop_${name}`, `assets/props/prop_${name}.png`);
    }
    for (const name of ['flagstone', 'grass', 'wall']) {
      this.load.image(`tile_${name}`, `assets/props/tile_${name}.png`);
    }
    this.load.image('ambient_birds_sheet', 'assets/ambient/ambient_birds_sheet.png');
    // The bird sheet again as an animatable spritesheet (6 flap frames).
    this.load.spritesheet('bird_sheet', 'assets/ambient/ambient_birds_sheet.png', { frameWidth: 85, frameHeight: 75 });
    for (const stage of ['research', 'drafting', 'refinement']) {
      this.load.image(`workstation_${stage}`, `assets/workstations/workstation_${stage}.png`);
    }

    // ── FX (frame strips from scripts/draw-pixel-ui.mjs) ───────
    this.load.spritesheet('fx_gold_sparkle', 'assets/fx/fx_gold_sparkle.png', { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('fx_ink_splatter', 'assets/fx/fx_ink_splatter.png', { frameWidth: 32, frameHeight: 32 });

    // Audio — SFX
    for (const name of [
      'ui_click', 'ui_hover', 'ui_select', 'ui_back',
      'modal_open', 'modal_close',
      'project_start', 'project_complete',
      'coin_gain', 'page_turn', 'quill_scratch', 'error',
    ]) {
      this.load.audio(name, `assets/audio/sfx/${name}.wav`);
    }

    // Music — looped mountain-wind ambience, synthesized by
    // scripts/generate-ambience.mjs. Starts on the menu and carries into
    // the campus (same key, so the cross-fade no-ops between scenes).
    this.load.audio('music_campus', 'assets/audio/music/campus_ambient.mp3');
  }

  create() {
    // Make sure the Alagard pixel font is ready before any scene renders
    // text with it (Phaser rasterizes text once at creation).
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    const ready = fonts ? fonts.load('16px Alagard') : Promise.resolve([]);
    Promise.resolve(ready)
      .catch(() => undefined)
      .then(() => this.scene.start('Menu'));
  }
}
