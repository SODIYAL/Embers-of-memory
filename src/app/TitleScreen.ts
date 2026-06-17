// The title screen — a DOM replacement for the old Phaser MenuScene.
// Shows Begin (fresh) or Continue + New Game (save present), surfaces any
// save-reset notice, and hands control back to the App via callbacks.

import { Game } from '../game/GameManager';
import { consumeSaveResetReason } from '../game/SaveManager';
import { Audio } from '../game/Audio';

const VERSION = 'v0.0.1';

export class TitleScreen {
  private el: HTMLElement | null = null;
  private readonly root: HTMLElement;
  private readonly opts: { onPlay: () => void; onNewGame: () => void };

  constructor(root: HTMLElement, opts: { onPlay: () => void; onNewGame: () => void }) {
    this.root = root;
    this.opts = opts;
  }

  mount() {
    Audio.init();
    Audio.playMusic('music_campus', { fadeMs: 2500 });

    const hasSave = Game.save.hasSave();
    const reason = consumeSaveResetReason();

    this.el = document.createElement('div');
    this.el.className = 'ms-title-screen';
    this.el.innerHTML = `
      <div class="ms-title-mark">❦</div>
      <h1 class="ms-title">Embers of Memory</h1>
      <p class="ms-title-tag">A monastery of knowledge. A civilization of thought.</p>
      <button class="ms-btn primary" id="ms-play">${hasSave ? 'Continue' : 'Begin'}</button>
      ${hasSave ? '<button class="ms-title-link" id="ms-new">New Chronicle</button>' : ''}
      ${reason ? `<div class="ms-title-notice">${this.noticeText(reason)}</div>` : ''}
      <div class="ms-version">${VERSION}</div>
    `;
    this.root.appendChild(this.el);

    const play = this.el.querySelector<HTMLButtonElement>('#ms-play')!;
    play.addEventListener('mouseenter', () => Audio.playHover());
    play.addEventListener('click', () => { Audio.playSfx('ui_select'); this.opts.onPlay(); });

    const fresh = this.el.querySelector<HTMLButtonElement>('#ms-new');
    fresh?.addEventListener('mouseenter', () => Audio.playHover());
    fresh?.addEventListener('click', () => { Audio.playSfx('ui_select'); this.opts.onNewGame(); });
  }

  unmount() {
    this.el?.remove();
    this.el = null;
  }

  private noticeText(reason: 'mismatch' | 'corrupt'): string {
    return reason === 'mismatch'
      ? 'A previous chronicle was kept in an older hand and could not be carried over. A fresh institution awaits.'
      : 'A previous chronicle was unreadable. A fresh institution awaits.';
  }
}
