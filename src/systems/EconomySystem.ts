// Economy v2 — patrons, commissions, grants, upkeep, emergency measures, ledger queries.

import { Events, GameEvents } from '../game/EventBus';
import { Game } from '../game/GameManager';
import { MAJOR_PATRON_ARCHETYPES, MINOR_PATRON_NAMES, MINOR_COMMISSION_FLAVOR } from '../data/patrons';
import { TOPICS } from '../data/topics';
import { FORMATS } from '../data/formats';
import { FACILITIES, facilityById } from '../data/institution';
import { pick, chance } from '../utils/Random';
import type { MajorPatron, MinorCommission } from '../models/Economy';
import type { Work } from '../models/Work';

// Operational cost scales gently — 4 gold flat + 2 per scholar per month.
const OPS_BASE = 4;
const OPS_PER_SCHOLAR = 2;

// Facility upkeep — 25% of the facility's build cost per built tier per year, monthly slice.
// Concretely: monthly upkeep = buildCost * 0.25 / 12 * tier.
const FACILITY_UPKEEP_FRACTION = 0.25 / 12;

// Commission economics
const COMMISSION_MIN_PAYMENT = 60;
const COMMISSION_MAX_PAYMENT = 220;
const COMMISSION_OFFER_WINDOW_DAYS = 60;
const COMMISSION_OFFER_CHANCE_PER_MONTH = 0.45;

// Grant catalog — keyed by id; one-shot, prestige-gated.
export interface GrantDef {
  id: string;
  prestigeRequired: number;
  amount: number;
  flavor: string;
}
export const GRANTS: GrantDef[] = [
  {
    id: 'civic_commendation',
    prestigeRequired: 75,
    amount: 180,
    flavor: 'The city has recognized your contributions with a civic commendation, accompanied by a modest purse.',
  },
  {
    id: 'scholarly_endowment',
    prestigeRequired: 150,
    amount: 350,
    flavor: 'A retired scholar has named your institution in her will. The endowment arrives in sealed boxes.',
  },
  {
    id: 'royal_grant',
    prestigeRequired: 250,
    amount: 600,
    flavor: 'A royal seal arrives with a substantial grant — the crown wishes to be seen as a patron of letters.',
  },
];

export class EconomySystem {
  private readonly handleProjectCompleted = ({ work }: { work: Work }) => this.onProjectCompleted(work);
  private readonly onDayPassed = ({ day }: { day: number }) => this.checkCommissionExpiry(day);
  private initialized = false;

  init() {
    if (this.initialized) return;
    this.initialized = true;
    Events.on(GameEvents.PROJECT_COMPLETED, this.handleProjectCompleted);
    Events.on(GameEvents.DAY_PASSED, this.onDayPassed);
  }

  destroy() {
    if (!this.initialized) return;
    Events.off(GameEvents.PROJECT_COMPLETED, this.handleProjectCompleted);
    Events.off(GameEvents.DAY_PASSED, this.onDayPassed);
    this.initialized = false;
  }

  // ── Monthly tick (invoked from GameManager.onMonthPassed) ────────

  // Returns total stipend paid this month so GameManager can include it in TREASURY_CHANGED.
  tickMonth(): { stipendsPaid: number } {
    const stipendsPaid = this.payMajorPatronStipends();
    this.decayPatronPatience();
    this.maybeOfferMajorPatron();
    this.maybeOfferMinorCommission();
    this.claimEligibleGrants();
    return { stipendsPaid };
  }

  private payMajorPatronStipends(): number {
    let total = 0;
    for (const patron of Game.state.majorPatrons) {
      Game.state.treasury += patron.stipend;
      total += patron.stipend;
    }
    return total;
  }

  // If an expecting patron's discipline hasn't seen a recent work, patience drops.
  private decayPatronPatience() {
    if (Game.state.majorPatrons.length === 0) return;
    const cutoffDay = Game.state.day - 90; // 3 months
    const recentlyTouchedDisciplines = new Set(
      Game.state.completedWorks
        .filter(w => w.releaseDay >= cutoffDay)
        .map(w => TOPICS.find(t => t.id === w.topicId)?.name)
        .filter((n): n is string => !!n),
    );

    const survivors: MajorPatron[] = [];
    for (const patron of Game.state.majorPatrons) {
      if (patron.expectsDiscipline && !recentlyTouchedDisciplines.has(patron.expectsDiscipline)) {
        patron.patience -= 1;
      } else {
        patron.patience = Math.min(12, patron.patience + 1);
      }

      // Ideological friction (Phase 9): if the institution's stance is far
      // from the patron's preferred direction, lose extra patience.
      const ideologyDrop = this.ideologyPatienceDrop(patron);
      patron.patience = Math.max(0, patron.patience - ideologyDrop);

      if (patron.patience <= 0) {
        Events.emit(GameEvents.MAJOR_PATRON_WITHDREW, {
          patronId: patron.id,
          patronName: patron.name,
          reason: this.withdrawalReason(patron, ideologyDrop, recentlyTouchedDisciplines),
        });
      } else {
        survivors.push(patron);
      }
    }
    Game.state.majorPatrons = survivors;
  }

  // Returns 0..2 additional patience loss this month based on how far the
  // institution's current ideology is from the patron's preferred direction.
  private ideologyPatienceDrop(patron: MajorPatron): number {
    if (!patron.alignment) return 0;
    const axes = Game.state.ideology.axes;
    let conflict = 0;
    for (const [k, pref] of Object.entries(patron.alignment)) {
      if (!pref) continue;
      const stance = axes[k as keyof typeof axes] ?? 0;
      // If sign of stance opposes sign of preference, accumulate magnitude.
      if (pref > 0 && stance < -20) conflict += -stance / 100;
      if (pref < 0 && stance >  20) conflict +=  stance / 100;
    }
    if (conflict <= 0) return 0;
    if (conflict >= 1.2) return 2;
    if (conflict >= 0.5) return 1;
    return 0;
  }

  private withdrawalReason(
    patron: MajorPatron,
    ideologyDrop: number,
    recentlyTouchedDisciplines: Set<string>,
  ): string {
    if (ideologyDrop > 0) {
      return 'The institution\'s direction has drifted too far from what they value.';
    }
    if (patron.expectsDiscipline && !recentlyTouchedDisciplines.has(patron.expectsDiscipline)) {
      return `Their expectations of ${patron.expectsDiscipline} work went unmet.`;
    }
    return 'Their interest has waned.';
  }

  private maybeOfferMajorPatron() {
    // Cap: one offer in flight at a time (UI is a modal).
    // 25% chance per month of an eligible new archetype reaching out.
    if (!chance(0.25)) return;
    const eligible = MAJOR_PATRON_ARCHETYPES.filter(a =>
      !Game.state.patronArchetypesGranted.includes(a.type) &&
      Game.state.prestige >= a.prestigeRequired,
    );
    if (eligible.length === 0) return;

    const arch = pick(eligible);
    const patron: MajorPatron = {
      id: `patron_${Date.now()}`,
      archetypeKey: arch.type,
      name: arch.name,
      type: arch.type,
      stipend: arch.stipend,
      expectsDiscipline: arch.expectsDiscipline,
      joinedDay: Game.state.day,
      patience: 12,
      alignment: arch.alignment,
    };
    Game.state.patronArchetypesGranted.push(arch.type);
    Events.emit(GameEvents.MAJOR_PATRON_OFFERED, { patron, arrivalFlavor: arch.arrivalFlavor });
  }

  // Player-visible API — invoked from a modal in CampusScene.
  acceptMajorPatron(patron: MajorPatron) {
    Game.state.majorPatrons.push(patron);
    Events.emit(GameEvents.MAJOR_PATRON_ACCEPTED, { patronId: patron.id, patronName: patron.name });
    Game.save.save(Game.state);
  }

  declineMajorPatron(_patron: MajorPatron) {
    // Already counted in patronArchetypesGranted — decline is a one-shot too.
    Game.save.save(Game.state);
  }

  // ── Minor commissions ────────────────────────────────────────────

  private maybeOfferMinorCommission() {
    // Critical treasury state suspends minor commissions (the cascade effect).
    if (Game.state.treasuryWarningTier === 'critical') return;
    if (Game.state.pendingCommission || Game.state.activeCommission) return;
    if (!chance(COMMISSION_OFFER_CHANCE_PER_MONTH)) return;

    const topic  = pick(TOPICS);
    const format = pick(FORMATS);
    const payment = Math.round(
      COMMISSION_MIN_PAYMENT +
      Math.random() * (COMMISSION_MAX_PAYMENT - COMMISSION_MIN_PAYMENT)
    );
    const commission: MinorCommission = {
      id: `comm_${Date.now()}`,
      patronName: pick(MINOR_PATRON_NAMES),
      topicId: topic.id,
      formatId: format.id,
      payment,
      expiresDay: Game.state.day + COMMISSION_OFFER_WINDOW_DAYS,
      flavor: pick(MINOR_COMMISSION_FLAVOR),
    };
    Game.state.pendingCommission = commission;
    Events.emit(GameEvents.MINOR_COMMISSION_OFFERED, { commission });
  }

  acceptMinorCommission() {
    const commission = Game.state.pendingCommission;
    if (!commission) return false;
    Game.state.activeCommission = {
      commissionId: commission.id,
      topicId:      commission.topicId,
      formatId:     commission.formatId,
      payment:      commission.payment,
      patronName:   commission.patronName,
    };
    Game.state.pendingCommission = undefined;
    Events.emit(GameEvents.MINOR_COMMISSION_ACCEPTED, {
      commissionId: commission.id,
      patronName: commission.patronName,
    });
    Game.save.save(Game.state);
    return true;
  }

  declineMinorCommission() {
    const commission = Game.state.pendingCommission;
    if (!commission) return false;
    Game.state.pendingCommission = undefined;
    Events.emit(GameEvents.MINOR_COMMISSION_DECLINED, {
      commissionId: commission.id,
      patronName: commission.patronName,
    });
    Game.save.save(Game.state);
    return true;
  }

  private checkCommissionExpiry(day: number) {
    const c = Game.state.pendingCommission;
    if (c && day >= c.expiresDay) {
      Game.state.pendingCommission = undefined;
      Events.emit(GameEvents.MINOR_COMMISSION_DECLINED, {
        commissionId: c.id,
        patronName: c.patronName,
      });
    }
  }

  private onProjectCompleted(work: Work) {
    // If the work matches the active commission, pay it out.
    const active = Game.state.activeCommission;
    if (!active) return;
    if (work.topicId === active.topicId && work.formatId === active.formatId) {
      Game.state.treasury += active.payment;
      Events.emit(GameEvents.TREASURY_CHANGED, { amount: Game.state.treasury });
      Events.emit(GameEvents.MINOR_COMMISSION_COMPLETED, {
        commissionId: active.commissionId,
        patronName: active.patronName,
        payment: active.payment,
      });
      Game.state.activeCommission = undefined;
    }
    // If mismatched, the active commission stays open until the player completes another project.
  }

  // ── Grants ────────────────────────────────────────────────────────

  private claimEligibleGrants() {
    for (const grant of GRANTS) {
      if (Game.state.grantsClaimed.includes(grant.id)) continue;
      if (Game.state.prestige < grant.prestigeRequired) continue;
      Game.state.treasury += grant.amount;
      Game.state.grantsClaimed.push(grant.id);
      Events.emit(GameEvents.TREASURY_CHANGED, { amount: Game.state.treasury });
      Events.emit(GameEvents.GRANT_CLAIMED, {
        grantId: grant.id,
        amount: grant.amount,
        flavor: grant.flavor,
      });
    }
  }

  // ── Expenses / ledger ─────────────────────────────────────────────

  monthlySalaries(): number {
    return Game.state.scholars.reduce((sum, s) => sum + s.salary, 0);
  }

  monthlyFacilityUpkeep(): number {
    let total = 0;
    for (const facId of Object.keys(Game.state.facilities)) {
      const tier = Game.state.facilities[facId];
      if (tier <= 0) continue;
      const fac = facilityById(facId);
      if (!fac) continue;
      total += fac.buildCost * FACILITY_UPKEEP_FRACTION * tier;
    }
    return Math.round(total);
  }

  monthlyOperationalCost(): number {
    return OPS_BASE + OPS_PER_SCHOLAR * Game.state.scholars.length;
  }

  monthlyStipendsIncome(): number {
    return Game.state.majorPatrons.reduce((sum, p) => sum + p.stipend, 0);
  }

  // Average monthly backlist revenue from completed works that still pay.
  monthlyBacklistIncome(): number {
    return Game.state.completedWorks.reduce((sum, work) => {
      if (Game.state.workRightsSold.includes(work.id)) return sum;
      const daysSinceRelease   = Math.max(0, Game.state.day - work.releaseDay);
      const monthsSinceRelease = daysSinceRelease / 30;
      const decay              = Math.max(0, 1 - monthsSinceRelease / 24);
      return sum + work.revenue * 0.04 * decay;
    }, 0);
  }

  monthlyExpenseTotal(): number {
    return this.monthlySalaries() + this.monthlyFacilityUpkeep() + this.monthlyOperationalCost();
  }

  monthlyIncomeTotal(): number {
    return this.monthlyStipendsIncome() + this.monthlyBacklistIncome();
  }

  // Approximate runway in months at current burn (negative net) — Infinity if surplus.
  runwayMonths(): number {
    const net = this.monthlyIncomeTotal() - this.monthlyExpenseTotal();
    if (net >= 0) return Infinity;
    return Math.max(0, Math.floor(Game.state.treasury / -net));
  }

  // ── Emergency measures ───────────────────────────────────────────

  canPatronAppeal(): boolean {
    if (Game.state.patronAppealUsed) return false;
    if (Game.state.treasuryWarningTier !== 'critical') return false;
    return Game.state.majorPatrons.length > 0;
  }

  patronAppeal(): boolean {
    if (!this.canPatronAppeal()) return false;
    const amount = 200;
    Game.state.treasury += amount;
    Game.state.patronAppealUsed = true;
    // Patron patience drops sharply — they extended trust under pressure.
    for (const patron of Game.state.majorPatrons) {
      patron.patience = Math.max(0, patron.patience - 4);
    }
    Events.emit(GameEvents.TREASURY_CHANGED, { amount: Game.state.treasury });
    Events.emit(GameEvents.PATRON_APPEAL_USED, { amount });
    Game.save.save(Game.state);
    return true;
  }

  canSellWorkRights(workId: string): boolean {
    if (Game.state.workRightsSold.includes(workId)) return false;
    return Game.state.completedWorks.some(w => w.id === workId);
  }

  sellWorkRights(workId: string): boolean {
    if (!this.canSellWorkRights(workId)) return false;
    const work = Game.state.completedWorks.find(w => w.id === workId);
    if (!work) return false;

    // If the work is still selling, the lump = 70% of remaining projected
    // revenue. Cancels the sales window. Otherwise (sales done / no sales),
    // fall back to the legacy backlist heuristic.
    let amount: number;
    if (work.salesState && !work.salesState.complete) {
      const remaining = Math.max(0, work.salesState.projectedTotal - work.salesState.earnedTotal);
      amount = Math.max(Math.round(remaining * 0.70), Math.round(work.revenue * 0.25));
      // Cancel the sales window — no more daily ticks.
      work.salesState.complete = true;
      work.salesState.endDay = Game.state.day;
    } else {
      const daysSinceRelease   = Math.max(0, Game.state.day - work.releaseDay);
      const monthsSinceRelease = daysSinceRelease / 30;
      const decay              = Math.max(0, 1 - monthsSinceRelease / 24);
      const lump = Math.min(
        Math.round(work.revenue * 0.04 * decay * 18),
        Math.round(work.revenue * 3),
      );
      amount = Math.max(lump, Math.round(work.revenue * 0.5));
    }

    Game.state.treasury += amount;
    Game.state.workRightsSold.push(workId);
    Events.emit(GameEvents.TREASURY_CHANGED, { amount: Game.state.treasury });
    Events.emit(GameEvents.WORK_RIGHTS_SOLD, {
      workId, workTitle: work.title, amount,
    });
    Game.save.save(Game.state);
    return true;
  }

  // Facility list for the ledger — used by the panel.
  listBuiltFacilities() {
    return FACILITIES
      .filter(f => (Game.state.facilities[f.id] ?? 0) > 0)
      .map(f => ({
        id: f.id,
        name: f.name,
        tier: Game.state.facilities[f.id],
        monthlyUpkeep: Math.round(f.buildCost * FACILITY_UPKEEP_FRACTION * Game.state.facilities[f.id]),
      }));
  }
}
