// Procedural scholar generation.

import { TOPICS } from '../data/topics';
import { AMBITION_IDS, FEAR_IDS } from '../data/scholars/milestones';
import { randInt, chance, pick, pickN } from './Random';
import type {
  Scholar, Beliefs, Epistemology, Spirituality, Politics, KnowledgeAccess,
} from '../models/Scholar';

const EPISTEMOLOGIES: Epistemology[]   = ['empirical', 'revealed', 'traditional'];
const SPIRITUALITIES: Spirituality[]   = ['devout', 'agnostic', 'syncretic', 'skeptical', 'mystical'];
const POLITICS: Politics[]             = ['loyal', 'reformist', 'subversive', 'indifferent'];
const KNOWLEDGE_ACCESS: KnowledgeAccess[] = ['everyone', 'scholars_only', 'faithful', 'rulers'];

function generateBeliefs(): Beliefs {
  return {
    epistemology:    pick(EPISTEMOLOGIES),
    spirituality:    pick(SPIRITUALITIES),
    politics:        pick(POLITICS),
    knowledgeAccess: pick(KNOWLEDGE_ACCESS),
  };
}

const GIVEN_NAMES = [
  'Anya', 'Bren', 'Cassel', 'Dara', 'Eira', 'Fenn', 'Galen', 'Hesper',
  'Ira', 'Joren', 'Kael', 'Liora', 'Maren', 'Niven', 'Orin', 'Pell',
  'Quill', 'Ravel', 'Saren', 'Tilda', 'Ulric', 'Vesna', 'Wynn', 'Yara',
];

const REGION_PHRASES = [
  'of the Salt Coast',     'of the High Roads',
  'of the River Schools',  'of the Lowland Schools',
  'of the Northern Reach', 'of the Sun Towers',
  'of the Amber Hills',    'of the Cinder Plains',
  'of the Quiet Wood',     'of the Old Quarter',
];

const ARCHETYPES = [
  'Wandering Mystic',         'Exiled Philosopher',
  'Noble Prodigy',            'Obsessive Inventor',
  'Revolutionary Poet',       'Spiritual Composer',
  'Quiet Genius',             'Pragmatic Chronicler',
  'Bitter Exile',             'Ambitious Young Scholar',
  'Master Craftsperson',      'Skeptical Empiricist',
  'Devoted Traditionalist',
];

const CREATIVITY_STYLES = [
  'Perfectionist', 'Experimental', 'Traditional', 'Collaborative',
  'Obsessive',     'Spiritual',    'Controversial', 'Methodical',
];

const POSITIVE_TRAITS = [
  'Generous', 'Charismatic', 'Curious', 'Dedicated', 'Humble',
  'Resilient', 'Inspiring', 'Perceptive', 'Patient', 'Loyal',
];
const CHALLENGING_TRAITS = [
  'Jealous', 'Volatile', 'Reclusive', 'Arrogant', 'Dogmatic',
  'Melancholic', 'Secretive', 'Stubborn', 'Restless', 'Paranoid',
];
const DUAL_TRAITS = [
  'Ambitious', 'Devout', 'Skeptical', 'Idealistic', 'Obsessive',
];
const ALL_TRAITS = [...POSITIVE_TRAITS, ...CHALLENGING_TRAITS, ...DUAL_TRAITS];

let counter = 0;

export function generateScholar(): Scholar {
  counter += 1;
  const given  = pick(GIVEN_NAMES);
  const region = pick(REGION_PHRASES);
  const id     = `gen_${Date.now()}_${counter}`;

  // Age weighted toward mid-career.
  const age = pickAge();

  const archetype       = pick(ARCHETYPES);
  const creativityStyle = pick(CREATIVITY_STYLES);

  // Disciplines — pull from TOPICS names.
  const disciplineNames = TOPICS.map(t => t.name);
  const primary   = pick(disciplineNames);
  const secondary = chance(0.7)
    ? pick(disciplineNames.filter(d => d !== primary))
    : undefined;

  // Skill scales loosely with age.
  const primarySkill = clamp(age < 35 ? randInt(4, 7) : age < 55 ? randInt(6, 9) : randInt(6, 10), 1, 10);
  const disciplines: Record<string, number> = { [primary]: primarySkill };
  if (secondary) disciplines[secondary] = clamp(primarySkill - randInt(1, 3), 1, 10);

  const visibleTraits = pickN(ALL_TRAITS, randInt(2, 3));
  const hiddenTraits  = pickN(ALL_TRAITS.filter(t => !visibleTraits.includes(t)), randInt(1, 3));

  const hiddenTalent = chance(0.30) ? {
    discipline: pick(disciplineNames.filter(d => d !== primary && d !== secondary)),
    revealed: false,
  } : undefined;

  const legendaryPotential = chance(0.10) ? true : undefined;

  // Salary scales with skill and age.
  const salary = 8 + Math.floor(primarySkill * 1.2) + Math.floor((age - 25) / 8);

  return {
    id,
    name: `${given} ${region}`,
    age,
    archetype,
    primaryDiscipline: primary,
    secondaryDiscipline: secondary,
    disciplines,
    disciplineXp: {},
    creativityStyle,
    visibleTraits,
    hiddenTraits,
    hiddenTalent,
    fear:     pick(FEAR_IDS),
    ambition: pick(AMBITION_IDS),
    legendaryPotential,
    beliefs:  generateBeliefs(),
    restlessness: 0,
    restlessFlagged: false,
    salary,
    morale: 0.75 + Math.random() * 0.15,
    stress: 0,
    exhaustion: 0,
    isAvailable: true,
    projectHistory: [],
  };
}

function pickAge(): number {
  // 50/40/10 split for young / mid-career / senior.
  const r = Math.random();
  if (r < 0.50) return randInt(22, 35);
  if (r < 0.90) return randInt(36, 55);
  return randInt(56, 68);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
