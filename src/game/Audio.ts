// Central audio service. A thin, framework-free wrapper over HTMLAudioElement:
// a one-liner to play SFX, a music layer with manual cross-fade, and
// persistent mute/volume state. Everything degrades silently if an asset is
// missing, so the game runs fine before (or without) audio files on disk.

export type SfxKey =
  | 'ui_click' | 'ui_hover' | 'ui_select' | 'ui_back'
  | 'modal_open' | 'modal_close'
  | 'project_start' | 'project_complete'
  | 'coin_gain' | 'page_turn' | 'quill_scratch' | 'error';

const SETTINGS_KEY = 'embers_audio_v1';

const SFX_URL = (key: SfxKey) => `assets/audio/sfx/${key}.wav`;
// Named music tracks → file URLs.
const MUSIC_URLS: Record<string, string> = {
  music_campus: 'assets/audio/music/campus_ambient.mp3',
};

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
  private settings: AudioSettings = { ...DEFAULT_SETTINGS };
  // One reusable base element per SFX key, cloned on play so overlapping
  // sounds don't cut each other off.
  private sfxBuffers: Partial<Record<SfxKey, HTMLAudioElement>> = {};
  private currentMusic?: HTMLAudioElement;
  private currentMusicKey?: string;
  private musicFadeTimer?: ReturnType<typeof setInterval>;
  private lastHoverAt = 0;
  private lastPlayAt: Partial<Record<SfxKey, number>> = {};
  private readonly throttleMs: Partial<Record<SfxKey, number>> = {
    ui_hover: 80,
    coin_gain: 240,
    quill_scratch: 600,
    page_turn: 400,
  };

  // Kept for API compatibility with the old Phaser version; safe to call
  // (warms the SFX cache) or skip entirely.
  init() {
    this.loadSettings();
    for (const key of Object.keys(this.throttleMs) as SfxKey[]) this.warm(key);
  }

  private warm(key: SfxKey) {
    if (this.sfxBuffers[key]) return;
    try {
      const el = new window.Audio(SFX_URL(key));
      el.preload = 'auto';
      this.sfxBuffers[key] = el;
    } catch { /* ignore */ }
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
    if (this.currentMusic) this.currentMusic.volume = muted ? 0 : this.settings.musicVolume;
  }

  toggleMute(): boolean {
    this.setMuted(!this.settings.muted);
    return this.settings.muted;
  }

  // ── SFX ────────────────────────────────────────────────────────────

  playSfx(key: SfxKey, opts: { volume?: number; rate?: number } = {}) {
    if (this.settings.muted) return;
    const throttle = this.throttleMs[key];
    if (throttle) {
      const now = performance.now();
      const last = this.lastPlayAt[key] ?? 0;
      if (now - last < throttle) return;
      this.lastPlayAt[key] = now;
    }
    try {
      this.warm(key);
      // Clone so rapid repeats can overlap; falls back to a fresh element.
      const base = this.sfxBuffers[key];
      const el = (base?.cloneNode(true) as HTMLAudioElement) ?? new window.Audio(SFX_URL(key));
      el.volume = Math.max(0, Math.min(1, (opts.volume ?? 1) * this.settings.sfxVolume));
      if (opts.rate) el.playbackRate = opts.rate;
      void el.play().catch(() => { /* asset missing / not yet allowed — fine */ });
    } catch { /* ignore */ }
  }

  // Hover has its own throttle window since pointermove fires rapidly.
  playHover() {
    const now = performance.now();
    if (now - this.lastHoverAt < 80) return;
    this.lastHoverAt = now;
    this.playSfx('ui_hover', { volume: 0.4 });
  }

  // ── Music (background loop) ───────────────────────────────────────

  // Cross-fade to a new music key. If key is undefined, fades out. No-ops if
  // the track is already playing or the URL is unknown.
  playMusic(key: string | undefined, opts: { fadeMs?: number } = {}) {
    const fadeMs = opts.fadeMs ?? 1200;
    if (this.currentMusicKey === key) return;

    this.stopMusic(fadeMs);
    if (!key) return;

    const url = MUSIC_URLS[key];
    if (!url) return;

    try {
      const music = new window.Audio(url);
      music.loop = true;
      music.volume = 0;
      this.currentMusic = music;
      this.currentMusicKey = key;
      void music.play().catch(() => { /* autoplay blocked — will retry on next gesture */ });
      const target = this.settings.muted ? 0 : this.settings.musicVolume;
      this.fade(music, fadeMs, target);
    } catch { /* ignore */ }
  }

  stopMusic(fadeMs: number = 800) {
    const old = this.currentMusic;
    this.currentMusic = undefined;
    this.currentMusicKey = undefined;
    if (!old) return;
    this.fade(old, fadeMs, 0, () => { try { old.pause(); } catch { /* ignore */ } });
  }

  private fade(el: HTMLAudioElement, durationMs: number, target: number, onDone?: () => void) {
    if (this.musicFadeTimer && el === this.currentMusic) {
      clearInterval(this.musicFadeTimer);
      this.musicFadeTimer = undefined;
    }
    const start = el.volume;
    const steps = Math.max(1, Math.round(durationMs / 30));
    let step = 0;
    const timer = setInterval(() => {
      step++;
      const t = step / steps;
      try { el.volume = Math.max(0, Math.min(1, start + (target - start) * t)); } catch { /* ignore */ }
      if (step >= steps) {
        clearInterval(timer);
        if (this.musicFadeTimer === timer) this.musicFadeTimer = undefined;
        onDone?.();
      }
    }, 30);
    if (el === this.currentMusic) this.musicFadeTimer = timer;
  }
}

// Singleton — the game has one audio service.
export const Audio = new AudioService();
