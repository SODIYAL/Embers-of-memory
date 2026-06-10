import type { Scholar } from './Scholar';
import type { Project } from './Project';
import type { Work } from './Work';
import type { MajorPatron, MinorCommission, ActiveCommission } from './Economy';
import type { IdeologyState } from './Ideology';
import type { WorldState } from './World';

export interface GameState {
  version: number;
  day: number;
  treasury: number;
  prestige: number;
  scholars: Scholar[];
  activeProject?: Project;
  completedWorks: Work[];
  institutionName: string;
  monthsNegative: number;
  treasuryWarningTier: 'strained' | 'critical' | null;
  patronGranted: boolean;

  // Recruitment
  currentCandidates: Scholar[];
  lastRecruitmentDay: number; // 0 = never recruited
  candidateArrivalDay: number; // when the in-flight messengers will return; 0 if no pending request
  pendingCandidates: Scholar[]; // queued by the messenger system, swapped in on arrival

  // Chemistry between scholars — keyed by pairKey(a, b) (sorted ids joined by ':')
  // Score in [-100, 100]. Missing key = no shared history.
  chemistry: Record<string, number>;

  // Sharedhistory count per pair — used to reveal chemistry depth.
  chemistryShared: Record<string, number>;

  // Institution progression
  tier: 1 | 2 | 3;
  unlockedZones: string[];           // zone ids
  facilities: Record<string, number>; // facilityId → tier (1,2,3); absent = not built
  departments: Department[];

  // Economy v2
  majorPatrons: MajorPatron[];
  patronArchetypesGranted: string[];     // archetype types already offered or active (one-shot per archetype)
  patronAppealUsed: boolean;             // emergency one-shot
  workRightsSold: string[];              // work ids whose rights have been sold
  activeCommission?: ActiveCommission;   // when accepting a minor commission, lock next project
  pendingCommission?: MinorCommission;   // current outstanding offer waiting on accept/decline
  grantsClaimed: string[];               // grant ids already collected
  scholarsEverHired: number;             // for legacy summary; increments on hire
  consecutiveBankruptMonths: number;     // 0 when treasury ≥ 0 at month tick; +1 each month negative
  gameOver: boolean;                     // when true, MenuScene shows on next frame; save cleared

  // Ideology (Phase 9)
  ideology: IdeologyState;

  // Phase 7b — autonomous department output
  departmentProjects: DepartmentProject[];

  // Phase 10 — Rivals & World Simulation
  world: WorldState;

  // Phase 11 — Reprints in flight
  activeReprints: ActiveReprint[];

  // Founder candidates not yet hired. They appear in recruitment draws
  // alongside procedural candidates until each is gone from this list.
  availableFounderCandidates: string[];

  // Milestone flags — one-shot "first time" toasts to teach the player
  // what just happened (first hire, first complete, first sale, etc.).
  // Each key flips true the first time it triggers; saved across sessions.
  milestoneFlags?: Partial<{
    firstHire: boolean;
    firstProjectStarted: boolean;
    firstWorkReleased: boolean;
    firstSaleEarned: boolean;
    firstChemistryHigh: boolean;
    firstZoneUnlocked: boolean;
    firstCommissionAccepted: boolean;
  }>;
}

export interface ActiveReprint {
  workId: string;
  startDay: number;
  finishDay: number;        // when the reprint pays out
  projectedRevenue: number; // computed at start (snapshots base) so saturation later doesn't double-discount
}

export interface Department {
  id: string;
  name: string;
  discipline: string;     // primary discipline this department covers
  headScholarId: string;  // department head's scholar id
  mandate: string;        // short text — flavor + future use
  foundedDay: number;

  // Phase 7b — autonomous output
  activeProjectId?: string;          // id of the DepartmentProject currently running, if any
  lastProposalDay?: number;          // last day a proposal was offered (declined or accepted)
  morale: number;                    // 0..1; declined proposals + bad outcomes lower this
}

// A simpler project shape than the player's Project — the player doesn't pick
// stage leads here; the department runs it autonomously to completion.
export interface DepartmentProject {
  id: string;
  departmentId: string;
  topicId: string;
  formatId: string;
  leadScholarId: string;             // head scholar
  assistantScholarIds: string[];     // 1-2 dept members
  progress: number;                  // 0..1
  startDay: number;
  // If an escalation event is in flight, the project is paused until resolved.
  escalation?: {
    kind: 'controversy' | 'dispute' | 'missing_source';
    flavor: string;
    triggeredDay: number;
  };
}
