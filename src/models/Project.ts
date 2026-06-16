export type ProjectState = 'setup' | 'in_development' | 'awaiting_stage_lead' | 'releasing' | 'complete';

export type StageKey = 'research' | 'drafting' | 'refinement';

export const STAGE_ORDER: readonly StageKey[] = ['research', 'drafting', 'refinement'];

// Points the player distributes across a work's priorities at setup. Shared by
// the setup UI (ProjectPanel) and the quality math (ProjectSystem) so the
// per-stage emphasis bonus stays normalized to the pool — change it in one
// place and both stay in step.
export const PRIORITY_POOL = 12;

export const STAGE_INFO: Record<StageKey, {
  label: string;
  flavor: string;
  // Which priority axes this stage emphasizes when computing its quality slice
  emphasizes: readonly string[];
}> = {
  research:   { label: 'Research',   flavor: 'Sources are gathered, notes compiled, the subject opened.',
                emphasizes: ['Accuracy', 'Innovation', 'Preservation'] },
  drafting:   { label: 'Drafting',   flavor: 'The work takes shape on the page — voice, structure, argument.',
                emphasizes: ['Beauty', 'Accessibility', 'Spirituality'] },
  refinement: { label: 'Refinement', flavor: 'Last polish — gaps in earlier stages get a final correction.',
                emphasizes: ['Propaganda'] },
};

export interface StageRecord {
  key: StageKey;
  leadScholarId: string;
  assistantScholarIds: string[];     // snapshot of who was idle when stage began
  qualitySlice: number;              // 0..~0.4 — what this stage contributed
  startDay: number;
  endDay?: number;                   // set when stage completes
  // Phase 11 — optional ideological framing the player applied at the stage gate.
  // Adds a small per-axis nudge to the work's final imprint.
  framing?: import('./Ideology').IdeologyVector;
  // Phase 13 — per-stage emphasis: points the player allocated across the
  // stage's 3 axes (e.g. Rigor/Sources/Scope for research). Stored raw —
  // normalize and compare to the ideal mix at quality-compute time.
  emphasis?: Record<string, number>;
  // Match score 0..1 computed at stage close, stored for the report UI.
  emphasisMatch?: number;
}

export interface Project {
  id: string;
  topicId: string;
  formatId: string;
  // First stage's lead — also used as the project's nominal "owner" for events
  leadScholarId: string;
  // Assistants for the CURRENT stage (refreshed at every stage gate from idle pool)
  assistantScholarIds: string[];
  priorities: Record<string, number>;
  state: ProjectState;
  progress: number;
  qualityScore: number;
  startDay: number;
  releaseDay?: number;

  // Stage tracking
  currentStageIndex: number;         // 0, 1, 2
  stages: StageRecord[];             // grows as stages complete; last entry = current stage in progress

  // True when this project is fulfilling an active minor commission.
  // Commission works pay a guaranteed lump sum; original works sell over time.
  isCommission?: boolean;
}
