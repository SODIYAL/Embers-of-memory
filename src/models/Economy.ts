// Economy types — patrons, commissions, grants.

export type PatronType =
  | 'ruling_family'
  | 'religious_order'
  | 'merchant_guild'
  | 'foreign_court'
  | 'scholarly_benefactor';

export interface MajorPatron {
  id: string;
  archetypeKey: string;   // points back into MAJOR_PATRON_ARCHETYPES (by type)
  name: string;
  type: PatronType;
  stipend: number;
  expectsDiscipline?: string;
  joinedDay: number;
  // Patience drops each month an expected discipline-aligned work is *not* produced.
  // At 0 the patron withdraws.
  patience: number;       // starts at 12, max 12, min 0
  // Ideological alignment preferences (Phase 9). Decay accelerates when the
  // institution drifts opposite their values.
  alignment?: import('./Ideology').IdeologyVector;
}

export interface MinorCommission {
  id: string;
  patronName: string;
  topicId: string;
  formatId: string;
  payment: number;
  expiresDay: number;     // offer auto-declined after this day
  flavor: string;
}

export interface ActiveCommission {
  commissionId: string;
  // Snapshot of fields when accepted — used to lock the next project.
  topicId: string;
  formatId: string;
  payment: number;
  patronName: string;
}

export type GameOverReason = 'bankruptcy' | 'no_scholars';

export interface GameOverState {
  reason: GameOverReason;
  day: number;
  institutionName: string;
  finalPrestige: number;
  finalTreasury: number;
  worksReleased: number;
  scholarsPassedThrough: number;
}
