import { Events, GameEvents } from '../game/EventBus';
import { Game } from '../game/GameManager';
import type { Work, WorkSalesState } from '../models/Work';

// Sales run for 90 days post-release, front-loaded so a strong release
// front-loads revenue (Game Dev Tycoon style). Total over the window
// roughly equals work.revenue (the projected total), with day-to-day
// variance that reflects "reception."
export const SALES_WINDOW_DAYS = 90;

// Curve parameters. The continuous density f(t) = a · exp(-t / τ) is
// normalized so ∫₀^W f(t) dt = projectedTotal. Discretized to per-day buckets.
const TAU_DAYS = 22;

export class SalesSystem {
  private readonly onDayPassed = () => this.tick();
  private initialized = false;

  init() {
    if (this.initialized) return;
    this.initialized = true;
    Events.on(GameEvents.DAY_PASSED, this.onDayPassed);
  }

  destroy() {
    if (!this.initialized) return;
    Events.off(GameEvents.DAY_PASSED, this.onDayPassed);
    this.initialized = false;
  }

  // Start the sales window for a work. Called from ProjectSystem.completeProject
  // for original (non-commission) player works.
  beginSales(work: Work, projectedTotal: number) {
    const seed = Math.floor(Math.random() * 1e9);
    const state: WorkSalesState = {
      startDay: Game.state.day,
      endDay:   Game.state.day + SALES_WINDOW_DAYS,
      projectedTotal,
      earnedTotal: 0,
      daysActive:  0,
      complete:    false,
      seed,
      dailyHistory: [],
    };
    work.salesState = state;
    // Persist the projection on the work itself too — revenue field now
    // represents the projected total, not a lump payout.
    work.revenue = projectedTotal;
  }

  // Cancel sales early (e.g. work rights sold). Marks complete; any
  // remaining projection is forfeit.
  cancelSales(workId: string) {
    const work = Game.state.completedWorks.find(w => w.id === workId);
    if (!work?.salesState || work.salesState.complete) return;
    work.salesState.complete = true;
    work.salesState.endDay = Game.state.day;
  }

  private tick() {
    if (Game.state.completedWorks.length === 0) return;

    let anyTreasuryChanged = false;
    for (const work of Game.state.completedWorks) {
      const sales = work.salesState;
      if (!sales || sales.complete) continue;

      // Compute today's sale.
      const dayIdx = Game.state.day - sales.startDay; // 0-based day index
      if (dayIdx < 0) continue;
      if (dayIdx >= SALES_WINDOW_DAYS) {
        sales.complete = true;
        continue;
      }

      const todaysSale = this.computeDailySale(sales, dayIdx);
      sales.daysActive = Math.min(SALES_WINDOW_DAYS, dayIdx + 1);
      sales.earnedTotal += todaysSale;
      // Append to per-day history for the sparkline. Initialize lazily so
      // older saves without the field still work.
      if (!sales.dailyHistory) sales.dailyHistory = [];
      sales.dailyHistory.push(todaysSale);
      Game.state.treasury += todaysSale;
      anyTreasuryChanged = true;

      Events.emit(GameEvents.WORK_SALE_TICK, {
        workId: work.id,
        workTitle: work.title,
        amount: todaysSale,
        earnedTotal: sales.earnedTotal,
        projectedTotal: sales.projectedTotal,
        daysActive: sales.daysActive,
        windowDays: SALES_WINDOW_DAYS,
      });

      // If window closed today, mark complete and fire SALES_FINISHED.
      if (sales.daysActive >= SALES_WINDOW_DAYS) {
        sales.complete = true;
        Events.emit(GameEvents.WORK_SALES_FINISHED, {
          workId: work.id,
          workTitle: work.title,
          earnedTotal: sales.earnedTotal,
          projectedTotal: sales.projectedTotal,
        });
      }
    }

    if (anyTreasuryChanged) {
      Events.emit(GameEvents.TREASURY_CHANGED, { amount: Game.state.treasury });
    }
  }

  // Compute today's sale: front-loaded exponential decay over the 90-day
  // window, normalized so the discrete sum across all 90 days equals the
  // projected total. Per-day variance is small (±15%) but deterministic
  // (PRNG seeded by the work's seed + day index) so save/load is stable.
  private computeDailySale(sales: WorkSalesState, dayIdx: number): number {
    // Density at day t (t = dayIdx + 0.5 for mid-day approximation)
    const t = dayIdx + 0.5;
    // Normalization constant — sum of exp(-i/τ) for i = 0.5 .. 89.5
    // Precomputed at module load; cached on the SalesSystem.
    if (this.norm === 0) {
      let s = 0;
      for (let i = 0; i < SALES_WINDOW_DAYS; i++) s += Math.exp(-(i + 0.5) / TAU_DAYS);
      this.norm = s;
    }
    const fraction = Math.exp(-t / TAU_DAYS) / this.norm;

    // Variance: small deterministic jitter from a hashed (seed, day) PRNG
    const jitter = 0.85 + this.seededRand(sales.seed, dayIdx) * 0.30;

    // Final day adjustment — make sure we don't overshoot or undershoot the
    // projection too far. On the last day, pay any remaining shortfall so
    // earnedTotal ≈ projectedTotal regardless of accumulated jitter.
    if (dayIdx === SALES_WINDOW_DAYS - 1) {
      return Math.max(0, Math.round(sales.projectedTotal - sales.earnedTotal));
    }

    return Math.max(0, Math.round(sales.projectedTotal * fraction * jitter));
  }

  // Deterministic small PRNG seeded by (seed, dayIdx). Returns [0, 1).
  private seededRand(seed: number, dayIdx: number): number {
    let x = (seed ^ (dayIdx * 2654435761)) | 0;
    x = Math.imul(x ^ (x >>> 16), 2246822507);
    x = Math.imul(x ^ (x >>> 13), 3266489909);
    x ^= x >>> 16;
    return ((x >>> 0) / 0xFFFFFFFF);
  }

  // Lazy-computed normalization sum.
  private norm = 0;
}
