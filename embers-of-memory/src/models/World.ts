// Phase 10 — Rivals & World Simulation models.

import type { IdeologyVector } from './Ideology';

export interface Rival {
  id: string;
  name: string;
  flavor: string;
  // Disciplines they prefer to publish on (matches Topic.name)
  focusDisciplines: string[];
  // Their general ideological lean — used for poaching alignment & flavor.
  ideologyLean: IdeologyVector;
  // Base days between releases; randomized ±20%.
  releaseCadence: number;
  // Runtime state (also lives in WorldState.rivalState for save):
}

// Per-rival state that mutates during the run.
export interface RivalState {
  rivalId: string;
  prestige: number;
  worksReleased: number;
  lastReleaseDay: number;
  nextReleaseDay: number;
  // Scholars this rival has poached from the player (or hired elsewhere)
  poachedScholarIds: string[];
}

// One past release by a rival — used to compute topic saturation and to
// surface "rival works" history in the World panel.
export interface RivalRelease {
  rivalId: string;
  rivalName: string;
  topicName: string;
  formatName: string;
  releaseDay: number;
  quality: number;        // 0..1
}

// A periodic world event — runs for a duration during which its effects
// apply (topic demand mods, faction nudges already applied at start).
export interface WorldEvent {
  id: string;
  name: string;
  flavor: string;
  // Persistent demand modifiers active while this event is in flight.
  // Maps topic NAME -> multiplier (1.0 = baseline). Stacked multiplicatively.
  topicDemandMod?: Record<string, number>;
  // Faction nudges applied ONCE at event start.
  factionNudges?: Partial<Record<'church' | 'crown' | 'reformers', number>>;
  // How long the event's demand modifiers persist, in days.
  durationDays: number;
}

// In-flight world event with a start day so the WorldSystem can clean up
// when it expires.
export interface ActiveWorldEvent {
  eventId: string;
  startDay: number;
  endDay: number;
}

// Aggregate world state stored on GameState.
export interface WorldState {
  rivals: RivalState[];
  recentReleases: RivalRelease[];     // last 20 keep for saturation + UI
  activeWorldEvents: ActiveWorldEvent[];
  worldEventHistory: { eventId: string; eventName: string; startDay: number; endDay: number }[];
  lastWorldEventRollDay: number;
}

// Saturation: when a rival publishes on topic X, player works on X within
// SATURATION_WINDOW_DAYS earn the SATURATION_MULT discount.
export const SATURATION_WINDOW_DAYS = 60;
export const SATURATION_MULT = 0.75;
