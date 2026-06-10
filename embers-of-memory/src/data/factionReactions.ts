// Faction critic quotes for the Release Report. Each faction reads the
// work's imprint through its own lens; the quote pool branches on the
// computed alignment band (raving / approving / neutral / cool / hostile)
// and folds in a touch of the work's quality (landmark works get
// more emphatic praise; flops get sharper rebukes).

import type { Work } from '../models/Work';
import type { IdeologyVector, IdeologyAxis, FactionId } from '../models/Ideology';
import { FACTION_INFO } from '../models/Ideology';

export type ReactionBand = 'raving' | 'approving' | 'neutral' | 'cool' | 'hostile';

// 1–5 stars roughly. Maps reaction band + quality (0..1) to a star count
// shown as visual "nibs" in the report.
export function ratingNibs(band: ReactionBand, quality: number): number {
  const base = band === 'raving' ? 5
             : band === 'approving' ? 4
             : band === 'neutral' ? 3
             : band === 'cool' ? 2
             :                       1;
  // Quality nudges the rating by ±1 for landmark works / flops
  const q = quality >= 0.80 ? 0.5
          : quality >= 0.55 ? 0
          : quality >= 0.30 ? 0
          :                  -0.5;
  return Math.max(1, Math.min(5, Math.round(base + q)));
}

// Compute alignment of a work's imprint with a faction's preferences.
// Positive = aligned; negative = opposed.
export function workAlignment(imprint: IdeologyVector, factionId: FactionId): number {
  const prefs = FACTION_INFO[factionId].preferences;
  let alignment = 0;
  for (const k of Object.keys(prefs) as IdeologyAxis[]) {
    alignment += (prefs[k] ?? 0) * (imprint[k] ?? 0);
  }
  return alignment;
}

export function reactionBand(alignment: number): ReactionBand {
  if (alignment >=  8) return 'raving';
  if (alignment >=  3) return 'approving';
  if (alignment >= -2) return 'neutral';
  if (alignment >= -7) return 'cool';
  return 'hostile';
}

// Critic personas. One named voice per faction. Adds personality to the
// quotes without exploding the data set.
export const FACTION_CRITICS: Record<FactionId, { critic: string; outlet: string }> = {
  church:    { critic: 'Hierarch Onen',     outlet: 'The Choir Council' },
  crown:     { critic: 'Chancellor Velash', outlet: 'The King\'s Council' },
  reformers: { critic: 'The Pamphleteer',   outlet: 'The Reformers' },
};

// Quote pools keyed by faction + reaction band. We pick a random line from
// the matching pool to avoid identical reports on similar works.
const QUOTES: Record<FactionId, Record<ReactionBand, readonly string[]>> = {
  church: {
    raving: [
      'A devout offering. The faithful will treasure it.',
      'Reverence on every page. The old truths shine through.',
      'Sacred work. Let it be copied widely.',
    ],
    approving: [
      'A wholesome contribution, properly humble.',
      'It does not stray from the path.',
      'The institution remembers its duties.',
    ],
    neutral: [
      'Inoffensive. We note its existence.',
      'Neither sacred nor profane. It passes.',
      'A workmanlike effort.',
    ],
    cool: [
      'A worldly tilt — we are watching.',
      'Too much of the marketplace, too little of the altar.',
      'The faithful will find little to love here.',
    ],
    hostile: [
      'A scandal in print. The faithful are warned.',
      'This work spits in the face of tradition.',
      'A profane work. We urge it withdrawn.',
    ],
  },
  crown: {
    raving: [
      'A work fit to grace the royal library.',
      'Order, lineage, permanence — beautifully argued.',
      'The court will commend you for this.',
    ],
    approving: [
      'A respectable contribution to the realm\'s letters.',
      'Sound work that honors the established order.',
      'The court takes favorable notice.',
    ],
    neutral: [
      'A modest entry in the public record.',
      'It neither flatters nor offends.',
      'We have read it. We are not moved.',
    ],
    cool: [
      'Too eager for the common crowd.',
      'The court detects an unseemly populism.',
      'Such works dilute the dignity of letters.',
    ],
    hostile: [
      'A vulgar agitation in print.',
      'This invites unrest. The court is displeased.',
      'A work below your station.',
    ],
  },
  reformers: {
    raving: [
      'At last, a work that speaks to the people!',
      'The kind of book that lights torches.',
      'A blow against the dusty old order.',
    ],
    approving: [
      'Pushes in the right direction. More like this.',
      'Refreshing. We will quote it freely.',
      'A small step toward a freer letter.',
    ],
    neutral: [
      'Adequate. Could be braver.',
      'Reads as written for nobody in particular.',
      'A safe book in a time that demands risk.',
    ],
    cool: [
      'Wedded to the old certainties.',
      'Conservative in voice, conservative in reach.',
      'A book that the powerful will smile upon.',
    ],
    hostile: [
      'Boot-licking dressed up as scholarship.',
      'A work for the court, not the people.',
      'A tribute to the very chains we would break.',
    ],
  },
};

export interface FactionReaction {
  factionId: FactionId;
  factionName: string;
  critic: string;
  outlet: string;
  band: ReactionBand;
  rating: number;       // 1..5
  alignment: number;    // raw signed alignment
  quote: string;
}

// Deterministic-ish: seed pick from the work id so re-renders show the
// same quote. The seed is a simple hash of (workId + factionId).
function pickQuote(pool: readonly string[], workId: string, factionId: FactionId): string {
  let h = 0;
  const s = `${workId}::${factionId}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return pool[Math.abs(h) % pool.length];
}

// Compute reactions for all factions for the given work.
export function computeFactionReactions(work: Work): FactionReaction[] {
  const imprint = work.ideologyImprint ?? {};
  const factionIds: FactionId[] = ['church', 'crown', 'reformers'];
  return factionIds.map(factionId => {
    const alignment = workAlignment(imprint, factionId);
    const band = reactionBand(alignment);
    const rating = ratingNibs(band, work.breakdown?.total ?? 0.5);
    const persona = FACTION_CRITICS[factionId];
    const quote = pickQuote(QUOTES[factionId][band], work.id, factionId);
    return {
      factionId,
      factionName: FACTION_INFO[factionId].name,
      critic: persona.critic,
      outlet: persona.outlet,
      band,
      rating,
      alignment,
      quote,
    };
  });
}
