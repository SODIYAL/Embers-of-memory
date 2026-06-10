import { Events, GameEvents } from '../game/EventBus';
import { Game } from '../game/GameManager';
import { RIVALS } from '../data/rivals';
import { WORLD_EVENTS } from '../data/worldEvents';
import { TOPICS } from '../data/topics';
import { FORMATS } from '../data/formats';
import type { Rival, RivalRelease, ActiveWorldEvent } from '../models/World';
import { SATURATION_WINDOW_DAYS } from '../models/World';
import type { Scholar } from '../models/Scholar';

const WORLD_EVENT_ROLL_INTERVAL = 120; // try to roll a new event every ~120 days
const WORLD_EVENT_TRIGGER_CHANCE = 0.55;
const POACH_ATTEMPT_CHANCE_PER_MONTH = 0.05; // per rival, per month
const RECENT_RELEASE_KEEP = 20;

export class WorldSystem {
  private readonly onDayPassed = () => this.tickDay();
  private readonly onMonthPassed = () => this.tickMonth();
  private initialized = false;

  init() {
    if (this.initialized) return;
    this.initialized = true;
    Events.on(GameEvents.DAY_PASSED, this.onDayPassed);
    Events.on(GameEvents.MONTH_PASSED, this.onMonthPassed);
  }

  destroy() {
    if (!this.initialized) return;
    Events.off(GameEvents.DAY_PASSED, this.onDayPassed);
    Events.off(GameEvents.MONTH_PASSED, this.onMonthPassed);
    this.initialized = false;
  }

  // Public lookup: topic-demand multiplier from currently-active world events.
  // Multiplied into a player work's revenue when it releases.
  topicDemandMultiplier(topicName: string): number {
    let mult = 1;
    for (const active of Game.state.world.activeWorldEvents) {
      const def = WORLD_EVENTS.find(e => e.id === active.eventId);
      if (!def?.topicDemandMod) continue;
      const m = def.topicDemandMod[topicName];
      if (m) mult *= m;
    }
    return mult;
  }

  // Public lookup: topic saturation discount from recent rival releases.
  // Returns 0.75 if a rival has published on this topic in the last
  // SATURATION_WINDOW_DAYS, else 1.0. If multiple rivals saturated, still 0.75
  // (single-stack, doesn't compound).
  topicSaturationMultiplier(topicName: string): number {
    const cutoff = Game.state.day - SATURATION_WINDOW_DAYS;
    for (const release of Game.state.world.recentReleases) {
      if (release.releaseDay >= cutoff && release.topicName === topicName) {
        return 0.75;
      }
    }
    return 1.0;
  }

  // Combined modifier; ProjectSystem multiplies this into base revenue.
  revenueModifier(topicName: string): number {
    return this.topicDemandMultiplier(topicName) * this.topicSaturationMultiplier(topicName);
  }

  // ── Daily tick: rival releases + expire world events ────────────────

  private tickDay() {
    this.maybeReleaseRivalWorks();
    this.expireWorldEvents();
    this.maybeRollWorldEvent();
  }

  private maybeReleaseRivalWorks() {
    for (const state of Game.state.world.rivals) {
      if (Game.state.day < state.nextReleaseDay) continue;
      const rival = RIVALS.find(r => r.id === state.rivalId);
      if (!rival) continue;

      this.releaseRivalWork(rival, state);
    }
  }

  private releaseRivalWork(rival: Rival, state: { rivalId: string; prestige: number; worksReleased: number; lastReleaseDay: number; nextReleaseDay: number; poachedScholarIds: string[] }) {
    // Pick a focus discipline; map to a Topic, then to a strong-fit format.
    const disc = rival.focusDisciplines[Math.floor(Math.random() * rival.focusDisciplines.length)];
    const topic = TOPICS.find(t => t.name === disc);
    if (!topic) {
      // Shouldn't happen if data is consistent; advance the cadence anyway
      state.nextReleaseDay = Game.state.day + rival.releaseCadence;
      return;
    }
    const formatId = topic.strongFormats[Math.floor(Math.random() * topic.strongFormats.length)]
                  ?? FORMATS[0].id;
    const format = FORMATS.find(f => f.id === formatId);
    const quality = 0.45 + Math.random() * 0.35; // 0.45..0.80 — competent baseline

    const release: RivalRelease = {
      rivalId: rival.id,
      rivalName: rival.name,
      topicName: topic.name,
      formatName: format?.name ?? '',
      releaseDay: Game.state.day,
      quality,
    };
    Game.state.world.recentReleases.push(release);
    if (Game.state.world.recentReleases.length > RECENT_RELEASE_KEEP) {
      Game.state.world.recentReleases.shift();
    }

    state.prestige += Math.max(2, Math.round(quality * 8));
    state.worksReleased += 1;
    state.lastReleaseDay = Game.state.day;
    // Cadence with ±20% jitter
    const jitter = 0.8 + Math.random() * 0.4;
    state.nextReleaseDay = Game.state.day + Math.round(rival.releaseCadence * jitter);

    Events.emit(GameEvents.RIVAL_RELEASED, {
      rivalId: rival.id,
      rivalName: rival.name,
      topicName: topic.name,
      formatName: format?.name ?? '',
      quality,
    });
  }

  // ── World events ───────────────────────────────────────────────────

  private maybeRollWorldEvent() {
    const w = Game.state.world;
    if (Game.state.day - w.lastWorldEventRollDay < WORLD_EVENT_ROLL_INTERVAL) return;
    w.lastWorldEventRollDay = Game.state.day;

    if (Math.random() > WORLD_EVENT_TRIGGER_CHANCE) return;

    // Pick a world event not currently in flight (allow repeats over time)
    const inFlight = new Set(w.activeWorldEvents.map(a => a.eventId));
    const candidates = WORLD_EVENTS.filter(e => !inFlight.has(e.id));
    if (candidates.length === 0) return;

    const def = candidates[Math.floor(Math.random() * candidates.length)];
    const active: ActiveWorldEvent = {
      eventId: def.id,
      startDay: Game.state.day,
      endDay: Game.state.day + def.durationDays,
    };
    w.activeWorldEvents.push(active);

    // Apply faction nudges at event start
    if (def.factionNudges) {
      for (const [k, v] of Object.entries(def.factionNudges)) {
        const key = k as 'church' | 'crown' | 'reformers';
        Game.state.ideology.factions[key] = clamp(
          Game.state.ideology.factions[key] + (v ?? 0), -100, 100,
        );
      }
    }

    Events.emit(GameEvents.WORLD_EVENT_STARTED, {
      eventId: def.id, eventName: def.name, flavor: def.flavor,
    });
  }

  private expireWorldEvents() {
    const w = Game.state.world;
    const survivors: ActiveWorldEvent[] = [];
    for (const active of w.activeWorldEvents) {
      if (Game.state.day >= active.endDay) {
        const def = WORLD_EVENTS.find(e => e.id === active.eventId);
        w.worldEventHistory.push({
          eventId: active.eventId,
          eventName: def?.name ?? active.eventId,
          startDay: active.startDay,
          endDay: active.endDay,
        });
        Events.emit(GameEvents.WORLD_EVENT_ENDED, {
          eventId: active.eventId,
          eventName: def?.name ?? active.eventId,
        });
      } else {
        survivors.push(active);
      }
    }
    w.activeWorldEvents = survivors;
  }

  // ── Monthly tick: poaching ─────────────────────────────────────────

  private tickMonth() {
    this.maybePoachScholars();
  }

  private maybePoachScholars() {
    for (const rivalState of Game.state.world.rivals) {
      if (Math.random() > POACH_ATTEMPT_CHANCE_PER_MONTH) continue;
      const rival = RIVALS.find(r => r.id === rivalState.rivalId);
      if (!rival) continue;

      const target = this.pickPoachTarget(rival);
      if (!target) continue;

      const cost = Math.max(40, Math.round(target.salary * 6));
      Events.emit(GameEvents.POACH_ATTEMPT, {
        rivalId: rival.id,
        rivalName: rival.name,
        scholarId: target.id,
        scholarName: target.name,
        counterOfferCost: cost,
      });
      // One attempt per tick — bail so multiple rivals don't all stomp simultaneously.
      return;
    }
  }

  // Score each scholar against this rival's ideology + restlessness.
  // Return the highest-scoring candidate, or undefined if no one is appealing.
  private pickPoachTarget(rival: Rival): Scholar | undefined {
    let best: { scholar: Scholar; score: number } | null = null;
    for (const scholar of Game.state.scholars) {
      if (!scholar.isAvailable) continue; // don't poach mid-project; simpler
      const score = this.poachScore(scholar, rival);
      if (score < 1.5) continue;          // minimum appeal threshold
      if (!best || score > best.score) best = { scholar, score };
    }
    return best?.scholar;
  }

  private poachScore(scholar: Scholar, rival: Rival): number {
    let score = 0;
    // Restlessness signals dissatisfaction; rivals notice.
    score += (scholar.restlessness ?? 0) * 0.5;
    if (scholar.restlessFlagged) score += 1.5;
    // Triggered fear / unfulfilled ambition makes them poach-prone
    if (scholar.fearTriggered) score += 1;
    // Discipline match: rival cares more about scholars in their focus disciplines
    if (rival.focusDisciplines.includes(scholar.primaryDiscipline)) score += 2;
    // Ideology alignment of beliefs with rival
    if (scholar.beliefs) {
      // simple proxy: pious scholar + Pious rival, etc.
      const lean = rival.ideologyLean;
      if (lean.piety && lean.piety > 0 && scholar.beliefs.spirituality === 'devout') score += 1;
      if (lean.piety && lean.piety < 0 && scholar.beliefs.spirituality === 'skeptical') score += 1;
      if (lean.tradition && lean.tradition < 0 && scholar.beliefs.epistemology === 'empirical') score += 1;
      if (lean.tradition && lean.tradition > 0 && scholar.beliefs.epistemology === 'traditional') score += 1;
      if (lean.populism && lean.populism > 0 && scholar.beliefs.knowledgeAccess === 'everyone') score += 1;
    }
    return score;
  }

  // Player resolutions for the poach modal — invoked from CampusScene.

  applyCounterOffer(rivalId: string, scholarId: string, cost: number) {
    const scholar = Game.state.scholars.find(s => s.id === scholarId);
    if (!scholar) return;
    if (Game.state.treasury < cost) {
      // Treasury fell out — they leave instead.
      this.applyLetGo(rivalId, scholarId);
      return;
    }
    Game.state.treasury -= cost;
    Events.emit(GameEvents.TREASURY_CHANGED, { amount: Game.state.treasury });
    scholar.morale = Math.min(1, (scholar.morale ?? 0.5) + 0.15);
    scholar.restlessness = Math.max(0, (scholar.restlessness ?? 0) - 2);
    scholar.restlessFlagged = false;
  }

  applyPersuade(rivalId: string, scholarId: string): boolean {
    const scholar = Game.state.scholars.find(s => s.id === scholarId);
    if (!scholar) return false;
    // Persuasion success depends on their morale + chemistry with someone
    const baseChance = 0.4 + (scholar.morale ?? 0.5) * 0.3;
    const stays = Math.random() < baseChance;
    if (stays) {
      scholar.restlessness = Math.max(0, (scholar.restlessness ?? 0) - 1);
    } else {
      this.applyLetGo(rivalId, scholarId);
    }
    return stays;
  }

  applyLetGo(rivalId: string, scholarId: string) {
    const scholar = Game.state.scholars.find(s => s.id === scholarId);
    if (!scholar) return;
    const rivalState = Game.state.world.rivals.find(r => r.rivalId === rivalId);
    if (rivalState) rivalState.poachedScholarIds.push(scholar.id);

    const rival = RIVALS.find(r => r.id === rivalId);
    Events.emit(GameEvents.SCHOLAR_POACHED, {
      rivalId,
      rivalName: rival?.name ?? 'A rival',
      scholarId: scholar.id,
      scholarName: scholar.name,
    });
    // Remove the scholar from the institution (re-use the same plumbing as voluntary leave).
    // We can't call Game's private removeScholar directly here, so we manually splice
    // and emit SCHOLAR_LEFT — CampusScene listens and updates sprites.
    Game.state.scholars = Game.state.scholars.filter(s => s.id !== scholar.id);
    Events.emit(GameEvents.SCHOLAR_LEFT, {
      scholarId: scholar.id,
      scholarName: scholar.name,
      reason: `${rival?.name ?? 'A rival institution'} has taken them in.`,
    });
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
