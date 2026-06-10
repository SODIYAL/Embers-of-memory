import type { Topic } from '../models/Topic';

// Topic ids must remain stable across saves (used in projects, works,
// commissions). `name` matches the discipline string on scholars so
// scholar skill lookups (`scholar.disciplines[topic.name]`) work directly.
// strongFormats/weakFormats reference ids from data/formats.ts.
export const TOPICS: Topic[] = [
  { id: 'astronomy',       name: 'Astronomy',       culturalWeight: 'low',
    strongFormats: ['scientific_compendium', 'educational_handbook'], weakFormats: ['hymn'] },
  { id: 'philosophy',      name: 'Philosophy',      culturalWeight: 'high',
    strongFormats: ['philosophical_treatise', 'epic_poetry'],         weakFormats: ['atlas'] },
  { id: 'medicine',        name: 'Medicine',        culturalWeight: 'medium',
    strongFormats: ['educational_handbook', 'scientific_compendium'], weakFormats: ['hymn', 'epic_poetry'] },
  { id: 'theology',        name: 'Theology',        culturalWeight: 'very_high',
    strongFormats: ['hymn', 'philosophical_treatise'],                weakFormats: ['atlas'] },
  { id: 'music',           name: 'Music',           culturalWeight: 'low',
    strongFormats: ['hymn', 'epic_poetry'],                           weakFormats: ['scientific_compendium'] },
  { id: 'cartography',     name: 'Cartography',     culturalWeight: 'low',
    strongFormats: ['atlas', 'educational_handbook'],                 weakFormats: ['hymn', 'philosophical_treatise'] },

  // Disciplines from the hand-authored scholars that previously had no
  // matching topic — these existed only as flavor on Ossavi/Meridian/etc.
  // and made them unable to lead works in their best field. Now playable.
  { id: 'history',         name: 'History',         culturalWeight: 'high',
    strongFormats: ['philosophical_treatise', 'epic_poetry'],         weakFormats: ['hymn'] },
  { id: 'literature',      name: 'Literature',      culturalWeight: 'high',
    strongFormats: ['epic_poetry', 'philosophical_treatise'],         weakFormats: ['atlas', 'scientific_compendium'] },
  { id: 'mathematics',     name: 'Mathematics',     culturalWeight: 'medium',
    strongFormats: ['scientific_compendium', 'educational_handbook'], weakFormats: ['hymn', 'epic_poetry'] },
  { id: 'natural_history', name: 'Natural History', culturalWeight: 'medium',
    strongFormats: ['scientific_compendium', 'educational_handbook'], weakFormats: ['hymn'] },
  { id: 'engineering',     name: 'Engineering',     culturalWeight: 'medium',
    strongFormats: ['educational_handbook', 'atlas'],                 weakFormats: ['hymn', 'epic_poetry'] },
  { id: 'architecture',    name: 'Architecture',    culturalWeight: 'medium',
    strongFormats: ['educational_handbook', 'atlas'],                 weakFormats: ['hymn'] },
];
