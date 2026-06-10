// The three ideological axes the institution drifts along as it publishes.
// Each axis spans -100..+100. Zero is balanced; the magnitude is the
// institution's stance, the sign is the direction.
export type IdeologyAxis = 'piety' | 'tradition' | 'populism';

export const AXIS_INFO: Record<IdeologyAxis, {
  negativeLabel: string;
  positiveLabel: string;
  shortLabel:    string;
}> = {
  piety:     { negativeLabel: 'Secular',     positiveLabel: 'Pious',       shortLabel: 'Piety' },
  tradition: { negativeLabel: 'Progressive', positiveLabel: 'Traditional', shortLabel: 'Tradition' },
  populism:  { negativeLabel: 'Elite',       positiveLabel: 'Populist',    shortLabel: 'Populism' },
};

// A vector of axis -> nudge. Used for both per-work imprints and
// faction/patron preferences.
export type IdeologyVector = Partial<Record<IdeologyAxis, number>>;

// The institution's running stance, plus per-axis recent drift for UI.
export interface IdeologyState {
  axes: Record<IdeologyAxis, number>;
  // Last work's imprint — surfaced in the release report and Ideology panel.
  lastImprint?: IdeologyVector;
  // Faction standings, -100..+100. Drift each release based on alignment.
  factions: Record<FactionId, number>;
  // Threshold flags so we don't re-fire the same event twice.
  factionFlags: Record<FactionId, FactionFlag>;
}

export type FactionId = 'church' | 'crown' | 'reformers';

export const FACTION_INFO: Record<FactionId, {
  name: string;
  flavor: string;
  // What this faction approves of — used to compute reaction to each release.
  preferences: IdeologyVector;
}> = {
  church: {
    name: 'The Church',
    flavor: 'The keepers of the old faith. They watch what is written.',
    preferences: { piety: +1, tradition: +1 },
  },
  crown: {
    name: 'The Crown',
    flavor: 'The court takes interest in works that flatter order and lineage.',
    preferences: { populism: -1, tradition: +1 },
  },
  reformers: {
    name: 'The Reformers',
    flavor: 'A loose alliance of guildsmen, pamphleteers, and dissenting scholars.',
    preferences: { tradition: -1, populism: +1 },
  },
};

// Threshold-driven flags so each "favor offered" / "denounced" event fires
// at most once per crossing.
export interface FactionFlag {
  favorOffered: boolean;
  denounced:    boolean;
  // One-shot per game: once a faction has offered patronage, they won't
  // again unless standing collapses and recovers.
  patronageOffered: boolean;
}

export const FACTION_FAVOR_THRESHOLD = 50;
export const FACTION_DENOUNCE_THRESHOLD = -50;
// At allied (>=75) and after a friendly work, factions may offer patronage.
export const FACTION_PATRONAGE_THRESHOLD = 75;
// Per-work suppression: a friendly faction may suppress a work whose imprint
// pulls hard against their preferences. Triggered when the work's projected
// opposition (sum of |imprint · -preferences|) crosses this threshold AND
// the faction's standing is >= friendly.
export const SUPPRESSION_OPPOSITION_THRESHOLD = 8;
