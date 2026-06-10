import type { Project, StageKey, StageRecord } from '../models/Project';
import type { IdeologyVector, FactionId, IdeologyAxis } from '../models/Ideology';
import type { Scholar } from '../models/Scholar';
import type { Work } from '../models/Work';
import type { MajorPatron, MinorCommission, GameOverState } from '../models/Economy';

export const GameEvents = {
  DAY_PASSED:          'time:day',
  MONTH_PASSED:        'time:month',
  YEAR_PASSED:         'time:year',
  PROJECT_STARTED:     'project:started',
  PROJECT_PROGRESS:    'project:progress',
  MID_PROJECT_EVENT:   'project:midevent',
  PROJECT_STAGE_GATE:  'project:stage_gate',
  PROJECT_STAGE_STARTED: 'project:stage_started',
  PROJECT_COMPLETED:   'project:completed',
  PROJECT_CANCELLED:   'project:cancelled',
  WORK_RELEASED:       'work:released',
  TREASURY_CHANGED:    'economy:treasury_changed',
  TREASURY_LOW:        'economy:treasury_low',
  MONTH_LEDGER:        'economy:month_ledger',
  BANKRUPTCY:          'economy:bankruptcy',
  PATRON_GRANTED:      'economy:patron_granted',
  SCHOLAR_HIRED:       'scholar:hired',
  SCHOLAR_SKILL_UP:    'scholar:skillup',
  SCHOLAR_TRAIT_REVEALED: 'scholar:trait_revealed',
  SCHOLAR_TALENT_REVEALED: 'scholar:talent_revealed',
  SCHOLAR_RESTLESS:    'scholar:restless',
  SCHOLAR_LEFT:        'scholar:left',
  SCHOLAR_AMBITION_FULFILLED: 'scholar:ambition_fulfilled',
  SCHOLAR_FEAR_TRIGGERED:     'scholar:fear_triggered',
  SCHOLAR_RETIRED:            'scholar:retired',
  SCHOLAR_REST_STARTED:       'scholar:rest_started',
  SCHOLAR_REST_ENDED:         'scholar:rest_ended',
  CHEMISTRY_BAND_CHANGED:     'scholar:chemistry_band_changed',
  TIER_PROMOTED:              'institution:tier_promoted',
  ZONE_UNLOCKED:              'institution:zone_unlocked',
  FACILITY_BUILT:             'institution:facility_built',
  FACILITY_UPGRADED:          'institution:facility_upgraded',
  DEPARTMENT_FOUNDED:         'institution:department_founded',
  DEPARTMENT_DISBANDED:       'institution:department_disbanded',
  MAJOR_PATRON_OFFERED:       'economy:major_patron_offered',
  MAJOR_PATRON_ACCEPTED:      'economy:major_patron_accepted',
  MAJOR_PATRON_WITHDREW:      'economy:major_patron_withdrew',
  MINOR_COMMISSION_OFFERED:   'economy:minor_commission_offered',
  MINOR_COMMISSION_ACCEPTED:  'economy:minor_commission_accepted',
  MINOR_COMMISSION_DECLINED:  'economy:minor_commission_declined',
  MINOR_COMMISSION_COMPLETED: 'economy:minor_commission_completed',
  GRANT_CLAIMED:              'economy:grant_claimed',
  WORK_RIGHTS_SOLD:           'economy:work_rights_sold',
  PATRON_APPEAL_USED:         'economy:patron_appeal_used',
  IDEOLOGY_DRIFT:             'ideology:drift',
  FACTION_FAVOR_OFFERED:      'ideology:faction_favor_offered',
  FACTION_DENOUNCED:          'ideology:faction_denounced',
  WORK_SUPPRESSED:            'ideology:work_suppressed',
  FACTION_PATRONAGE_OFFERED:  'ideology:faction_patronage_offered',
  DEPARTMENT_PROJECT_PROPOSED:  'department:project_proposed',
  DEPARTMENT_PROJECT_STARTED:   'department:project_started',
  DEPARTMENT_PROJECT_ESCALATED: 'department:project_escalated',
  DEPARTMENT_PROJECT_COMPLETED: 'department:project_completed',
  FOUNDER_SUCCESSION:           'founder:succession',
  RIVAL_RELEASED:               'world:rival_released',
  WORLD_EVENT_STARTED:          'world:event_started',
  WORLD_EVENT_ENDED:            'world:event_ended',
  POACH_ATTEMPT:                'world:poach_attempt',
  SCHOLAR_POACHED:              'world:scholar_poached',
  REPRINT_STARTED:              'work:reprint_started',
  REPRINT_COMPLETED:            'work:reprint_completed',
  WORK_SALE_TICK:               'work:sale_tick',
  WORK_SALES_FINISHED:          'work:sales_finished',
  GAME_OVER:                  'game:over',
} as const;

export interface EventPayloads {
  [GameEvents.DAY_PASSED]:        { day: number };
  [GameEvents.MONTH_PASSED]:      { month: number };
  [GameEvents.YEAR_PASSED]:       { year: number };
  [GameEvents.PROJECT_STARTED]:   { project: Project };
  [GameEvents.PROJECT_PROGRESS]:  { progress: number };
  [GameEvents.MID_PROJECT_EVENT]: { scholarName: string; text: string; choice?: MidEventChoice };
  [GameEvents.PROJECT_STAGE_GATE]: {
    project: Project;
    completedStage: StageRecord;
    nextStageKey: StageKey;
  };
  [GameEvents.PROJECT_STAGE_STARTED]: {
    project: Project;
    stageKey: StageKey;
    leadScholarId: string;
  };
  [GameEvents.PROJECT_COMPLETED]: { work: Work };
  [GameEvents.PROJECT_CANCELLED]: { project: Project; refund: number };
  [GameEvents.WORK_RELEASED]:     { work: Work };
  [GameEvents.TREASURY_CHANGED]:  { amount: number };
  [GameEvents.MONTH_LEDGER]: {
    month: number;
    backlist: number;
    stipends: number;
    salaries: number;
    upkeep: number;
    ops: number;
    net: number;
    treasury: number;
  };
  [GameEvents.TREASURY_LOW]:      { amount: number; tier: 'strained' | 'critical' };
  [GameEvents.BANKRUPTCY]:        { amount: number; monthsNegative: number };
  [GameEvents.PATRON_GRANTED]:    { amount: number; flavor: string };
  [GameEvents.SCHOLAR_HIRED]:     { scholar: Scholar };
  [GameEvents.SCHOLAR_SKILL_UP]:  { scholarId: string; topic: string; newLevel: number };
  [GameEvents.SCHOLAR_TRAIT_REVEALED]:  { scholarId: string; trait: string; flavor: string };
  [GameEvents.SCHOLAR_TALENT_REVEALED]: { scholarId: string; discipline: string; flavor: string };
  [GameEvents.SCHOLAR_RESTLESS]:        { scholarId: string; reason: string };
  [GameEvents.SCHOLAR_LEFT]:            { scholarId: string; scholarName: string; reason: string };
  [GameEvents.SCHOLAR_AMBITION_FULFILLED]: { scholarId: string; scholarName: string; ambition: string };
  [GameEvents.SCHOLAR_FEAR_TRIGGERED]:     { scholarId: string; scholarName: string; fear: string };
  [GameEvents.SCHOLAR_RETIRED]:            { scholarId: string; scholarName: string; age: number };
  [GameEvents.SCHOLAR_REST_STARTED]:       { scholarId: string };
  [GameEvents.SCHOLAR_REST_ENDED]:         { scholarId: string };
  [GameEvents.CHEMISTRY_BAND_CHANGED]:     { scholarA: string; scholarB: string; prevBand: string; nextBand: string; direction: 'up' | 'down' };
  [GameEvents.TIER_PROMOTED]:              { newTier: 1 | 2 | 3; tierName: string };
  [GameEvents.ZONE_UNLOCKED]:              { zoneId: string; zoneName: string };
  [GameEvents.FACILITY_BUILT]:             { facilityId: string; facilityName: string; zoneId: string };
  [GameEvents.FACILITY_UPGRADED]:          { facilityId: string; facilityName: string; newTier: number };
  [GameEvents.DEPARTMENT_FOUNDED]:         { departmentId: string; name: string; headScholarName: string };
  [GameEvents.DEPARTMENT_DISBANDED]:       { departmentId: string; name: string; reason: string };
  [GameEvents.MAJOR_PATRON_OFFERED]:       { patron: MajorPatron; arrivalFlavor: string };
  [GameEvents.MAJOR_PATRON_ACCEPTED]:      { patronId: string; patronName: string };
  [GameEvents.MAJOR_PATRON_WITHDREW]:      { patronId: string; patronName: string; reason: string };
  [GameEvents.MINOR_COMMISSION_OFFERED]:   { commission: MinorCommission };
  [GameEvents.MINOR_COMMISSION_ACCEPTED]:  { commissionId: string; patronName: string };
  [GameEvents.MINOR_COMMISSION_DECLINED]:  { commissionId: string; patronName: string };
  [GameEvents.MINOR_COMMISSION_COMPLETED]: { commissionId: string; patronName: string; payment: number };
  [GameEvents.GRANT_CLAIMED]:              { grantId: string; amount: number; flavor: string };
  [GameEvents.WORK_RIGHTS_SOLD]:           { workId: string; workTitle: string; amount: number };
  [GameEvents.PATRON_APPEAL_USED]:         { amount: number };
  [GameEvents.IDEOLOGY_DRIFT]:             {
    imprint: IdeologyVector;
    axes: Record<IdeologyAxis, number>;
    factions: Record<FactionId, number>;
  };
  [GameEvents.FACTION_FAVOR_OFFERED]:      { factionId: FactionId; factionName: string; standing: number };
  [GameEvents.FACTION_DENOUNCED]:          { factionId: FactionId; factionName: string; standing: number };
  [GameEvents.WORK_SUPPRESSED]:            {
    workId: string;
    workTitle: string;
    factionId: FactionId;
    factionName: string;
    revenueLost: number;
  };
  [GameEvents.FACTION_PATRONAGE_OFFERED]:  {
    factionId: FactionId;
    factionName: string;
    stipend: number;
    flavor: string;
  };
  [GameEvents.DEPARTMENT_PROJECT_PROPOSED]: {
    departmentId: string;
    departmentName: string;
    headName: string;
    topicName: string;
    formatName: string;
    proposalId: string;
  };
  [GameEvents.DEPARTMENT_PROJECT_STARTED]: {
    departmentId: string;
    projectId: string;
  };
  [GameEvents.DEPARTMENT_PROJECT_ESCALATED]: {
    departmentId: string;
    departmentName: string;
    projectId: string;
    kind: 'controversy' | 'dispute' | 'missing_source';
    flavor: string;
  };
  [GameEvents.DEPARTMENT_PROJECT_COMPLETED]: {
    departmentId: string;
    departmentName: string;
    work: Work;
  };
  [GameEvents.FOUNDER_SUCCESSION]: {
    founderId: string;
    founderName: string;
    departmentId?: string;
    departmentName?: string;
  };
  [GameEvents.RIVAL_RELEASED]: {
    rivalId: string;
    rivalName: string;
    topicName: string;
    formatName: string;
    quality: number;
  };
  [GameEvents.WORLD_EVENT_STARTED]: { eventId: string; eventName: string; flavor: string };
  [GameEvents.WORLD_EVENT_ENDED]:   { eventId: string; eventName: string };
  [GameEvents.POACH_ATTEMPT]: {
    rivalId: string;
    rivalName: string;
    scholarId: string;
    scholarName: string;
    counterOfferCost: number;
  };
  [GameEvents.SCHOLAR_POACHED]: {
    rivalId: string;
    rivalName: string;
    scholarId: string;
    scholarName: string;
  };
  [GameEvents.REPRINT_STARTED]:   { workId: string; workTitle: string; finishDay: number; projectedRevenue: number };
  [GameEvents.REPRINT_COMPLETED]: { workId: string; workTitle: string; revenue: number };
  [GameEvents.WORK_SALE_TICK]: {
    workId: string; workTitle: string;
    amount: number; earnedTotal: number; projectedTotal: number;
    daysActive: number; windowDays: number;
  };
  [GameEvents.WORK_SALES_FINISHED]: {
    workId: string; workTitle: string;
    earnedTotal: number; projectedTotal: number;
  };
  [GameEvents.GAME_OVER]:                  GameOverState;
}

export type GameEventName = keyof EventPayloads;

export interface MidEventChoice {
  prompt: string;
  options: Array<{ label: string; effect: 'push' | 'rest' | 'ignore' }>;
}

type Listener<E extends GameEventName> = (payload: EventPayloads[E]) => void;

class EventBusImpl {
  private listeners = new Map<GameEventName, Listener<GameEventName>[]>();

  on<E extends GameEventName>(event: E, cb: Listener<E>) {
    const list = this.listeners.get(event) ?? [];
    list.push(cb as Listener<GameEventName>);
    this.listeners.set(event, list);
  }

  off<E extends GameEventName>(event: E, cb: Listener<E>) {
    const list = this.listeners.get(event) ?? [];
    this.listeners.set(event, list.filter(fn => fn !== cb));
  }

  emit<E extends GameEventName>(event: E, payload: EventPayloads[E]) {
    this.listeners.get(event)?.forEach(cb => (cb as Listener<E>)(payload));
  }
}

export const Events = new EventBusImpl();
