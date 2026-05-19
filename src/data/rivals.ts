import type { Rival } from '../models/World';

export const RIVALS: Rival[] = [
  {
    id: 'crystallarium',
    name: 'The Crystallarium',
    flavor: 'An empire\'s star-readers and surveyors. They count, they measure, they catalogue. Pious tradition is, to them, a problem to be retired.',
    focusDisciplines: ['Astronomy', 'Cartography'],
    ideologyLean: { piety: -3, tradition: -2, populism: -1 },
    releaseCadence: 140,
  },
  {
    id: 'settled_word',
    name: 'The Cloister of the Settled Word',
    flavor: 'A walled monastery of copyists and theologians. They guard the old texts and weigh every new word.',
    focusDisciplines: ['Theology', 'Philosophy'],
    ideologyLean: { piety: +3, tradition: +3, populism: -1 },
    releaseCadence: 160,
  },
  {
    id: 'pasare',
    name: 'The Free Hall of Pasare',
    flavor: 'A reformer institution funded by guilds. They write for the people, in the people\'s tongue.',
    focusDisciplines: ['Music', 'Medicine'],
    ideologyLean: { piety: -1, tradition: -2, populism: +3 },
    releaseCadence: 130,
  },
];
