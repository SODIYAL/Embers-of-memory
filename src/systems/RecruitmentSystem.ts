import { Events, GameEvents } from '../game/EventBus';
import { Game } from '../game/GameManager';
import { generateScholar } from '../utils/Generators';
import { findFounderCandidate } from '../data/scholars';
import type { Scholar } from '../models/Scholar';

export const RECRUITMENT_COST = 30;       // gold
export const RECRUITMENT_DELAY_DAYS = 30; // messengers travel and return
export const CANDIDATE_POOL_SIZE = 2;     // candidates per arrival
// Probability a single candidate slot is filled by an unhired founder
// (instead of a fresh procedural scholar), when any are still available.
const FOUNDER_DRAW_CHANCE = 0.40;

export class RecruitmentSystem {
  private readonly onDayPassed = ({ day }: { day: number }) => this.tick(day);
  private readonly onScholarHired = ({ scholar }: { scholar: Scholar }) => {
    // If a founder candidate has been hired, remove them from the pool so
    // they don't reappear in future draws.
    Game.state.availableFounderCandidates =
      Game.state.availableFounderCandidates.filter(id => id !== scholar.id);
  };
  private initialized = false;

  init() {
    if (this.initialized) return;
    this.initialized = true;
    Events.on(GameEvents.DAY_PASSED, this.onDayPassed);
    Events.on(GameEvents.SCHOLAR_HIRED, this.onScholarHired);
  }

  destroy() {
    if (!this.initialized) return;
    Events.off(GameEvents.DAY_PASSED, this.onDayPassed);
    Events.off(GameEvents.SCHOLAR_HIRED, this.onScholarHired);
    this.initialized = false;
  }

  canRequest(): boolean {
    if (Game.state.candidateArrivalDay !== 0) return false; // in-flight
    if (Game.state.treasury < RECRUITMENT_COST) return false;
    return true;
  }

  // Spend gold, queue candidates, schedule arrival.
  request(): boolean {
    if (!this.canRequest()) return false;

    Game.state.treasury -= RECRUITMENT_COST;
    Events.emit(GameEvents.TREASURY_CHANGED, { amount: Game.state.treasury });

    Game.state.pendingCandidates = this.drawCandidates(CANDIDATE_POOL_SIZE);
    Game.state.candidateArrivalDay = Game.state.day + RECRUITMENT_DELAY_DAYS;
    Game.state.lastRecruitmentDay = Game.state.day;
    Game.save.save(Game.state);
    return true;
  }

  daysUntilArrival(): number {
    if (Game.state.candidateArrivalDay === 0) return 0;
    return Math.max(0, Game.state.candidateArrivalDay - Game.state.day);
  }

  // Draw the candidate pool. With FOUNDER_DRAW_CHANCE, ONE unhired founder
  // may take a slot; remaining slots are filled with fresh procedural
  // scholars. Founders are removed from the pool only when they're actually
  // hired (see SCHOLAR_HIRED listener), so a declined-then-drawn-again
  // founder will reappear.
  private drawCandidates(n: number): Scholar[] {
    const out: Scholar[] = [];
    const available = Game.state.availableFounderCandidates ?? [];

    // Carry the IDs already used in this draw so a founder can't fill both slots.
    const usedFounderIds = new Set<string>();
    // Also avoid drawing a founder who's already in the pending pool or active roster.
    const inFlightIds = new Set<string>([
      ...Game.state.scholars.map(s => s.id),
      ...Game.state.pendingCandidates.map(s => s.id),
      ...Game.state.currentCandidates.map(s => s.id),
    ]);

    for (let i = 0; i < n; i++) {
      const eligibleFounders = available.filter(id =>
        !usedFounderIds.has(id) && !inFlightIds.has(id),
      );
      if (eligibleFounders.length > 0 && Math.random() < FOUNDER_DRAW_CHANCE) {
        const id = eligibleFounders[Math.floor(Math.random() * eligibleFounders.length)];
        const template = findFounderCandidate(id);
        if (template) {
          // Deep-ish clone so any per-run mutations (morale tweaks at hire,
          // discipline XP, etc) don't bleed back into the static template.
          out.push(cloneFounder(template));
          usedFounderIds.add(id);
          continue;
        }
      }
      out.push(generateScholar());
    }
    return out;
  }

  private tick(day: number) {
    if (Game.state.candidateArrivalDay === 0) return;
    if (day < Game.state.candidateArrivalDay) return;

    Game.state.currentCandidates = Game.state.pendingCandidates;
    Game.state.pendingCandidates = [];
    Game.state.candidateArrivalDay = 0;
    Game.save.save(Game.state);
  }
}

// Defensive deep clone of a founder template so per-run mutations don't
// leak back into the static data array (which would corrupt save resets).
function cloneFounder(s: Scholar): Scholar {
  return {
    ...s,
    disciplines:   { ...s.disciplines },
    disciplineXp:  { ...s.disciplineXp },
    visibleTraits: [...s.visibleTraits],
    hiddenTraits:  [...s.hiddenTraits],
    hiddenTalent:  s.hiddenTalent ? { ...s.hiddenTalent } : undefined,
    beliefs:       s.beliefs ? { ...s.beliefs } : undefined,
    projectHistory: [...s.projectHistory],
  };
}
