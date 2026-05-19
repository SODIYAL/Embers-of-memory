// Chemistry between two scholars — band thresholds, lookups, and updates.

import { Game } from './GameManager';
import { Events, GameEvents } from './EventBus';

// Tracks the band ordering so we can tell "up" vs "down" transitions for
// the band-changed event (positive transitions show as warmer toasts).
const BAND_ORDER: ChemistryBand[] = [
  'deep_conflict', 'tension', 'friction', 'neutral',
  'rapport', 'deep_collaboration', 'legendary_partnership',
];

export type ChemistryBand =
  | 'deep_conflict'
  | 'tension'
  | 'friction'
  | 'neutral'
  | 'rapport'
  | 'deep_collaboration'
  | 'legendary_partnership';

// score in [-100, 100]
const BAND_THRESHOLDS: Array<[number, ChemistryBand]> = [
  [ 80, 'legendary_partnership'],
  [ 50, 'deep_collaboration'],
  [ 20, 'rapport'],
  [-20, 'neutral'],
  [-50, 'friction'],
  [-80, 'tension'],
  [-Infinity, 'deep_conflict'],
];

export const BAND_LABELS: Record<ChemistryBand, string> = {
  legendary_partnership: 'Legendary partnership',
  deep_collaboration:    'Deep collaboration',
  rapport:               'Rapport',
  neutral:               'Neutral',
  friction:              'Friction',
  tension:               'Tension',
  deep_conflict:         'Deep conflict',
};

// Quality bonus contributed by each band, per pair on the team.
export const BAND_QUALITY_DELTA: Record<ChemistryBand, number> = {
  legendary_partnership:  0.15,
  deep_collaboration:     0.08,
  rapport:                0.03,
  neutral:                0,
  friction:              -0.03,
  tension:               -0.06,
  deep_conflict:         -0.12,
};

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function getScore(a: string, b: string): number {
  return Game.state.chemistry[pairKey(a, b)] ?? 0;
}

export function getShared(a: string, b: string): number {
  return Game.state.chemistryShared[pairKey(a, b)] ?? 0;
}

export function getBand(score: number): ChemistryBand {
  for (const [threshold, band] of BAND_THRESHOLDS) {
    if (score >= threshold) return band;
  }
  return 'neutral';
}

export function hasHistory(a: string, b: string): boolean {
  return getShared(a, b) > 0;
}

// Adjust score by delta and clamp. Emits CHEMISTRY_BAND_CHANGED when the
// band classification crosses a threshold so the UI can surface the moment.
export function adjustScore(a: string, b: string, delta: number) {
  const key = pairKey(a, b);
  const prev = Game.state.chemistry[key] ?? 0;
  const next = Math.max(-100, Math.min(100, prev + delta));
  Game.state.chemistry[key] = next;
  const prevBand = getBand(prev);
  const nextBand = getBand(next);
  if (prevBand !== nextBand) {
    const direction = BAND_ORDER.indexOf(nextBand) > BAND_ORDER.indexOf(prevBand) ? 'up' : 'down';
    Events.emit(GameEvents.CHEMISTRY_BAND_CHANGED, {
      scholarA: a, scholarB: b, prevBand, nextBand, direction,
    });
  }
}

export function incrementShared(a: string, b: string) {
  const key = pairKey(a, b);
  Game.state.chemistryShared[key] = (Game.state.chemistryShared[key] ?? 0) + 1;
}

// All unordered pairs from an array of ids.
export function pairs<T>(ids: T[]): Array<[T, T]> {
  const out: Array<[T, T]> = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      out.push([ids[i], ids[j]]);
    }
  }
  return out;
}
