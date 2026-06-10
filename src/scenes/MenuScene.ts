import Phaser from 'phaser';
import { Game } from '../game/GameManager';
import { consumeSaveResetReason } from '../game/SaveManager';
import { Audio } from '../game/Audio';

const TITLE_FONT = 'Alagard, Georgia, serif';

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

    // Title — set in the open sky left of the monastery silhouette.
    const titleX = width * 0.38;
    const title = this.add.text(titleX, height * 0.25, 'Embers of Memory', {
      fontSize: '52px',
      color: '#e8d5b0',
      fontFamily: TITLE_FONT,
      stroke: '#1a0d06',
      strokeThickness: 8,
    }).setOrigin(0.5).setAlpha(0);

    const tagline = this.add
      .text(titleX, height * 0.355, 'A monastery of knowledge. A civilization of thought.', {
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

    this.tweens.add({ targets: title, duration: 1200, alpha: 1, ease: 'Sine.easeIn', delay: 400 });

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

    // Procedural dusk vista (640×360 pixel art at 2×).
    this.add.image(0, 0, 'bg_title_px').setOrigin(0).setScale(2);

    // Slow clouds drifting across the dusk sky.
    const cloudA = this.add.image(cx - 280, height * 0.16, 'cloud_px_a')
      .setScale(2)
      .setAlpha(0.20)
      .setTint(0x9a86a8);
    const cloudB = this.add.image(cx + 330, height * 0.24, 'cloud_px_b')
      .setScale(2)
      .setAlpha(0.16)
      .setTint(0x7c6890)
      .setFlipX(true);

    // Faint warm motes rising near the monastery, like sparks on the wind.
    for (let i = 0; i < 10; i++) {
      const mote = this.add.circle(
        width * (0.3 + Math.random() * 0.4),
        height * (0.45 + Math.random() * 0.3),
        1 + Math.random(),
        0xf2d19a,
        0.10 + Math.random() * 0.14,
      ).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: mote,
        y: mote.y - 30 - Math.random() * 40,
        alpha: 0.02,
        duration: 6000 + Math.random() * 5000,
        repeat: -1,
        delay: Math.random() * 4000,
        ease: 'Sine.easeOut',
      });
    }

    // Gentle darkening so the title text carries.
    this.add.rectangle(cx, cy, width, height, 0x000000, 0.22);

    this.tweens.add({
      targets: cloudA, x: cloudA.x + 50, duration: 26000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
    this.tweens.add({
      targets: cloudB, x: cloudB.x - 40, duration: 32000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  private showSaveResetNotice(cx: number, height: number, reason: 'mismatch' | 'corrupt') {
    const text = reason === 'mismatch'
      ? 'A previous save was from an older version of the game and could not be carried over. A fresh institution awaits.'
      : 'A previous save was unreadable. A fresh institution awaits.';

    const bg = this.add
      .rectangle(cx, height * 0.88, 560, 56, 0x18100a, 0.92)
      .setStrokeStyle(2, 0x5a3820)
      .setAlpha(0);

    const label = this.add
      .text(cx, height * 0.88, text, {
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

  // Shared pixel-plate button (btn_primary drawn at 2× → 160×44).
  private makePlateButton(cx: number, y: number, text: string, onClick: () => void) {
    const btn = this.add
      .image(cx, y, 'btn_primary')
      .setScale(2)
      .setAlpha(0)
      .setInteractive({ useHandCursor: true });

    const label = this.add
      .text(cx, y, text, {
        fontSize: '20px',
        color: '#3a1f0c',
        fontFamily: TITLE_FONT,
      })
      .setOrigin(0.5)
      .setAlpha(0);

    btn.on('pointerover', () => { btn.setTexture('btn_primary_hover'); Audio.playHover(); });
    btn.on('pointerout',  () => btn.setTexture('btn_primary'));
    btn.on('pointerdown', () => {
      Audio.playSfx('ui_select');
      btn.setTexture('btn_primary');
      onClick();
    });
    return [btn, label] as const;
  }

  // ── No save — single Begin button ────────────────────────────────

  private buildBeginButton(
    cx: number, height: number,
    tagline: Phaser.GameObjects.Text,
  ) {
    const [btn, label] = this.makePlateButton(cx, height * 0.64, 'Begin', () => this.fadeToGame());
    this.tweens.add({ targets: [tagline, btn, label], duration: 900, alpha: 1, ease: 'Sine.easeIn', delay: 1100 });
  }

  // ── Save exists — Continue + New Game ────────────────────────────

  private buildContinueButtons(
    cx: number, height: number,
    tagline: Phaser.GameObjects.Text,
  ) {
    const [btn, label] = this.makePlateButton(cx, height * 0.64, 'Continue', () => this.fadeToGame());

    // New Game — text link below, clear of the Continue plate.
    const newGameLink = this.add
      .text(cx, height * 0.76, 'New Game', {
        fontSize: '14px',
        color: '#8a6438',
        fontFamily: TITLE_FONT,
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setInteractive({ useHandCursor: true });

    newGameLink.on('pointerover', () => { newGameLink.setColor('#e8d5b0'); Audio.playHover(); });
    newGameLink.on('pointerout',  () => newGameLink.setColor('#8a6438'));
    newGameLink.on('pointerdown', () => {
      Audio.playSfx('ui_select');
      Game.reset();
      this.fadeToGame();
    });

    this.tweens.add({
      targets: [tagline, btn, label],
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
