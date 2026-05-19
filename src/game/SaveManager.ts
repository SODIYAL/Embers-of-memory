import type { GameState } from '../models/GameState';

const SAVE_KEY = 'embers_save_v1';
export const CURRENT_SAVE_VERSION = 13;

// One-shot flag set when load() discards a stale or corrupt save. MenuScene
// reads + clears it on its first paint so the player sees a small notice.
let saveResetReason: 'mismatch' | 'corrupt' | null = null;

export function consumeSaveResetReason(): 'mismatch' | 'corrupt' | null {
  const r = saveResetReason;
  saveResetReason = null;
  return r;
}

export class SaveManager {
  save(state: GameState) {
    try {
      state.version = CURRENT_SAVE_VERSION;
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch { /* storage full or unavailable — silent fail */ }
  }

  load(): GameState | null {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;

    let parsed: unknown;
    try { parsed = JSON.parse(raw); }
    catch {
      console.warn('[SaveManager] Save data is corrupted; starting fresh.');
      saveResetReason = 'corrupt';
      this.clear();
      return null;
    }

    if (!this.isCurrentVersion(parsed)) {
      console.warn(`[SaveManager] Save version mismatch (expected ${CURRENT_SAVE_VERSION}); starting fresh.`);
      saveResetReason = 'mismatch';
      this.clear();
      return null;
    }

    return parsed as GameState;
  }

  hasSave(): boolean {
    return this.load() !== null;
  }

  clear() {
    localStorage.removeItem(SAVE_KEY);
  }

  private isCurrentVersion(parsed: unknown): boolean {
    return typeof parsed === 'object'
        && parsed !== null
        && (parsed as { version?: unknown }).version === CURRENT_SAVE_VERSION;
  }
}
