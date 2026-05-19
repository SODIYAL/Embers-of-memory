import { Events, GameEvents } from '../game/EventBus';
import { Game } from '../game/GameManager';
import type { Work } from '../models/Work';

// A reprint takes 45 days from start to payout.
export const REPRINT_DURATION_DAYS = 45;
// 60% of the work's original revenue.
export const REPRINT_REVENUE_FRACTION = 0.60;
// Cooldown between reprints of the same work.
export const REPRINT_COOLDOWN_DAYS = 180;

// Only "Celebrated" or "Landmark" works can be reprinted.
const ELIGIBLE_DESCRIPTORS = new Set(['A celebrated achievement', 'A landmark work']);

export class ReprintSystem {
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

  canReprint(work: Work): { ok: boolean; reason?: string } {
    if (!ELIGIBLE_DESCRIPTORS.has(work.qualityDescriptor)) {
      return { ok: false, reason: 'Only celebrated or landmark works can be reprinted.' };
    }
    // Already in flight?
    if (Game.state.activeReprints.some(r => r.workId === work.id)) {
      return { ok: false, reason: 'This work is already being reprinted.' };
    }
    // Cooldown
    const lastDay = work.lastReprintDay ?? 0;
    if (lastDay > 0 && Game.state.day - lastDay < REPRINT_COOLDOWN_DAYS) {
      const daysLeft = REPRINT_COOLDOWN_DAYS - (Game.state.day - lastDay);
      return { ok: false, reason: `This work was reprinted recently — try again in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.` };
    }
    // Rights sold? No reprint possible.
    if (Game.state.workRightsSold?.includes(work.id)) {
      return { ok: false, reason: 'The rights to this work were sold; the institution can no longer reprint it.' };
    }
    return { ok: true };
  }

  startReprint(workId: string) {
    const work = Game.state.completedWorks.find(w => w.id === workId);
    if (!work) return;
    const eligibility = this.canReprint(work);
    if (!eligibility.ok) return;

    const projectedRevenue = Math.round(work.revenue * REPRINT_REVENUE_FRACTION);
    const reprint = {
      workId: work.id,
      startDay: Game.state.day,
      finishDay: Game.state.day + REPRINT_DURATION_DAYS,
      projectedRevenue,
    };
    Game.state.activeReprints.push(reprint);

    Events.emit(GameEvents.REPRINT_STARTED, {
      workId: work.id,
      workTitle: work.title,
      finishDay: reprint.finishDay,
      projectedRevenue,
    });
  }

  private tick() {
    if (Game.state.activeReprints.length === 0) return;
    const survivors: typeof Game.state.activeReprints = [];
    for (const reprint of Game.state.activeReprints) {
      if (Game.state.day < reprint.finishDay) {
        survivors.push(reprint);
        continue;
      }
      // Payout
      const work = Game.state.completedWorks.find(w => w.id === reprint.workId);
      if (!work) continue; // shouldn't happen, but skip gracefully
      Game.state.treasury += reprint.projectedRevenue;
      work.reprints = (work.reprints ?? 0) + 1;
      work.lastReprintDay = Game.state.day;

      Events.emit(GameEvents.TREASURY_CHANGED, { amount: Game.state.treasury });
      Events.emit(GameEvents.REPRINT_COMPLETED, {
        workId: work.id,
        workTitle: work.title,
        revenue: reprint.projectedRevenue,
      });
    }
    Game.state.activeReprints = survivors;
  }
}
