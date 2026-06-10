import Phaser from 'phaser';
import { Game } from '../game/GameManager';
import { consumeSaveResetReason } from '../game/SaveManager';
import { Audio } from '../game/Audio';

const LOGO_MAX_WIDTH = 420;

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Menu' });
  }

  create() {
    const { width, height } = this.scale;
    const cx = width / 2;

    // Initialize the central audio service. Future scenes share this instance.
    Audio.init(this);
    // Ambience starts here and continues into the campus (same key).
    Audio.playMusic('music_campus', { fadeMs: 2500 });

    this.buildTitleAtmosphere(width, height, cx);

    const logo = this.add.image(cx, height * 0.34, 'logo').setAlpha(0);
    logo.setScale(Math.min(1, LOGO_MAX_WIDTH / logo.width));

    const tagline = this.add
      .text(cx, height * 0.54, 'A monastery of knowledge. A civilization of thought.', {
        fontSize: '15px',
        color: '#c8a87a',
        fontFamily: 'Georgia, serif',
        fontStyle: 'italic',
      })
      .setOrigin(0.5)
      .setAlpha(0);

    this.add
      .text(width - 12, height - 10, 'v0.0.1', {
        fontSize: '11px',
        color: '#6b4a30',
        fontFamily: 'monospace',
      })
      .setOrigin(1, 1);

    this.tweens.add({ targets: logo, duration: 1200, alpha: 1, ease: 'Sine.easeIn', delay: 400 });

    if (Game.save.hasSave()) {
      this.buildContinueButtons(cx, height, tagline);
    } else {
      this.buildBeginButton(cx, height, tagline);
    }

    // If the load discarded a stale save, surface a quiet notice.
    const reason = consumeSaveResetReason();
    if (reason) {
      this.showSaveResetNotice(cx, height, reason);
    }
  }

  private buildTitleAtmosphere(width: number, height: number, cx: number) {
    const cy = height / 2;

    this.add.image(cx, cy, 'bg_title').setDisplaySize(width, height);

    const cloudA = this.add.image(cx - 40, height * 0.16, 'title_cloud_band')
      .setScale(0.58)
      .setAlpha(0.18);
    const cloudB = this.add.image(cx + 360, height * 0.22, 'title_cloud_band')
      .setScale(0.42)
      .setAlpha(0.1)
      .setFlipX(true);
    const birds = this.add.image(cx + 70, height * 0.18, 'title_birds_sheet')
      .setScale(0.22)
      .setAlpha(0.32);

    const dust = this.add.image(width * 0.53, height * 0.62, 'title_dust_mote')
      .setScale(0.78)
      .setAlpha(0.12)
      .setBlendMode(Phaser.BlendModes.ADD);

    const curtain = this.add.image(-18, height * 0.47, 'title_curtain_edge')
      .setOrigin(0, 0.5)
      .setDisplaySize(190, height * 1.18)
      .setAlpha(0.58);

    this.add.rectangle(cx, cy, width, height, 0x000000, 0.28);

    this.tweens.add({
      targets: cloudA,
      x: cloudA.x - 18,
      duration: 18000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.tweens.add({
      targets: cloudB,
      x: cloudB.x + 16,
      duration: 22000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.tweens.add({
      targets: birds,
      x: birds.x - 44,
      y: birds.y + 4,
      alpha: 0.18,
      duration: 15000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.tweens.add({
      targets: curtain,
      x: curtain.x + 3,
      angle: 0.35,
      duration: 4200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.tweens.add({
      targets: dust,
      y: dust.y - 18,
      alpha: 0.25,
      duration: 5600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private showSaveResetNotice(cx: number, height: number, reason: 'mismatch' | 'corrupt') {
    const text = reason === 'mismatch'
      ? 'A previous save was from an older version of the game and could not be carried over. A fresh institution awaits.'
      : 'A previous save was unreadable. A fresh institution awaits.';

    const bg = this.add
      .rectangle(cx, height * 0.86, 560, 56, 0x18100a, 0.92)
      .setStrokeStyle(1, 0x5a3820)
      .setAlpha(0);

    const label = this.add
      .text(cx, height * 0.86, text, {
        fontSize: '12px',
        color: '#c8a87a',
        fontFamily: 'Georgia, serif',
        fontStyle: 'italic',
        align: 'center',
        wordWrap: { width: 540 },
      })
      .setOrigin(0.5)
      .setAlpha(0);

    this.tweens.add({
      targets: [bg, label],
      alpha: 1,
      duration: 800,
      delay: 1800,
      ease: 'Sine.easeIn',
    });
  }

  // ── No save — single Begin button ────────────────────────────────

  private buildBeginButton(
    cx: number, height: number,
    tagline: Phaser.GameObjects.Text,
  ) {
    const btnY = height * 0.66;

    const btn = this.add
      .image(cx, btnY, 'btn_primary')
      .setAlpha(0)
      .setInteractive({ useHandCursor: true });

    const label = this.add
      .text(cx, btnY, 'Begin', {
        fontSize: '20px',
        color: '#3a1f0c',
        fontFamily: 'Georgia, serif',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setAlpha(0);

    this.tweens.add({ targets: [tagline, btn, label], duration: 900, alpha: 1, ease: 'Sine.easeIn', delay: 1100 });

    btn.on('pointerover',  () => { btn.setTexture('btn_primary_hover'); Audio.playHover(); });
    btn.on('pointerout',   () => btn.setTexture('btn_primary'));
    btn.on('pointerdown',  () => {
      Audio.playSfx('ui_select');
      btn.setTexture('btn_primary');
      this.fadeToGame();
    });
  }

  // ── Save exists — Continue + New Game ────────────────────────────

  private buildContinueButtons(
    cx: number, height: number,
    tagline: Phaser.GameObjects.Text,
  ) {
    // Continue — primary styled button
    const contBg = this.add
      .rectangle(cx, height * 0.64, 220, 48, 0x5c3418)
      .setAlpha(0)
      .setInteractive({ useHandCursor: true });

    const contLabel = this.add
      .text(cx, height * 0.64, 'Continue', {
        fontSize: '17px',
        color: '#e8d5b0',
        fontFamily: 'Georgia, serif',
        letterSpacing: 2,
      })
      .setOrigin(0.5)
      .setAlpha(0);

    contBg.on('pointerover',  () => { contBg.setFillStyle(0x6e3e1c); Audio.playHover(); });
    contBg.on('pointerout',   () => contBg.setFillStyle(0x5c3418));
    contBg.on('pointerdown',  () => { Audio.playSfx('ui_select'); this.fadeToGame(); });

    // New Game — text link below
    const newGameLink = this.add
      .text(cx, height * 0.74, 'New Game', {
        fontSize: '13px',
        color: '#6a4828',
        fontFamily: 'Georgia, serif',
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setInteractive({ useHandCursor: true });

    newGameLink.on('pointerover',  () => { newGameLink.setColor('#c8a87a'); Audio.playHover(); });
    newGameLink.on('pointerout',   () => newGameLink.setColor('#6a4828'));
    newGameLink.on('pointerdown',  () => {
      Audio.playSfx('ui_select');
      Game.reset();
      this.fadeToGame();
    });

    this.tweens.add({
      targets: [tagline, contBg, contLabel],
      duration: 900, alpha: 1, ease: 'Sine.easeIn', delay: 1100,
    });
    this.tweens.add({
      targets: newGameLink,
      duration: 700, alpha: 1, ease: 'Sine.easeIn', delay: 1500,
    });
  }

  private fadeToGame() {
    this.cameras.main.fadeOut(700, 26, 15, 10);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('Campus');
    });
  }
}
