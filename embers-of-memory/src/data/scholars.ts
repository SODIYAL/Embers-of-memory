import type { Scholar } from '../models/Scholar';

// All five hand-authored founders. The player begins with the first two;
// the remaining three appear over time via the recruitment system as
// named, high-quality candidates (see FOUNDER_CANDIDATES below).
const FOUNDERS: Scholar[] = [
  {
    id: 'yildiz', name: 'Yildiz of the High Roads', age: 34,
    archetype: 'Wandering Mystic',
    primaryDiscipline: 'Astronomy', secondaryDiscipline: 'Mathematics',
    disciplines: { Astronomy: 8, Mathematics: 5, Philosophy: 3 },
    disciplineXp: {},
    creativityStyle: 'Experimental',
    visibleTraits: ['Perceptive', 'Restless'],
    hiddenTraits: ['Devout', 'Generous'],
    hiddenTalent: { discipline: 'Mysticism', revealed: false },
    fear: 'discipline_irrelevant', ambition: 'civilization_changing_work',
    restlessness: 0, restlessFlagged: false,
    salary: 12, morale: 0.85, stress: 0, exhaustion: 0,
    isAvailable: true, projectHistory: [],
  },
  {
    id: 'ossavi', name: 'Ossavi the Archivist', age: 52,
    archetype: 'Pragmatic Chronicler',
    primaryDiscipline: 'History', secondaryDiscipline: 'Literature',
    disciplines: { History: 9, Literature: 7, Philosophy: 4 },
    disciplineXp: {},
    creativityStyle: 'Methodical',
    visibleTraits: ['Dedicated', 'Traditional'],
    hiddenTraits: ['Loyal', 'Stubborn'],
    fear: 'forgotten', ambition: 'remembered_after_death',
    restlessness: 0, restlessFlagged: false,
    salary: 18, morale: 0.75, stress: 0, exhaustion: 0,
    isAvailable: true, projectHistory: [],
  },
  {
    id: 'meridian', name: 'Meridian the Uncertain', age: 41,
    archetype: 'Skeptical Empiricist',
    primaryDiscipline: 'Philosophy', secondaryDiscipline: 'Medicine',
    disciplines: { Philosophy: 8, Medicine: 6, Mathematics: 4 },
    disciplineXp: {},
    creativityStyle: 'Controversial',
    visibleTraits: ['Skeptical', 'Curious'],
    hiddenTraits: ['Melancholic', 'Inspiring'],
    hiddenTalent: { discipline: 'Natural History', revealed: false },
    fear: 'never_finish_great_work', ambition: 'found_school_of_thought',
    legendaryPotential: true,
    restlessness: 0, restlessFlagged: false,
    salary: 15, morale: 0.70, stress: 0, exhaustion: 0,
    isAvailable: true, projectHistory: [],
  },
  {
    id: 'vasara', name: 'Vasara of the River Schools', age: 28,
    archetype: 'Ambitious Young Scholar',
    primaryDiscipline: 'Music', secondaryDiscipline: 'Theology',
    disciplines: { Music: 6, Theology: 5, Literature: 4 },
    disciplineXp: {},
    creativityStyle: 'Spiritual',
    visibleTraits: ['Idealistic', 'Charismatic'],
    hiddenTraits: ['Ambitious', 'Volatile'],
    fear: 'outshone_by_assistant', ambition: 'civilization_changing_work',
    restlessness: 0, restlessFlagged: false,
    salary: 10, morale: 0.90, stress: 0, exhaustion: 0,
    isAvailable: true, projectHistory: [],
  },
  {
    id: 'harlow', name: 'Harlow the Cartographer', age: 46,
    archetype: 'Master Craftsperson',
    primaryDiscipline: 'Cartography', secondaryDiscipline: 'Natural History',
    disciplines: { Cartography: 9, 'Natural History': 6, Engineering: 3 },
    disciplineXp: {},
    creativityStyle: 'Perfectionist',
    visibleTraits: ['Patient', 'Meticulous'],
    hiddenTraits: ['Reclusive', 'Humble'],
    fear: 'never_finish_great_work', ambition: 'student_surpasses_them',
    restlessness: 0, restlessFlagged: false,
    salary: 16, morale: 0.80, stress: 0, exhaustion: 0,
    isAvailable: true, projectHistory: [],
  },
];

// The player starts with these two.
export const STARTER_SCHOLARS: Scholar[] = FOUNDERS.slice(0, 2);

// The remaining founders appear as recruitable candidates over time.
// Kept ordered most→least relevant so the recruitment system can pick by
// who'd best fit current institutional gaps in the future.
export const FOUNDER_CANDIDATES: Scholar[] = FOUNDERS.slice(2);

// Lookup for the recruitment system when materializing a founder candidate.
export function findFounderCandidate(id: string): Scholar | undefined {
  return FOUNDER_CANDIDATES.find(s => s.id === id);
}

// Pool of candidates the recruitment system samples from. Each is a fully-formed
// scholar with hidden depths; the player only sees a partial profile in the hire UI.
export const HIRE_CANDIDATES: Scholar[] = [
  {
    id: 'cand_emer', name: 'Emer of the Salt Coast', age: 31,
    archetype: 'Exiled Philosopher',
    primaryDiscipline: 'Philosophy', secondaryDiscipline: 'History',
    disciplines: { Philosophy: 7, History: 4 },
    disciplineXp: {},
    creativityStyle: 'Traditional',
    visibleTraits: ['Resilient', 'Secretive'],
    hiddenTraits: ['Devout', 'Paranoid'],
    fear: 'discipline_irrelevant', ambition: 'found_school_of_thought',
    restlessness: 0, restlessFlagged: false,
    salary: 14, morale: 0.75, stress: 0, exhaustion: 0,
    isAvailable: true, projectHistory: [],
  },
  {
    id: 'cand_kira', name: 'Kira of the Sun Towers', age: 26,
    archetype: 'Obsessive Inventor',
    primaryDiscipline: 'Engineering', secondaryDiscipline: 'Mathematics',
    disciplines: { Engineering: 6, Mathematics: 6 },
    disciplineXp: {},
    creativityStyle: 'Obsessive',
    visibleTraits: ['Curious', 'Restless'],
    hiddenTraits: ['Obsessive', 'Inspiring'],
    hiddenTalent: { discipline: 'Astronomy', revealed: false },
    fear: 'never_finish_great_work', ambition: 'civilization_changing_work',
    restlessness: 0, restlessFlagged: false,
    salary: 11, morale: 0.80, stress: 0, exhaustion: 0,
    isAvailable: true, projectHistory: [],
  },
  {
    id: 'cand_tace', name: 'Tace the Quiet', age: 58,
    archetype: 'Quiet Genius',
    primaryDiscipline: 'Theology', secondaryDiscipline: 'Music',
    disciplines: { Theology: 8, Music: 5, Philosophy: 4 },
    disciplineXp: {},
    creativityStyle: 'Perfectionist',
    visibleTraits: ['Humble', 'Reclusive'],
    hiddenTraits: ['Dedicated', 'Melancholic'],
    fear: 'forgotten', ambition: 'remembered_after_death',
    legendaryPotential: true,
    restlessness: 0, restlessFlagged: false,
    salary: 19, morale: 0.65, stress: 0, exhaustion: 0,
    isAvailable: true, projectHistory: [],
  },
  {
    id: 'cand_oren', name: 'Oren of the Northern Reach', age: 38,
    archetype: 'Revolutionary Poet',
    primaryDiscipline: 'Literature', secondaryDiscipline: 'Philosophy',
    disciplines: { Literature: 7, Philosophy: 5 },
    disciplineXp: {},
    creativityStyle: 'Controversial',
    visibleTraits: ['Charismatic', 'Volatile'],
    hiddenTraits: ['Idealistic', 'Restless'],
    hiddenTalent: { discipline: 'Politics', revealed: false },
    fear: 'outshone_by_assistant', ambition: 'found_school_of_thought',
    restlessness: 0, restlessFlagged: false,
    salary: 13, morale: 0.85, stress: 0, exhaustion: 0,
    isAvailable: true, projectHistory: [],
  },
  {
    id: 'cand_lys', name: 'Lys the Cantor', age: 44,
    archetype: 'Spiritual Composer',
    primaryDiscipline: 'Music', secondaryDiscipline: 'Theology',
    disciplines: { Music: 8, Theology: 6 },
    disciplineXp: {},
    creativityStyle: 'Spiritual',
    visibleTraits: ['Devout', 'Patient'],
    hiddenTraits: ['Dogmatic', 'Inspiring'],
    fear: 'discipline_irrelevant', ambition: 'remembered_after_death',
    restlessness: 0, restlessFlagged: false,
    salary: 15, morale: 0.78, stress: 0, exhaustion: 0,
    isAvailable: true, projectHistory: [],
  },
  {
    id: 'cand_brel', name: 'Brel of the Lowland Schools', age: 33,
    archetype: 'Master Craftsperson',
    primaryDiscipline: 'Architecture', secondaryDiscipline: 'Engineering',
    disciplines: { Architecture: 7, Engineering: 5 },
    disciplineXp: {},
    creativityStyle: 'Methodical',
    visibleTraits: ['Patient', 'Humble'],
    hiddenTraits: ['Loyal', 'Stubborn'],
    fear: 'outshone_by_assistant', ambition: 'student_surpasses_them',
    restlessness: 0, restlessFlagged: false,
    salary: 12, morale: 0.80, stress: 0, exhaustion: 0,
    isAvailable: true, projectHistory: [],
  },
];

// Back-compat alias — old code (and possibly old saves) referenced HIREABLE_SCHOLAR.
// Removed at next save-version bump.
export const HIREABLE_SCHOLAR: Scholar = HIRE_CANDIDATES[0];
