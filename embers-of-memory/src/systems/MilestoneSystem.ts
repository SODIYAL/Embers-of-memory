// Personal milestones — fears and ambitions trigger when their hidden
// condition is met. Effects: chemistry shifts, restlessness drops or spikes,
// possibly retirement on fulfilled ambition for older scholars.

import { Events, GameEvents } from '../game/EventBus';
import { Game } from '../game/GameManager';
import { TOPICS } from '../data/topics';
import { AMBITION_TEXT, FEAR_TEXT } from '../data/scholars/milestones';
import { adjustScore } from '../game/Chemistry';
import type { Scholar } from '../models/Scholar';
import type { Work } from '../models/Work';
import {
  scholarLedWork,
  scholarParticipatedInWork,
  workAssistantsForLead,
  workParticipantIds,
} from '../models/Work';

export class MilestoneSystem {
  private readonly handleProjectCompleted = ({ work }: { work: Work }) => this.onProjectCompleted(work);
  private readonly onMonthPassed = () => this.checkLongTermMilestones();
  private initialized = false;

  init() {
    if (this.initialized) return;
    this.initialized = true;
    Events.on(GameEvents.PROJECT_COMPLETED, this.handleProjectCompleted);
    Events.on(GameEvents.MONTH_PASSED, this.onMonthPassed);
  }

  destroy() {
    if (!this.initialized) return;
    Events.off(GameEvents.PROJECT_COMPLETED, this.handleProjectCompleted);
    Events.off(GameEvents.MONTH_PASSED, this.onMonthPassed);
    this.initialized = false;
  }

  private onProjectCompleted(work: Work) {
    const topic = TOPICS.find(t => t.id === work.topicId);
    if (!topic) return;
    const quality = work.breakdown?.total ?? 0;

    for (const id of workParticipantIds(work)) {
      const scholar = Game.state.scholars.find(s => s.id === id);
      if (!scholar) continue;
      this.checkAmbitionOnProject(scholar, work, topic.name, quality, scholarLedWork(work, id));
      this.checkFearOnProject(scholar, work, topic.name);
    }
  }

  // Long-term triggers checked monthly.
  private checkLongTermMilestones() {
    for (const scholar of Game.state.scholars) {
      if (!scholar.fearTriggered) this.checkFearLongTerm(scholar);
      if (!scholar.ambitionFulfilled) this.checkAmbitionLongTerm(scholar);
    }
  }

  // ── Ambitions ────────────────────────────────────────────────────

  private checkAmbitionOnProject(scholar: Scholar, _work: Work, _topicName: string, quality: number, isLead: boolean) {
    if (scholar.ambitionFulfilled || !scholar.ambition) return;

    if (scholar.ambition === 'civilization_changing_work' && isLead && quality >= 0.85) {
      this.fulfillAmbition(scholar);
    }
  }

  private checkAmbitionLongTerm(scholar: Scholar) {
    if (!scholar.ambition) return;
    const works = Game.state.completedWorks.filter(w => scholarLedWork(w, scholar.id));

    if (scholar.ambition === 'found_school_of_thought'
        && Game.state.prestige >= 100
        && works.length >= 3) {
      this.fulfillAmbition(scholar);
    } else if (scholar.ambition === 'remembered_after_death' && works.length >= 5) {
      // Stand-in until death system exists — "remembered after death" fires as
      // "remembered for their body of work".
      this.fulfillAmbition(scholar);
    }
    // `student_surpasses_them` deferred — needs mentor/student tracking.
  }

  private fulfillAmbition(scholar: Scholar) {
    if (!scholar.ambition || scholar.ambitionFulfilled) return;
    scholar.ambitionFulfilled = true;
    scholar.restlessness = Math.max(0, scholar.restlessness - 3);
    // Chemistry +5 with every current teammate-history scholar.
    for (const other of Game.state.scholars) {
      if (other.id === scholar.id) continue;
      adjustScore(scholar.id, other.id, 5);
    }
    Events.emit(GameEvents.SCHOLAR_AMBITION_FULFILLED, {
      scholarId:   scholar.id,
      scholarName: scholar.name,
      ambition:    AMBITION_TEXT[scholar.ambition],
    });
  }

  // ── Fears ─────────────────────────────────────────────────────────

  private checkFearOnProject(scholar: Scholar, work: Work, topicName: string) {
    if (scholar.fearTriggered || !scholar.fear) return;

    if (scholar.fear === 'outshone_by_assistant' && scholarLedWork(work, scholar.id)) {
      const mySkill = scholar.disciplines[topicName] ?? 0;
      const beatenBy = workAssistantsForLead(work, scholar.id).some(aid => {
        const a = Game.state.scholars.find(s => s.id === aid);
        if (!a) return false;
        return (a.disciplines[topicName] ?? 0) > mySkill;
      });
      if (beatenBy) this.triggerFear(scholar);
    }
  }

  private checkFearLongTerm(scholar: Scholar) {
    if (!scholar.fear) return;

    if (scholar.fear === 'forgotten') {
      // No project (lead OR assistant) for 360+ days.
      const lastTouched = this.lastProjectDay(scholar);
      if (Game.state.day - lastTouched >= 360) this.triggerFear(scholar);
    } else if (scholar.fear === 'never_finish_great_work') {
      // Age 60+ with fewer than 2 completed works as lead.
      if (scholar.age >= 60) {
        const works = Game.state.completedWorks.filter(w => scholarLedWork(w, scholar.id));
        if (works.length < 2) this.triggerFear(scholar);
      }
    } else if (scholar.fear === 'discipline_irrelevant') {
      // No project on their primary discipline in 360+ days.
      const lastInDiscipline = this.lastWorkOnDiscipline(scholar.primaryDiscipline);
      if (lastInDiscipline >= 0 && Game.state.day - lastInDiscipline >= 360) this.triggerFear(scholar);
    }
  }

  private triggerFear(scholar: Scholar) {
    if (!scholar.fear || scholar.fearTriggered) return;
    scholar.fearTriggered = true;
    scholar.restlessness += 2;
    // Chemistry -5 with everyone — a scholar in crisis is hard to be around.
    for (const other of Game.state.scholars) {
      if (other.id === scholar.id) continue;
      adjustScore(scholar.id, other.id, -5);
    }
    Events.emit(GameEvents.SCHOLAR_FEAR_TRIGGERED, {
      scholarId:   scholar.id,
      scholarName: scholar.name,
      fear:        FEAR_TEXT[scholar.fear],
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────

  // Day of most recent work that touched this scholar (lead or assistant). -1 if none.
  private lastProjectDay(scholar: Scholar): number {
    let last = -1;
    for (const work of Game.state.completedWorks) {
      if (scholarParticipatedInWork(work, scholar.id) && work.releaseDay > last) {
        last = work.releaseDay;
      }
    }
    return last < 0 ? 0 : last; // 0 = never; comparable against state.day
  }

  // Day of most recent completed work on this discipline (by topic name). -1 if none.
  private lastWorkOnDiscipline(discipline: string): number {
    let last = -1;
    for (const work of Game.state.completedWorks) {
      const topic = TOPICS.find(t => t.id === work.topicId);
      if (topic?.name === discipline && work.releaseDay > last) last = work.releaseDay;
    }
    return last;
  }
}
