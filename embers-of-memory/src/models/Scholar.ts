export interface HiddenTalent {
  discipline: string;
  revealed: boolean;
  // Hidden talents reveal when the scholar works on a project where this
  // discipline matches the topic but it isn't their primary or secondary.
}

export type FearId =
  | 'forgotten'
  | 'outshone_by_assistant'
  | 'never_finish_great_work'
  | 'discipline_irrelevant';

export type AmbitionId =
  | 'civilization_changing_work'
  | 'found_school_of_thought'
  | 'student_surpasses_them'
  | 'remembered_after_death';

// Belief axes — stored at hire, mostly hidden until events reveal them.
// Effects gated to Phase 9 (ideology). Stored now so the data is durable.
export type Epistemology   = 'empirical' | 'revealed' | 'traditional';
export type Spirituality   = 'devout' | 'agnostic' | 'syncretic' | 'skeptical' | 'mystical';
export type Politics       = 'loyal' | 'reformist' | 'subversive' | 'indifferent';
export type KnowledgeAccess = 'everyone' | 'scholars_only' | 'faithful' | 'rulers';

export interface Beliefs {
  epistemology: Epistemology;
  spirituality: Spirituality;
  politics: Politics;
  knowledgeAccess: KnowledgeAccess;
}

export interface Scholar {
  id: string;
  name: string;
  age: number;
  archetype: string;
  primaryDiscipline: string;
  secondaryDiscipline?: string;
  disciplines: Record<string, number>;
  disciplineXp: Record<string, number>; // XP toward next skill point per discipline
  creativityStyle: string;
  visibleTraits: string[];
  hiddenTraits: string[];
  hiddenTalent?: HiddenTalent;

  // Hidden at hire — reveal/trigger over time.
  fear?: FearId;
  ambition?: AmbitionId;
  fearTriggered?: boolean;
  ambitionFulfilled?: boolean;

  // Hidden flag — never explicitly revealed in UI. When conditions align,
  // this scholar produces a landmark work.
  legendaryPotential?: boolean;

  beliefs?: Beliefs;

  // Restlessness — incremented each month a scholar gets mismatched work or no work at all.
  // At a threshold they leave. Reset by giving them appropriate work.
  restlessness: number;
  restlessFlagged: boolean;

  salary: number;
  morale: number;
  stress: number;     // 0-1: accumulates on mismatched work, drains when idle
  exhaustion: number; // 0-1: accumulates during any work, drains when resting
  isAvailable: boolean;
  // True while the player has put them on rest. Resting scholars are
  // excluded from project assignments and recover stress/exhaustion at
  // ~3x the passive idle rate. Auto-clears when both reach zero.
  isResting?: boolean;
  projectHistory: string[];
}
