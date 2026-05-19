import { Events, GameEvents } from '../game/EventBus';
import { Game } from '../game/GameManager';
import { TOPICS } from '../data/topics';
import { FORMATS } from '../data/formats';
import { IdeologySystem } from './IdeologySystem';
import { InstitutionSystem } from './InstitutionSystem';
import { WorldSystem } from './WorldSystem';
import type { Department, DepartmentProject } from '../models/GameState';
import type { Work } from '../models/Work';
import type { Scholar } from '../models/Scholar';

// Departments propose every ~75 days (60-90 jitter). Each proposal that
// accepts triggers an autonomous project that runs at the same speed-ish as
// a player project but without staging — it just ticks to completion.
const MIN_PROPOSAL_INTERVAL = 60;
const MAX_PROPOSAL_INTERVAL = 90;

// Daily base progress on a department project; modulated by head skill + facility speed.
const DEPT_BASE_PROGRESS = 0.012; // ~83 days at base, faster with skill

// Escalation chance per day on a running department project.
const ESCALATION_CHANCE_PER_DAY = 0.0035;
// After an escalation fires, the project pauses until the day-counter passes
// triggeredDay + this — auto-resolves with a small quality hit if unhandled.
const ESCALATION_AUTO_RESOLVE_DAYS = 30;

const CONTROVERSY_FLAVORS = [
  'The work\'s findings have offended a quiet but powerful party. Whispers of suppression circulate.',
  'A passage in the draft has touched on matters the city would rather forget. Letters of complaint arrive.',
];
const DISPUTE_FLAVORS = [
  'Two members of the department disagree sharply on the work\'s direction. The room is quiet, tense.',
  'A scholarly disagreement has hardened into something colder. Pages are torn, drafts re-started.',
];
const MISSING_SOURCE_FLAVORS = [
  'A crucial source proves harder to obtain than expected. Without it the work cannot progress.',
  'The library lacks a key reference. The department needs a hand securing it.',
];

const ideologyLens = new IdeologySystem();
const institutionLens = new InstitutionSystem();
const worldLens = new WorldSystem();

export class DepartmentSystem {
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

  private tick() {
    if (Game.state.departments.length === 0) return;

    // Advance active dept projects
    for (const project of [...Game.state.departmentProjects]) {
      this.advanceDepartmentProject(project);
    }

    // Maybe propose new projects (one department per tick at most)
    this.maybeProposeProject();
  }

  private advanceDepartmentProject(project: DepartmentProject) {
    // Paused on an unresolved escalation? Auto-resolve after the window.
    if (project.escalation) {
      const daysSince = Game.state.day - project.escalation.triggeredDay;
      if (daysSince >= ESCALATION_AUTO_RESOLVE_DAYS) {
        // Unhandled: a small progress refund but a quality penalty later.
        project.escalation = undefined;
      } else {
        return; // stay paused
      }
    }

    const head = Game.state.scholars.find(s => s.id === project.leadScholarId);
    if (!head) {
      this.cleanupBrokenProject(project);
      return;
    }
    const topic = TOPICS.find(t => t.id === project.topicId);
    if (!topic) return;

    const skill = head.disciplines[topic.name] ?? 1;
    const speedMul = 1 + skill / 25;
    const facilitySpeed = 1 + institutionLens.effectMagnitude('project_speed');
    project.progress = Math.min(1, project.progress + DEPT_BASE_PROGRESS * speedMul * facilitySpeed);

    // Random escalation
    if (Math.random() < ESCALATION_CHANCE_PER_DAY) {
      this.triggerEscalation(project);
    }

    if (project.progress >= 1) {
      this.completeDepartmentProject(project);
    }
  }

  private triggerEscalation(project: DepartmentProject) {
    const roll = Math.random();
    const kind: DepartmentProject['escalation'] extends infer T ? T extends { kind: infer K } ? K : never : never =
      roll < 0.40 ? 'controversy'
      : roll < 0.75 ? 'dispute'
      :              'missing_source';
    const flavorPool = kind === 'controversy'  ? CONTROVERSY_FLAVORS
                     : kind === 'dispute'      ? DISPUTE_FLAVORS
                     :                            MISSING_SOURCE_FLAVORS;
    const flavor = flavorPool[Math.floor(Math.random() * flavorPool.length)];
    project.escalation = { kind, flavor, triggeredDay: Game.state.day };

    const dept = Game.state.departments.find(d => d.id === project.departmentId);
    Events.emit(GameEvents.DEPARTMENT_PROJECT_ESCALATED, {
      departmentId: project.departmentId,
      departmentName: dept?.name ?? 'A department',
      projectId: project.id,
      kind,
      flavor,
    });
  }

  // Called by CampusScene when the player resolves an escalation with treasury.
  resolveEscalation(projectId: string, paid: boolean) {
    const project = Game.state.departmentProjects.find(p => p.id === projectId);
    if (!project || !project.escalation) return;

    if (paid) {
      const cost = project.escalation.kind === 'missing_source' ? 60
                 : project.escalation.kind === 'controversy'    ? 80
                 :                                                40;
      Game.state.treasury -= cost;
      Events.emit(GameEvents.TREASURY_CHANGED, { amount: Game.state.treasury });
    } else {
      // Unhandled now: dock progress, hit morale, the escalation persists
      // until the auto-resolve window.
      const dept = Game.state.departments.find(d => d.id === project.departmentId);
      if (dept) dept.morale = Math.max(0, dept.morale - 0.1);
      project.progress = Math.max(0, project.progress - 0.05);
    }
    project.escalation = undefined;
  }

  private completeDepartmentProject(project: DepartmentProject) {
    const dept = Game.state.departments.find(d => d.id === project.departmentId);
    const topic = TOPICS.find(t => t.id === project.topicId);
    const format = FORMATS.find(f => f.id === project.formatId);
    const head = Game.state.scholars.find(s => s.id === project.leadScholarId);
    if (!dept || !topic || !format || !head) {
      this.cleanupBrokenProject(project);
      return;
    }

    // Quality: head skill + small institutional bonus + small variance
    const skill = head.disciplines[topic.name] ?? 1;
    const skillScore = (skill / 10) * 0.55;
    const synergyMod = topic.strongFormats.includes(project.formatId) ? 0.15
                     : topic.weakFormats.includes(project.formatId)   ? -0.10
                     : 0;
    const institutionBonus =
      institutionLens.effectMagnitude('quality_bonus') +
      institutionLens.effectMagnitude('topic_quality', topic.name) +
      institutionLens.departmentQualityBonus(topic.name);
    const variance = (Math.random() - 0.5) * 0.08;
    const moraleMod = (dept.morale - 0.5) * 0.1;
    const quality = Math.max(0, Math.min(1, skillScore + synergyMod + institutionBonus + variance + moraleMod));

    const worldMod = worldLens.revenueModifier(topic.name);
    const revenue = Math.round((BASE_REVENUE[project.formatId] ?? 50) * (0.4 + quality) * worldMod);

    const work: Work = {
      id: `work_dept_${Date.now()}`,
      title: `${format.name} on ${topic.name}`,
      topicId: project.topicId,
      formatId: project.formatId,
      leadScholarId: project.leadScholarId,
      assistantScholarIds: [...project.assistantScholarIds],
      qualityDescriptor: qualityDescriptor(quality),
      revenue,
      releaseDay: Game.state.day,
      flavorReaction: `Brought forth by ${dept.name}, with little fanfare and quiet competence.`,
    };

    // Compute ideology imprint from topic+format only (no priorities for dept works)
    work.ideologyImprint = ideologyLens.computeImprint({
      // Minimal Project shape good enough for computeImprint
      id: project.id,
      topicId: project.topicId,
      formatId: project.formatId,
      leadScholarId: project.leadScholarId,
      assistantScholarIds: project.assistantScholarIds,
      priorities: {},
      state: 'complete',
      progress: 1,
      qualityScore: quality,
      startDay: project.startDay,
      currentStageIndex: 0,
      stages: [{
        key: 'research',
        leadScholarId: project.leadScholarId,
        assistantScholarIds: project.assistantScholarIds,
        qualitySlice: quality,
        startDay: project.startDay,
      }],
    });
    ideologyLens.applyImprint(work.ideologyImprint);
    const finalRevenue = ideologyLens.evaluateRelease(work);
    work.revenue = finalRevenue;

    Game.state.completedWorks.push(work);
    Game.state.treasury += finalRevenue;
    Game.state.prestige += Math.max(1, Math.round(quality * 6)); // dept works less prestige than player works

    // Free up the team
    head.isAvailable = true;
    for (const aid of project.assistantScholarIds) {
      const a = Game.state.scholars.find(s => s.id === aid);
      if (a) a.isAvailable = true;
    }

    // Department state
    dept.activeProjectId = undefined;
    dept.morale = Math.min(1, dept.morale + (quality - 0.4) * 0.15);

    // Remove from active list
    Game.state.departmentProjects = Game.state.departmentProjects.filter(p => p.id !== project.id);

    Events.emit(GameEvents.TREASURY_CHANGED, { amount: Game.state.treasury });
    Events.emit(GameEvents.DEPARTMENT_PROJECT_COMPLETED, {
      departmentId: dept.id,
      departmentName: dept.name,
      work,
    });
    Events.emit(GameEvents.WORK_RELEASED, { work });
  }

  private cleanupBrokenProject(project: DepartmentProject) {
    // Head or topic disappeared — release any captives and drop the project.
    for (const aid of project.assistantScholarIds) {
      const a = Game.state.scholars.find(s => s.id === aid);
      if (a) a.isAvailable = true;
    }
    const head = Game.state.scholars.find(s => s.id === project.leadScholarId);
    if (head) head.isAvailable = true;
    Game.state.departmentProjects = Game.state.departmentProjects.filter(p => p.id !== project.id);
    const dept = Game.state.departments.find(d => d.id === project.departmentId);
    if (dept) dept.activeProjectId = undefined;
  }

  private maybeProposeProject() {
    // Only one outstanding proposal at a time (the modal blocks gameplay).
    // We don't track a proposal id in state; instead we just skip if any
    // department is mid-proposal (lastProposalDay set very recently with no project).
    for (const dept of Game.state.departments) {
      if (dept.activeProjectId) continue;
      const lastDay = dept.lastProposalDay ?? dept.foundedDay;
      // Stagger by inter-department jitter so they don't all propose the same day.
      const interval = MIN_PROPOSAL_INTERVAL + (hashStr(dept.id) % (MAX_PROPOSAL_INTERVAL - MIN_PROPOSAL_INTERVAL));
      if (Game.state.day - lastDay < interval) continue;

      const head = Game.state.scholars.find(s => s.id === dept.headScholarId);
      if (!head || !head.isAvailable) continue;

      // Pick assistants from other department members (excluding head). 1-2 needed.
      const candidates = Game.state.scholars.filter(s =>
        s.id !== head.id && s.isAvailable && s.primaryDiscipline === dept.discipline,
      );
      if (candidates.length === 0) {
        // Skip without consuming the cooldown — they'll try again next day.
        continue;
      }

      const proposal = this.composeProposal(dept, head);
      if (!proposal) continue;

      dept.lastProposalDay = Game.state.day;
      Events.emit(GameEvents.DEPARTMENT_PROJECT_PROPOSED, {
        departmentId: dept.id,
        departmentName: dept.name,
        headName: head.name,
        topicName: TOPICS.find(t => t.id === proposal.topicId)?.name ?? '',
        formatName: FORMATS.find(f => f.id === proposal.formatId)?.name ?? '',
        proposalId: proposal.id,
      });
      // Stash the proposal as a "pending" project so accepting just flips a flag.
      // We use the activeProjectId field for this; if rejected, we'll clear it.
      this.pendingProposals.set(proposal.id, { dept, head, project: proposal });

      // Only one department proposes per tick.
      return;
    }
  }

  // Map of proposalId -> the data we need to materialize the project on accept.
  private pendingProposals: Map<string, { dept: Department; head: Scholar; project: DepartmentProject }> = new Map();

  acceptProposal(proposalId: string) {
    const entry = this.pendingProposals.get(proposalId);
    if (!entry) return;
    const { dept, head, project } = entry;
    this.pendingProposals.delete(proposalId);

    // Lock head + 1-2 assistants
    head.isAvailable = false;
    const assistants = project.assistantScholarIds
      .map(id => Game.state.scholars.find(s => s.id === id))
      .filter((s): s is Scholar => !!s && s.isAvailable);
    for (const a of assistants) a.isAvailable = false;
    project.assistantScholarIds = assistants.map(a => a.id);
    project.startDay = Game.state.day;

    Game.state.departmentProjects.push(project);
    dept.activeProjectId = project.id;
    Events.emit(GameEvents.DEPARTMENT_PROJECT_STARTED, {
      departmentId: dept.id,
      projectId: project.id,
    });
  }

  declineProposal(proposalId: string) {
    const entry = this.pendingProposals.get(proposalId);
    if (!entry) return;
    const { dept } = entry;
    this.pendingProposals.delete(proposalId);
    dept.morale = Math.max(0, dept.morale - 0.08);
  }

  private composeProposal(dept: Department, head: Scholar): DepartmentProject | null {
    // Pick a topic that matches the dept's discipline. If multiple topics share
    // the discipline name, pick one at random; else fall back to first matching.
    const matching = TOPICS.filter(t => t.name === dept.discipline);
    const topic = matching.length > 0
      ? matching[Math.floor(Math.random() * matching.length)]
      : TOPICS.find(t => t.name === head.primaryDiscipline);
    if (!topic) return null;

    // Format: prefer a strong-fit format
    const format = topic.strongFormats[Math.floor(Math.random() * topic.strongFormats.length)]
                ?? FORMATS[0].id;

    // Assistants: up to 2 other dept members (sharing discipline) — we record
    // the IDs of currently-available candidates; they'll be re-locked at accept.
    const candidates = Game.state.scholars
      .filter(s => s.id !== head.id && s.isAvailable && s.primaryDiscipline === dept.discipline)
      .slice(0, 2);

    return {
      id: `dept_proj_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      departmentId: dept.id,
      topicId: topic.id,
      formatId: format,
      leadScholarId: head.id,
      assistantScholarIds: candidates.map(c => c.id),
      progress: 0,
      startDay: Game.state.day,
    };
  }
}

// Stable hash so each department gets a consistent jitter into its proposal interval.
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Same base revenue table as ProjectSystem; kept local to avoid a circular import.
// Mirrors ProjectSystem.BASE_REVENUE; bumped in the Phase 12.5 rebalance.
const BASE_REVENUE: Record<string, number> = {
  atlas:                  160,
  hymn:                    80,
  educational_handbook:   110,
  philosophical_treatise: 130,
  scientific_compendium:  140,
  epic_poetry:            100,
};

function qualityDescriptor(score: number): string {
  if (score >= 0.85) return 'A landmark work';
  if (score >= 0.70) return 'A celebrated achievement';
  if (score >= 0.55) return 'A respected contribution';
  if (score >= 0.40) return 'A competent work';
  if (score >= 0.25) return 'A modest effort';
  return 'A flawed but earnest attempt';
}
