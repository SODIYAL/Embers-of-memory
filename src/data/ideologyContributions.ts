// Per-topic, per-format, and per-priority axis nudges for the ideological
// imprint of a finished work. Values are SMALL; a typical work shifts the
// institution by ~2-8 points on one or two axes.

import type { IdeologyVector } from '../models/Ideology';

// Topics carry an obvious ideological gravity. Astronomy and Medicine are
// secular by nature; Theology is the strongest pious pull.
// Keys are TOPIC ids (snake_case), not names.
export const TOPIC_IMPRINT: Record<string, IdeologyVector> = {
  astronomy:       { piety: -3, tradition: -1 },
  philosophy:      { tradition: -1 },           // tends progressive but mild
  medicine:        { piety: -2, populism: +1 }, // helps the public
  theology:        { piety: +5, tradition: +2 },
  music:           { populism: +2 },            // music reaches everyone
  cartography:     { piety: -1, populism: -1 }, // tool of trade and rule
  // New playable topics (matching the expanded TOPICS list)
  history:         { tradition: +2 },           // honors what came before
  literature:      { populism: +1 },            // stories reach widely
  mathematics:     { piety: -2, tradition: -1 },// formal, secular, progressive
  natural_history: { piety: -2 },               // empirical observation
  engineering:     { tradition: -1, populism: -1 }, // tool of order and trade
  architecture:    { tradition: +1, populism: -1 }, // serves power & permanence
};

// Format speaks to audience: hymns reach the faithful; treatises the elite.
export const FORMAT_IMPRINT: Record<string, IdeologyVector> = {
  atlas:                  { populism: -1 },
  hymn:                   { piety: +3, populism: +2 },
  educational_handbook:   { populism: +3, tradition: -1 },
  philosophical_treatise: { populism: -3, tradition: -1 },
  scientific_compendium:  { populism: -2, piety: -2, tradition: -2 },
  epic_poetry:            { tradition: +2 },
  sacred_text:            { piety: +6, tradition: +3 },
  musical_composition:    { populism: +1 },
  field_survey:           { piety: -1, tradition: -1 },
};

// Priority points spent on each axis nudge alignment subtly. Each point
// adds the listed scalar (capped at 5 points by ProjectPanel rules).
export const PRIORITY_IMPRINT: Record<string, IdeologyVector> = {
  Accuracy:      { tradition: -1 },             // valuing accuracy = empirical
  Beauty:        { tradition: +1 },             // aesthetics lean classical
  Accessibility: { populism: +2 },
  Innovation:    { tradition: -2 },
  Spirituality:  { piety: +2 },
  Preservation:  { tradition: +2 },
  Propaganda:    { populism: -1, tradition: +1 },// serves the established order
};

// A scholar's structured Beliefs map to small nudges applied when that
// scholar leads a stage of the work. Each axis contributes once per stage
// they lead.
import type { Beliefs } from '../models/Scholar';

export function beliefImprint(beliefs: Beliefs | undefined): IdeologyVector {
  if (!beliefs) return {};
  const v: IdeologyVector = {};

  // Spirituality
  switch (beliefs.spirituality) {
    case 'devout':     v.piety = (v.piety ?? 0) + 2; break;
    case 'mystical':   v.piety = (v.piety ?? 0) + 1; break;
    case 'syncretic':  /* neutral */ break;
    case 'agnostic':   v.piety = (v.piety ?? 0) - 1; break;
    case 'skeptical':  v.piety = (v.piety ?? 0) - 2; break;
  }

  // Epistemology
  switch (beliefs.epistemology) {
    case 'revealed':    v.tradition = (v.tradition ?? 0) + 1; v.piety = (v.piety ?? 0) + 1; break;
    case 'traditional': v.tradition = (v.tradition ?? 0) + 2; break;
    case 'empirical':   v.tradition = (v.tradition ?? 0) - 2; break;
  }

  // Politics
  switch (beliefs.politics) {
    case 'loyal':       v.tradition = (v.tradition ?? 0) + 1; v.populism = (v.populism ?? 0) - 1; break;
    case 'reformist':   v.tradition = (v.tradition ?? 0) - 1; v.populism = (v.populism ?? 0) + 1; break;
    case 'subversive':  v.tradition = (v.tradition ?? 0) - 2; v.populism = (v.populism ?? 0) + 1; break;
    case 'indifferent': /* neutral */ break;
  }

  // KnowledgeAccess
  switch (beliefs.knowledgeAccess) {
    case 'everyone':       v.populism = (v.populism ?? 0) + 2; break;
    case 'scholars_only':  v.populism = (v.populism ?? 0) - 2; break;
    case 'faithful':       v.piety    = (v.piety    ?? 0) + 1; v.populism = (v.populism ?? 0) - 1; break;
    case 'rulers':         v.populism = (v.populism ?? 0) - 2; v.tradition = (v.tradition ?? 0) + 1; break;
  }

  return v;
}

// Combine multiple imprint vectors into one. Used to build a work's imprint
// from topic + format + priorities + lead beliefs.
export function combineImprints(...vectors: IdeologyVector[]): IdeologyVector {
  const out: IdeologyVector = {};
  for (const v of vectors) {
    for (const k of Object.keys(v) as Array<keyof IdeologyVector>) {
      out[k] = (out[k] ?? 0) + (v[k] ?? 0);
    }
  }
  return out;
}
