// Central audio service. SFX are pre-loaded in BootScene; this wrapper
// gives the rest of the codebase a one-liner to play them, plus a music
// layer with cross-fade, and persistent mute/volume state.
//
// Phaser's sound manager is scene-scoped by default; we route through the
// game-level manager (this.sound.game.sound) so audio persists across
// scene transitions. The service is initialized from a scene's create().

import Phaser from 'phaser';

export type SfxKey =
  | 'ui_click' | 'ui_hover' | 'ui_select' | 'ui_back'
  | 'modal_open' | 'modal_close'
  | 'project_start' | 'project_complete'
  | 'coin_gain' | 'page_turn' | 'quill_scratch' | 'error';

const SETTINGS_KEY = 'embers_audio_v1';

interface AudioSettings {
  muted: boolean;
  sfxVolume: number;   // 0..1
  musicVolume: number; // 0..1
}

const DEFAULT_SETTINGS: AudioSettings = {
  muted: false,
  sfxVolume: 0.55,
  musicVolume: 0.30,
};

class AudioService {
  private manager?: Phaser.Sound.BaseSoundManager;
  private settings: AudioSettings = { ...DEFAULT_SETTINGS };
  private currentMusic?: Phaser.Sound.BaseSound;
  private currentMusicKey?: string;
  // Throttle hover SFX so rapid pointermoves don't machine-gun the speakers
  private lastHoverAt = 0;
  // Throttle a few high-frequency SFX so cascades (e.g. multiple skill-ups)
  // don't stack into noise.
  private lastPlayAt: Partial<Record<SfxKey, number>> = {};
  private readonly throttleMs: Partial<Record<SfxKey, number>> = {
    ui_hover: 80,
    coin_gain: 240,
    quill_scratch: 600,
    page_turn: 400,
  };

  init(scene: Phaser.Scene) {
    this.manager = scene.sound;
    this.loadSettings();
  }

  // ── Settings persistence ──────────────────────────────────────────

  private loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AudioSettings>;
        this.settings = { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch {
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

  private saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch { /* ignore quota / private mode */ }
  }

  isMuted(): boolean { return this.settings.muted; }

  setMuted(muted: boolean) {
    this.settings.muted = muted;
    this.saveSettings();
    if (this.currentMusic) {
      if ('setVolume' in this.currentMusic) {
        (this.currentMusic as Phaser.Sound.WebAudioSound).setVolume(
          muted ? 0 : this.settings.musicVolume,
        );
      }
    }
  }

  toggleMute(): boolean {
    this.setMuted(!this.settings.muted);
    return this.settings.muted;
  }

  // ── SFX ────────────────────────────────────────────────────────────

  playSfx(key: SfxKey, opts: { volume?: number; rate?: number; detune?: number } = {}) {
    if (!this.manager || this.settings.muted) return;
    // Throttle per-key
    const throttle = this.throttleMs[key];
    if (throttle) {
      const now = performance.now();
      const last = this.lastPlayAt[key] ?? 0;
      if (now - last < throttle) return;
      this.lastPlayAt[key] = now;
    }
    try {
      this.manager.play(key, {
        volume: (opts.volume ?? 1) * this.settings.sfxVolume,
        rate:   opts.rate ?? 1,
        detune: opts.detune ?? 0,
      });
    } catch {
      // Sound may not be decoded yet on first call — silent fail is fine
    }
  }

  // Special-cased: hover has its own throttle window since pointermove
  // can fire dozens of times per second across the UI.
  playHover() {
    const now = performance.now();
    if (now - this.lastHoverAt < 80) return;
    this.lastHoverAt = now;
    this.playSfx('ui_hover', { volume: 0.4 });
  }

  // ── Music (background loop) ───────────────────────────────────────

  // Cross-fade to a new music key. If key is undefined, fades out.
  // Music tracks must be pre-loaded by the scene that calls this. If the
  // key isn't loaded (no asset yet), we silently no-op so this can be
  // wired before audio assets exist.
  playMusic(key: string | undefined, opts: { fadeMs?: number } = {}) {
    if (!this.manager) return;
    const fadeMs = opts.fadeMs ?? 1200;

    if (this.currentMusicKey === key) return;

    // Fade out current
    if (this.currentMusic) {
      const oldMusic = this.currentMusic;
      const oldKey = this.currentMusicKey;
      // Phaser's WebAudioSound supports volume tween via scene tweens; we
      // use a manual interval to avoid coupling to a specific scene's tweens.
      this.fadeSound(oldMusic, fadeMs, 0, () => {
        oldMusic.stop();
        oldMusic.destroy();
        if (this.currentMusicKey === oldKey) {
          // We were the last one out and nothing started after us
        }
      });
      this.currentMusic = undefined;
      this.currentMusicKey = undefined;
    }

    if (!key) return;

    // Check whether the key is loaded before attempting to play
    if (!this.manager.game.cache.audio.has(key)) return;

    try {
      const music = this.manager.add(key, {
        loop: true,
        volume: 0,
      });
      music.play();
      this.currentMusic = music;
      this.currentMusicKey = key;
      const target = this.settings.muted ? 0 : this.settings.musicVolume;
      this.fadeSound(music, fadeMs, target);
    } catch {
      // ignore
    }
  }

  stopMusic(fadeMs: number = 800) {
    if (!this.currentMusic) return;
    const old = this.currentMusic;
    this.fadeSound(old, fadeMs, 0, () => {
      old.stop();
      old.destroy();
    });
    this.currentMusic = undefined;
    this.currentMusicKey = undefined;
  }

  private fadeSound(sound: Phaser.Sound.BaseSound, durationMs: number, target: number, onDone?: () => void) {
    if (!('setVolume' in sound)) { onDone?.(); return; }
    const ws = sound as Phaser.Sound.WebAudioSound;
    const start = ws.volume;
    const steps = Math.max(1, Math.round(durationMs / 30));
    let step = 0;
    const tick = () => {
      step++;
      const t = step / steps;
      try { ws.setVolume(start + (target - start) * t); } catch { /* destroyed */ }
      if (step >= steps) {
        onDone?.();
        return;
      }
      setTimeout(tick, 30);
    };
    tick();
  }
}

// Singleton — the game has one audio service. Imported across systems and
// scenes; initialized once from MenuScene.create().
export const Audio = new AudioService();
