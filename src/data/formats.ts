import type { Format } from '../models/Format';

export const FORMATS: Format[] = [
  { id: 'atlas',                  name: 'Illustrated Atlas',       primaryAudience: 'Merchants, Explorers',   reachType: 'economic',     baseDuration: 60 },
  { id: 'hymn',                   name: 'Hymn',                    primaryAudience: 'General Public, Temples', reachType: 'spiritual',    baseDuration: 30 },
  { id: 'educational_handbook',   name: 'Educational Handbook',    primaryAudience: 'Students, Teachers',     reachType: 'educational',  baseDuration: 45 },
  { id: 'philosophical_treatise', name: 'Philosophical Treatise',  primaryAudience: 'Scholars',               reachType: 'intellectual', baseDuration: 75 },
  { id: 'scientific_compendium',  name: 'Scientific Compendium',   primaryAudience: 'Scholars, Physicians',   reachType: 'scholarly',    baseDuration: 90 },
  { id: 'epic_poetry',            name: 'Epic Poetry',             primaryAudience: 'Nobles, General Public', reachType: 'cultural',     baseDuration: 45 },
];
