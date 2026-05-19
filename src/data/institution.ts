// Institution zones and facilities — data-driven definitions.

export interface ZoneDef {
  id: string;
  name: string;
  thematicLine: string;          // short tagline shown in the panel
  unlockCost: number;            // gold to unlock the zone (founding_hall is free)
  unlockTier: 1 | 2 | 3;         // minimum institution tier
  prerequisitePrestige?: number; // optional extra gate
  prerequisiteDiscipline?: string; // optional: requires at least one scholar with this primary discipline
}

// Facility effects are applied in ProjectSystem.
// Each kind has a single numeric magnitude and is interpreted there.
export type FacilityEffect =
  | { kind: 'project_speed';    magnitude: number }            // % faster progress per day
  | { kind: 'quality_bonus';    magnitude: number }            // flat addend on quality 0..1
  | { kind: 'topic_quality';    magnitude: number; topic: string } // discipline-scoped quality bonus
  | { kind: 'morale_recovery';  magnitude: number }            // bonus exhaustion drain when idle
  | { kind: 'revenue_bonus';    magnitude: number }            // % multiplier on completed work revenue
  | { kind: 'unlock_format';    format: string };

export interface FacilityDef {
  id: string;
  name: string;
  zoneId: string;
  buildCost: number;     // gold to build tier 1
  upgradeCost: number;   // gold per upgrade (tier 1→2, 2→3)
  maxTier: number;       // 1..3
  // Effect magnitude scales linearly with built tier (1x at tier 1, 2x at 2, 3x at 3).
  effect: FacilityEffect;
  blurb: string;
}

export const ZONES: ZoneDef[] = [
  {
    id: 'founding_hall',
    name: 'The Founding Hall',
    thematicLine: 'The core of the institution. Where it all begins.',
    unlockCost: 0,
    unlockTier: 1,
  },
  {
    id: 'scriptorium_wing',
    name: 'The Scriptorium Wing',
    thematicLine: 'Writing and production. Ink, paper, and patience.',
    unlockCost: 120,
    unlockTier: 1,
  },
  {
    id: 'library',
    name: 'The Library',
    thematicLine: 'Knowledge gathered. Knowledge preserved.',
    unlockCost: 160,
    unlockTier: 1,
  },
  {
    id: 'teaching_courtyard',
    name: 'The Teaching Courtyard',
    thematicLine: 'The next generation finds its footing here.',
    unlockCost: 200,
    unlockTier: 2,
    prerequisitePrestige: 30,
  },
  {
    id: 'observatory',
    name: 'The Observatory',
    thematicLine: 'Eyes turned upward. Patterns in the sky.',
    unlockCost: 240,
    unlockTier: 2,
    prerequisiteDiscipline: 'Astronomy',
  },
  {
    id: 'garden_of_reflection',
    name: 'The Garden of Reflection',
    thematicLine: 'Where thought slows and deepens.',
    unlockCost: 240,
    unlockTier: 2,
  },
  {
    id: 'archive_vault',
    name: 'The Archive Vault',
    thematicLine: 'What must never be lost.',
    unlockCost: 300,
    unlockTier: 2,
    prerequisitePrestige: 80,
  },
  {
    id: 'music_hall',
    name: 'The Music Hall',
    thematicLine: 'Devotion in measured tones.',
    unlockCost: 300,
    unlockTier: 2,
    prerequisiteDiscipline: 'Music',
  },
];

export const FACILITIES: FacilityDef[] = [
  // The Founding Hall — modest baseline facilities, always available.
  {
    id: 'founders_study', name: "Founder's Study",
    zoneId: 'founding_hall',
    buildCost: 80, upgradeCost: 120, maxTier: 2,
    effect: { kind: 'morale_recovery', magnitude: 0.01 },
    blurb: 'Idle scholars rest a little more deeply here.',
  },

  // Scriptorium Wing
  {
    id: 'advanced_scriptorium', name: 'Advanced Scriptorium',
    zoneId: 'scriptorium_wing',
    buildCost: 100, upgradeCost: 160, maxTier: 3,
    effect: { kind: 'project_speed', magnitude: 0.08 },
    blurb: 'Sharpened nibs, sturdy desks. Work moves a little faster.',
  },
  {
    id: 'illumination_workshop', name: 'Illumination Workshop',
    zoneId: 'scriptorium_wing',
    buildCost: 140, upgradeCost: 180, maxTier: 2,
    effect: { kind: 'revenue_bonus', magnitude: 0.12 },
    blurb: 'Gold leaf and patient detail. Completed works fetch more.',
  },

  // Library
  {
    id: 'reading_room', name: 'Reading Room',
    zoneId: 'library',
    buildCost: 90, upgradeCost: 140, maxTier: 3,
    effect: { kind: 'quality_bonus', magnitude: 0.03 },
    blurb: 'Long evenings with the right book at hand.',
  },
  {
    id: 'rare_manuscript_vault', name: 'Rare Manuscript Vault',
    zoneId: 'library',
    buildCost: 200, upgradeCost: 220, maxTier: 2,
    effect: { kind: 'topic_quality', magnitude: 0.06, topic: 'History' },
    blurb: 'Sealed shelves of borrowed centuries. History reads deeper.',
  },

  // Teaching Courtyard
  {
    id: 'lecture_hall', name: 'Lecture Hall',
    zoneId: 'teaching_courtyard',
    buildCost: 180, upgradeCost: 200, maxTier: 2,
    effect: { kind: 'topic_quality', magnitude: 0.05, topic: 'Education' },
    blurb: 'Tiered benches, a sounding floor. Education thrives.',
  },

  // Observatory
  {
    id: 'observation_deck', name: 'Observation Deck',
    zoneId: 'observatory',
    buildCost: 200, upgradeCost: 240, maxTier: 2,
    effect: { kind: 'topic_quality', magnitude: 0.08, topic: 'Astronomy' },
    blurb: 'Open to the night sky. Astronomy goes further.',
  },

  // Garden of Reflection
  {
    id: 'meditation_pavilion', name: 'Meditation Pavilion',
    zoneId: 'garden_of_reflection',
    buildCost: 160, upgradeCost: 200, maxTier: 2,
    effect: { kind: 'morale_recovery', magnitude: 0.015 },
    blurb: 'Quiet water and arranged stones. Wellbeing recovers more.',
  },

  // Archive Vault
  {
    id: 'translation_hall', name: 'Translation Hall',
    zoneId: 'archive_vault',
    buildCost: 220, upgradeCost: 220, maxTier: 2,
    effect: { kind: 'topic_quality', magnitude: 0.06, topic: 'Literature' },
    blurb: 'Languages bend toward each other under careful hands.',
  },

  // Music Hall
  {
    id: 'performance_stage', name: 'Performance Stage',
    zoneId: 'music_hall',
    buildCost: 200, upgradeCost: 220, maxTier: 2,
    effect: { kind: 'topic_quality', magnitude: 0.07, topic: 'Music' },
    blurb: 'A room that sings back. Music thrives.',
  },
];

export function zoneById(id: string): ZoneDef | undefined {
  return ZONES.find(z => z.id === id);
}

export function facilityById(id: string): FacilityDef | undefined {
  return FACILITIES.find(f => f.id === id);
}

export function facilitiesInZone(zoneId: string): FacilityDef[] {
  return FACILITIES.filter(f => f.zoneId === zoneId);
}
