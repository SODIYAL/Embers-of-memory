// Patron archetypes — major (recurring stipend) and minor (one-shot commission).

import type { PatronType } from '../models/Economy';
import type { IdeologyVector } from '../models/Ideology';

export interface MajorPatronArchetype {
  type: PatronType;
  name: string;          // flavor name
  stipend: number;       // monthly gold
  prestigeRequired: number;
  expectsDiscipline?: string;  // soft hint for the player (effects gated to Phase 9)
  arrivalFlavor: string;
  // Ideological preferences — used in Phase 9 to speed up patience decay
  // when the institution drifts away from them.
  alignment?: IdeologyVector;
}

export const MAJOR_PATRON_ARCHETYPES: MajorPatronArchetype[] = [
  {
    type: 'ruling_family',
    name: 'House Vellan',
    stipend: 60,
    prestigeRequired: 80,
    arrivalFlavor: 'House Vellan has noted your institution\'s rise. They offer steady support, in exchange for political loyalty.',
    alignment: { tradition: +1, populism: -1 },
  },
  {
    type: 'religious_order',
    name: 'The Temple of the Settled Flame',
    stipend: 45,
    prestigeRequired: 70,
    expectsDiscipline: 'Theology',
    arrivalFlavor: 'The Temple of the Settled Flame requests an audience. They would see your scholars produce works in keeping with the Flame\'s teachings.',
    alignment: { piety: +1, tradition: +1 },
  },
  {
    type: 'merchant_guild',
    name: 'The Guild of Salt and Compass',
    stipend: 40,
    prestigeRequired: 60,
    expectsDiscipline: 'Cartography',
    arrivalFlavor: 'The Guild of Salt and Compass extends a hand. Practical works that serve trade are what they value.',
    alignment: { tradition: -1, populism: +1 },
  },
  {
    type: 'foreign_court',
    name: 'The Court at Ilenya',
    stipend: 35,
    prestigeRequired: 90,
    arrivalFlavor: 'A messenger from the distant Court at Ilenya carries an unusual proposal — patronage from across the sea.',
    alignment: { populism: -1, tradition: +1 },
  },
  {
    type: 'scholarly_benefactor',
    name: 'Adept Korin of the Westmarch',
    stipend: 25,
    prestigeRequired: 50,
    arrivalFlavor: 'Adept Korin, an admirer of fine work, wishes to fund your institution with no strings beyond the quality of your output.',
    alignment: {}, // ideologically tolerant — Korin only cares about quality
  },
];

// Minor commission flavor — these are one-shot offers.
export const MINOR_PATRON_NAMES = [
  'Merchant Halvan',  'The family of Lord Esten',  'Captain Brae of the inland route',
  'Steward Maren',    'The Council of the Bell Quarter',  'Lady Iola the Younger',
  'A reclusive collector',  'The Brewers\' Hall',  'A widow of means',
];

export const MINOR_COMMISSION_FLAVOR = [
  'desires a work commemorating a recent event',
  'commissions a piece for their personal collection',
  'requests something fitting for a forthcoming celebration',
  'wishes to gift a manuscript to a distant relation',
  'requires a study for practical purposes',
];
