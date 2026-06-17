import type { StageRecord } from './Project';

export interface QualityBreakdown {
  skill: number;          // 0..0.6
  synergy: number;        // -0.1..+0.2
  synergyLabel: 'strong' | 'neutral' | 'weak';
  priorities: number;     // 0..0.1
  wellbeing: number;      // <= 0, applied as a penalty
  collaboration: number;  // 0..~0.21, raw skill contribution from assistants
  chemistry: number;      // pair-band sum among the team (-0.x..+0.x)
  institution: number;    // facility + department bonuses (0..~0.2)
  variance: number;       // -0.05..+0.05
  total: number;          // clamped 0..1 final quality
}

export interface Work {
  id: string;
  title: string;
  topicId: string;
  formatId: string;
  leadScholarId: string;
  assistantScholarIds: string[];
  qualityDescriptor: string;
  revenue: number;
  releaseDay: number;
  flavorReaction: string;
  breakdown?: QualityBreakdown;
  xpGained?: number; // lead's XP burst (back-compat)
  xpByScholar?: Record<string, number>; // per-participant XP burst
  stages?: StageRecord[]; // stage team history for multi-stage projects
  // Ideological imprint left on the institution by this work (Phase 9)
  ideologyImprint?: import('./Ideology').IdeologyVector;
  // Reprint tracking (Phase 11) — total reprints + last reprint day
  reprints?: number;
  lastReprintDay?: number;
  // Sales over time (Phase 12) — for player-original works. When present,
  // the work sells across a sliding window post-release; `revenue` becomes
  // the projected total. Commission works leave salesState undefined.
  salesState?: WorkSalesState;
}

export interface WorkSalesState {
  startDay: number;            // day of release
  endDay: number;              // day sales close
  projectedTotal: number;      // best-effort projection at start (= work.revenue)
  preorder?: number;           // lump earned upfront at release (counts toward earnedTotal)
  earnedTotal: number;         // gold earned so far (includes the preorder)
  daysActive: number;          // days elapsed since release (caps at window)
  complete: boolean;           // true once endDay reached or rights sold
  // Daily curve seed so the same work earns consistently across saves.
  seed: number;
  // Per-day gold earned — index i = day (startDay + i). Length grows from 0
  // up to SALES_WINDOW_DAYS as sales tick. Used by the UI sparkline.
  dailyHistory?: number[];
}

export function workParticipantIds(work: Work): string[] {
  const ids = new Set<string>();

  if (work.stages && work.stages.length > 0) {
    for (const stage of work.stages) {
      ids.add(stage.leadScholarId);
      for (const aid of stage.assistantScholarIds) ids.add(aid);
    }
  } else {
    ids.add(work.leadScholarId);
    for (const aid of work.assistantScholarIds) ids.add(aid);
  }

  return Array.from(ids);
}

export function workLeadScholarIds(work: Work): string[] {
  if (!work.stages || work.stages.length === 0) return [work.leadScholarId];
  return Array.from(new Set(work.stages.map(stage => stage.leadScholarId)));
}

export function scholarLedWork(work: Work, scholarId: string): boolean {
  return workLeadScholarIds(work).includes(scholarId);
}

export function scholarParticipatedInWork(work: Work, scholarId: string): boolean {
  return workParticipantIds(work).includes(scholarId);
}

export function workAssistantsForLead(work: Work, leadScholarId: string): string[] {
  if (!work.stages || work.stages.length === 0) {
    return work.leadScholarId === leadScholarId ? [...work.assistantScholarIds] : [];
  }

  const ids = new Set<string>();
  for (const stage of work.stages) {
    if (stage.leadScholarId !== leadScholarId) continue;
    for (const aid of stage.assistantScholarIds) ids.add(aid);
  }
  return Array.from(ids);
}

export function workRoleLabel(work: Work, scholarId: string): string {
  const led = scholarLedWork(work, scholarId);
  const assisted = work.stages
    ? work.stages.some(stage => stage.assistantScholarIds.includes(scholarId))
    : work.assistantScholarIds.includes(scholarId);

  if (led && assisted) return 'lead + assisting';
  if (led) return 'lead';
  return 'assisting';
}
