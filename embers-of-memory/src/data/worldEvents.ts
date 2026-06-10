import type { WorldEvent } from '../models/World';

export const WORLD_EVENTS: WorldEvent[] = [
  {
    id: 'religious_revival',
    name: 'A Religious Revival',
    flavor: 'Pilgrim routes swell. Hymns are sung in marketplaces. The faithful look to the institutions of learning for confirmation.',
    topicDemandMod: { Theology: 1.40, Philosophy: 1.10 },
    factionNudges: { church: +12 },
    durationDays: 90,
  },
  {
    id: 'trade_boom',
    name: 'A Trade Boom',
    flavor: 'Merchant fleets return laden. Maps and almanacs are bought before the ink dries.',
    topicDemandMod: { Cartography: 1.40, Astronomy: 1.15 },
    factionNudges: { crown: +6, reformers: +4 },
    durationDays: 90,
  },
  {
    id: 'plague',
    name: 'A Plague Stalks the Cities',
    flavor: 'Sickness moves quietly through the wards. People seek both medicine and prayer.',
    topicDemandMod: { Medicine: 1.55, Theology: 1.15 },
    factionNudges: { church: +5 },
    durationDays: 75,
  },
  {
    id: 'census_decree',
    name: 'A Royal Census',
    flavor: 'The Crown orders a full reckoning of its lands. Mapmakers grow rich; philosophers are told to keep quiet.',
    topicDemandMod: { Cartography: 1.30, Philosophy: 0.80 },
    factionNudges: { crown: +10, reformers: -5 },
    durationDays: 120,
  },
  {
    id: 'heresy_trial',
    name: 'A Heresy Trial',
    flavor: 'A reformist scholar is tried in the high court. The wider movement falls silent for now.',
    topicDemandMod: { Philosophy: 0.85 },
    factionNudges: { church: +8, reformers: -10 },
    durationDays: 90,
  },
  {
    id: 'inland_war',
    name: 'War with the Inland',
    flavor: 'The drums beat in the eastern roads. Treatises on virtue and atlas of supply lines find eager buyers.',
    topicDemandMod: { Cartography: 1.25, Philosophy: 1.20, Music: 0.85 },
    factionNudges: { crown: +8, church: -3 },
    durationDays: 120,
  },
];
