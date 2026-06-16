import { Events, GameEvents } from '../game/EventBus';
import { Game } from '../game/GameManager';
import { TOPICS } from '../data/topics';
import { FORMATS } from '../data/formats';
import { MID_FLAVOR_30, MID_FLAVOR_70, pickFlavor, pickChoiceEvent } from '../data/projects/midEvents';
import { adjustScore, incrementShared, getBand, getScore, BAND_QUALITY_DELTA, pairs } from '../game/Chemistry';
import { InstitutionSystem } from './InstitutionSystem';
import { IdeologySystem } from './IdeologySystem';
import { WorldSystem } from './WorldSystem';
import { SalesSystem } from './SalesSystem';
import type { Project, StageRecord } from '../models/Project';
import { STAGE_ORDER, STAGE_INFO, PRIORITY_POOL } from '../models/Project';
import { normalizeEmphasis, getIdealMix, matchScore, matchSliceModifier } from '../data/stageEmphasis';
import type { Scholar } from '../models/Scholar';
import type { Work, QualityBreakdown } from '../models/Work';

const institutionLens = new InstitutionSystem();
const ideologyLens    = new IdeologySystem();
const worldLens       = new WorldSystem();
const salesLens       = new SalesSystem();

// Doubled in Phase 12.5 (economy rebalance) so a Competent player work
// pays back ~2 months of one scholar's salary.
const BASE_REVENUE: Record<string, number> = {
  atlas:                  160,
  hymn:                    80,
  educational_handbook:   110,
  philosophical_treatise: 130,
  scientific_compendium:  140,
  epic_poetry:            100,
};

const QUALITY_DESCRIPTORS: [number, string][] = [
  [0.85, 'A landmark work'],
  [0.70, 'A celebrated achievement'],
  [0.55, 'A respected contribution'],
  [0.40, 'A competent work'],
  [0.25, 'A modest effort'],
  [0.00, 'A flawed but earnest attempt'],
];

const FLAVOR_REACTIONS: Record<string, string[]> = {
  landmark:    ["Word is spreading quickly. Travellers are asking for copies before the ink has dried."],
  celebrated:  ["The scholars of the city have taken notice. Several have written letters of admiration."],
  respected:   ["A steady stream of buyers. The work earns its place in any serious collection."],
  competent:   ["Solid work. It sells modestly and earns quiet respect."],
  modest:      ["Few have noticed. The work sells slowly, to those who need it."],
  flawed:      ["The reception is cool. The subject matter finds a small audience."],
};

// XP needed to advance from currentSkill to currentSkill+1
function xpThreshold(currentSkill: number): number {
  return 20 + currentSkill * 15;
}

function flavorTier(score: number): string {
  if (score >= 0.85) return 'landmark';
  if (score >= 0.70) return 'celebrated';
  if (score >= 0.55) return 'respected';
  if (score >= 0.40) return 'competent';
  if (score >= 0.25) return 'modest';
  return 'flawed';
}

function qualityDescriptor(score: number): string {
  for (const [threshold, label] of QUALITY_DESCRIPTORS) {
    if (score >= threshold) return label;
  }
  return QUALITY_DESCRIPTORS[QUALITY_DESCRIPTORS.length - 1][1];
}

export class ProjectSystem {
  private firedAt30 = false;
  private firedAt50 = false;
  private firedAt70 = false;
  private readonly onDayPassed = () => this.tick();
  private readonly onProjectCancelled = () => this.resetMidEventFlags();
  private initialized = false;

  init() {
    if (this.initialized) return;
    this.initialized = true;
    const p = Game.state.activeProject;
    if (p) {
      this.firedAt30 = p.progress >= 0.30;
      this.firedAt50 = p.progress >= 0.50;
      this.firedAt70 = p.progress >= 0.70;
    }
    Events.on(GameEvents.DAY_PASSED, this.onDayPassed);
    Events.on(GameEvents.PROJECT_CANCELLED, this.onProjectCancelled);
  }

  destroy() {
    if (!this.initialized) return;
    Events.off(GameEvents.DAY_PASSED, this.onDayPassed);
    Events.off(GameEvents.PROJECT_CANCELLED, this.onProjectCancelled);
    this.initialized = false;
  }

  private resetMidEventFlags() {
    this.firedAt30 = false;
    this.firedAt50 = false;
    this.firedAt70 = false;
  }

  private tick() {
    this.recoverIdleScholars();

    const project = Game.state.activeProject;
    if (!project || project.state !== 'in_development') return;

    this.advanceProgress(project);
    this.checkMidEvents(project);

    // Stage gate check — pause at end of stages 1 and 2 to let player pick next lead.
    const stageEnd = (project.currentStageIndex + 1) / STAGE_ORDER.length;
    if (project.progress >= stageEnd) {
      project.progress = stageEnd;
      this.closeCurrentStage(project);
      if (project.currentStageIndex + 1 < STAGE_ORDER.length) {
        this.openStageGate(project);
      } else {
        this.completeProject(project);
      }
    }
  }

  // ── Stage transitions ────────────────────────────────────────────

  // Compute the quality slice for the stage that just finished and store it
  // in the current StageRecord. Then mark its endDay.
  private closeCurrentStage(project: Project) {
    const stage = project.stages[project.stages.length - 1];
    if (!stage || stage.endDay !== undefined) return;
    stage.qualitySlice = this.computeStageQualitySlice(project, stage);
    stage.endDay = Game.state.day;
  }

  private openStageGate(project: Project) {
    project.state = 'awaiting_stage_lead';
    // Release the just-finished stage's team so all of them appear as
    // candidates in the StageGate modal. beginNextStage() will re-busy
    // whoever ends up on the new stage.
    this.releaseStageTeam(project);
    const completed = project.stages[project.stages.length - 1];
    const nextKey = STAGE_ORDER[project.currentStageIndex + 1];
    Events.emit(GameEvents.PROJECT_STAGE_GATE, {
      project, completedStage: completed, nextStageKey: nextKey,
    });
  }

  // Called by CampusScene/StageGateModal when the player chooses a lead for
  // the next stage. All other available scholars are auto-assigned as
  // assistants for this stage.
  beginNextStage(
    leadScholarId: string,
    framing?: import('../models/Ideology').IdeologyVector,
    emphasis?: Record<string, number>,
  ) {
    const project = Game.state.activeProject;
    if (!project || project.state !== 'awaiting_stage_lead') return;
    if (project.currentStageIndex + 1 >= STAGE_ORDER.length) return;

    const lead = Game.state.scholars.find(s => s.id === leadScholarId);
    if (!lead) return;

    // Previous stage's team was already released in openStageGate, so all
    // scholars who weren't off-project are currently idle. Re-busy the new
    // team below.
    project.currentStageIndex += 1;
    const stageKey = STAGE_ORDER[project.currentStageIndex];

    lead.isAvailable = false;
    const assistants = Game.state.scholars.filter(
      s => s.id !== lead.id && s.isAvailable,
    );
    for (const a of assistants) a.isAvailable = false;

    const assistantIds = assistants.map(a => a.id);
    project.assistantScholarIds = assistantIds;

    const stage: StageRecord = {
      key: stageKey,
      leadScholarId: lead.id,
      assistantScholarIds: [...assistantIds],
      qualitySlice: 0,
      startDay: Game.state.day,
      framing,
      emphasis,
    };
    project.stages.push(stage);

    project.state = 'in_development';
    Events.emit(GameEvents.PROJECT_STAGE_STARTED, {
      project, stageKey, leadScholarId: lead.id,
    });
  }

  // Mark current stage's lead + assistants as available again, so the new
  // stage can claim a fresh team from the idle pool.
  private releaseStageTeam(project: Project) {
    const lead = Game.state.scholars.find(s => s.id === project.leadScholarId);
    if (lead) lead.isAvailable = true;
    for (const aid of project.assistantScholarIds) {
      const a = Game.state.scholars.find(s => s.id === aid);
      if (a) a.isAvailable = true;
    }
    // Note: project.leadScholarId is the NOMINAL/initial lead; the actual
    // current-stage lead is in the latest StageRecord. Use that for accuracy:
    const lastStage = project.stages[project.stages.length - 1];
    if (lastStage) {
      const stageLead = Game.state.scholars.find(s => s.id === lastStage.leadScholarId);
      if (stageLead) stageLead.isAvailable = true;
      for (const aid of lastStage.assistantScholarIds) {
        const a = Game.state.scholars.find(s => s.id === aid);
        if (a) a.isAvailable = true;
      }
    }
  }

  // Per-stage quality slice — uses the stage's recorded lead + assistants,
  // weighted by stage emphasis vs the project's priorities. Capped at ~0.4
  // so the three slices roughly sum into the 0..1 quality range.
  private computeStageQualitySlice(project: Project, stage: StageRecord): number {
    const topic = TOPICS.find(t => t.id === project.topicId)!;
    const lead = Game.state.scholars.find(s => s.id === stage.leadScholarId);
    if (!lead) return 0;

    const leadSkill = (lead.disciplines[topic.name] ?? 1) / 10;
    let slice = leadSkill * 0.22;

    // Assistant contribution — diminishing returns
    const diminish = [0.6, 0.4, 0.25];
    stage.assistantScholarIds.forEach((aid, i) => {
      const a = Game.state.scholars.find(s => s.id === aid);
      if (!a) return;
      const aSkill = (a.disciplines[topic.name] ?? 0) / 10;
      const factor = diminish[Math.min(i, diminish.length - 1)];
      slice += aSkill * 0.06 * factor;
    });

    // Stage emphasis vs project priorities — points spent on emphasized axes
    // boost this stage's slice; misaligned priorities give less.
    const info = STAGE_INFO[stage.key];
    let emphasis = 0;
    for (const axis of info.emphasizes) {
      emphasis += project.priorities[axis] ?? 0;
    }
    slice += (emphasis / PRIORITY_POOL) * 0.05;

    // Per-stage emphasis vs hidden ideal mix. Player allocated points across
    // this stage's 3 axes; we score how closely they match the recipe for
    // this topic+format+stage. Match → slice bonus; mismatch → penalty.
    if (stage.emphasis) {
      const player = normalizeEmphasis(stage.emphasis, stage.key);
      const ideal  = getIdealMix(project.topicId, project.formatId, stage.key);
      const score  = matchScore(player, ideal, stage.key);
      stage.emphasisMatch = score;
      slice += matchSliceModifier(score);
    }

    // Wellbeing penalty for the stage lead (mild)
    const stress = lead.stress ?? 0;
    const exhaustion = lead.exhaustion ?? 0;
    if (stress > 0.6) slice -= (stress - 0.6) * 0.05;
    if (exhaustion > 0.6) slice -= (exhaustion - 0.6) * 0.05;

    // Synergy
    if (topic.strongFormats.includes(project.formatId)) slice += 0.04;
    else if (topic.weakFormats.includes(project.formatId)) slice -= 0.02;

    return Math.max(0, Math.min(0.46, slice));
  }

  // Idle scholars recover stress and exhaustion each day. Resting scholars
  // recover faster — the player has explicitly told them to take time off.
  // When a resting scholar reaches 0 on both axes, the rest auto-ends and
  // they become available again.
  private recoverIdleScholars() {
    const moraleBoost = institutionLens.effectMagnitude('morale_recovery');
    for (const scholar of Game.state.scholars) {
      // Recovery applies to both idle-available and resting scholars; skip
      // only those locked on an active project.
      if (!scholar.isAvailable && !scholar.isResting) continue;
      const restMul = scholar.isResting ? 3 : 1;
      scholar.exhaustion = Math.max(0, (scholar.exhaustion ?? 0) - (0.012 + moraleBoost) * restMul);
      scholar.stress     = Math.max(0, (scholar.stress     ?? 0) - 0.008 * restMul);
      if (scholar.isResting && (scholar.exhaustion ?? 0) <= 0 && (scholar.stress ?? 0) <= 0) {
        scholar.isResting = false;
        scholar.isAvailable = true;
        Events.emit(GameEvents.SCHOLAR_REST_ENDED, { scholarId: scholar.id });
      }
    }
  }

  private advanceProgress(project: Project) {
    const format  = FORMATS.find(f => f.id === project.formatId)!;
    const topic   = TOPICS.find(t => t.id === project.topicId)!;

    // Current stage's lead drives the speed — not the nominal project owner.
    const currentStage = project.stages[project.stages.length - 1];
    const leadId = currentStage?.leadScholarId ?? project.leadScholarId;
    const lead = Game.state.scholars.find(s => s.id === leadId);
    if (!lead) return;

    const skill = lead.disciplines[topic.name] ?? 1;

    const exhaustion = lead.exhaustion ?? 0;
    const speedMod   = exhaustion > 0.7 ? 1 - (exhaustion - 0.7) * 0.5 : 1;
    const facilitySpeed = 1 + institutionLens.effectMagnitude('project_speed');
    const speed      = (1 + skill / 20) * speedMod * facilitySpeed;
    project.progress = Math.min(1, project.progress + speed / format.baseDuration);

    this.applyDailyWellbeingAndXp(lead, topic.name, /* isLead */ true);

    for (const assistantId of project.assistantScholarIds) {
      const assistant = Game.state.scholars.find(s => s.id === assistantId);
      if (!assistant) continue;
      this.applyDailyWellbeingAndXp(assistant, topic.name, /* isLead */ false);
    }

    Events.emit(GameEvents.PROJECT_PROGRESS, { progress: project.progress });
  }

  private applyDailyWellbeingAndXp(scholar: Scholar, topicName: string, isLead: boolean) {
    const exhaustionRate = isLead ? 0.008 : 0.0048;   // assistants take 60% load
    const xpRate         = isLead ? 1.0   : 0.5;       // assistants get half XP

    const isPrimary   = scholar.primaryDiscipline   === topicName;
    const isSecondary = scholar.secondaryDiscipline === topicName;
    scholar.exhaustion = Math.min(1, (scholar.exhaustion ?? 0) + exhaustionRate);
    if (isPrimary) {
      scholar.stress = Math.max(0, (scholar.stress ?? 0) - 0.004);
    } else if (!isSecondary) {
      scholar.stress = Math.min(1, (scholar.stress ?? 0) + 0.007);
    }

    const xpGained = (1 + Math.random() * 1.5) * xpRate;
    this.gainXp(scholar, topicName, xpGained);
  }

  // Award XP and check for skill level-up
  private gainXp(scholar: Scholar, topicName: string, amount: number) {
    if (!scholar.disciplineXp) scholar.disciplineXp = {};
    scholar.disciplineXp[topicName] = (scholar.disciplineXp[topicName] ?? 0) + amount;

    const currentSkill = scholar.disciplines[topicName] ?? 0;
    if (currentSkill >= 10) return;

    const threshold = xpThreshold(currentSkill);
    if (scholar.disciplineXp[topicName] >= threshold) {
      scholar.disciplineXp[topicName] -= threshold;
      scholar.disciplines[topicName] = currentSkill + 1;
      Events.emit(GameEvents.SCHOLAR_SKILL_UP, {
        scholarId: scholar.id,
        topic:     topicName,
        newLevel:  currentSkill + 1,
      });
    }
  }

  private checkMidEvents(project: Project) {
    const currentStage = project.stages[project.stages.length - 1];
    const leadId = currentStage?.leadScholarId ?? project.leadScholarId;
    const scholar = Game.state.scholars.find(s => s.id === leadId);
    if (!scholar) return;

    if (!this.firedAt30 && project.progress >= 0.30) {
      this.firedAt30 = true;
      Events.emit(GameEvents.MID_PROJECT_EVENT, {
        scholarName: scholar.name,
        text: pickFlavor(MID_FLAVOR_30, scholar.name),
      });
    }

    // 50% choice event — 60% chance to fire when crossing the threshold
    if (!this.firedAt50 && project.progress >= 0.50) {
      this.firedAt50 = true;
      if (Math.random() < 0.60) {
        const choiceDef = pickChoiceEvent(scholar.name);
        Events.emit(GameEvents.MID_PROJECT_EVENT, {
          scholarName: scholar.name,
          text: choiceDef.prompt,
          choice: {
            prompt: choiceDef.prompt,
            options: choiceDef.options.map(o => ({ label: o.label, effect: o.effect })),
          },
        });
      }
    }

    if (!this.firedAt70 && project.progress >= 0.70) {
      this.firedAt70 = true;
      Events.emit(GameEvents.MID_PROJECT_EVENT, {
        scholarName: scholar.name,
        text: pickFlavor(MID_FLAVOR_70, scholar.name),
      });
    }
  }

  applyMidEventChoice(effect: 'push' | 'rest' | 'ignore') {
    const project = Game.state.activeProject;
    if (!project) return;
    const currentStage = project.stages[project.stages.length - 1];
    const leadId = currentStage?.leadScholarId ?? project.leadScholarId;
    const scholar = Game.state.scholars.find(s => s.id === leadId);
    if (!scholar) return;

    if (effect === 'push') {
      project.progress = Math.min(1, project.progress + 0.05);
      scholar.exhaustion = Math.min(1, (scholar.exhaustion ?? 0) + 0.15);
      scholar.stress     = Math.min(1, (scholar.stress     ?? 0) + 0.10);
      Events.emit(GameEvents.PROJECT_PROGRESS, { progress: project.progress });
    } else if (effect === 'rest') {
      scholar.exhaustion = Math.max(0, (scholar.exhaustion ?? 0) - 0.08);
      scholar.stress     = Math.max(0, (scholar.stress     ?? 0) - 0.04);
    }
    // 'ignore' — no-op
  }

  private completeProject(project: Project) {
    project.state    = 'complete';
    project.progress = 1;

    // Make sure the final stage's slice is computed
    this.closeCurrentStage(project);

    const breakdown      = this.calculateQuality(project);
    const quality        = breakdown.total;
    project.qualityScore = quality;

    const topic = TOPICS.find(t => t.id === project.topicId)!;
    const baseXp = 10 + quality * 20;
    const xpByScholar: Record<string, number> = {};

    const work = this.buildWork(project, breakdown, baseXp);
    Game.state.completedWorks.push(work);
    Game.state.activeProject = undefined;

    Game.state.prestige += Math.round(quality * 10);

    // Walk every stage record and award XP to each participant. Stage leads
    // get a full burst (one per stage they led); assistants get half.
    // If the same scholar appears in multiple stages, their burst stacks.
    const participantStageRoles = new Map<string, { lead: number; asst: number }>();
    for (const stage of project.stages) {
      const role = participantStageRoles.get(stage.leadScholarId)
        ?? { lead: 0, asst: 0 };
      role.lead += 1;
      participantStageRoles.set(stage.leadScholarId, role);
      for (const aid of stage.assistantScholarIds) {
        const r = participantStageRoles.get(aid) ?? { lead: 0, asst: 0 };
        r.asst += 1;
        participantStageRoles.set(aid, r);
      }
    }

    for (const [scholarId, role] of participantStageRoles) {
      const scholar = Game.state.scholars.find(s => s.id === scholarId);
      if (!scholar) continue;
      const xp = baseXp * (role.lead + role.asst * 0.5) / STAGE_ORDER.length;
      this.finalizeParticipant(scholar, topic.name, xp, work.id);
      xpByScholar[scholarId] = Math.round(xp);
    }

    work.xpByScholar = xpByScholar;

    // Ideological imprint: compute, stamp the work, drift the institution.
    const imprint = ideologyLens.computeImprint(project);
    work.ideologyImprint = imprint;
    ideologyLens.applyImprint(imprint);

    // Suppression check may reduce projected revenue before sales begin.
    // Patronage offers are also evaluated here.
    const finalRevenue = ideologyLens.evaluateRelease(work);
    work.revenue = finalRevenue;

    if (project.isCommission) {
      // Commission works pay a flat guaranteed sum credited by EconomySystem
      // when PROJECT_COMPLETED fires — but we ALSO credit work.revenue here
      // (a "release bonus" from organic sales). For commissioned works, treat
      // revenue as a small lump sum so the player doesn't double-dip on sales.
      // We halve it to reflect the work being commissioned rather than freely
      // distributed; the commission payment is the real reward.
      const commissionBonus = Math.round(finalRevenue * 0.4);
      work.revenue = commissionBonus;
      Game.state.treasury += commissionBonus;
      Events.emit(GameEvents.TREASURY_CHANGED, { amount: Game.state.treasury });
    } else {
      // Original work — start the 90-day sales window. Treasury credits
      // daily via SalesSystem.
      salesLens.beginSales(work, finalRevenue);
    }

    this.updateChemistry(project, quality);
    this.resetMidEventFlags();

    Events.emit(GameEvents.PROJECT_COMPLETED, { work });
  }

  private updateChemistry(project: Project, quality: number) {
    const teamIds = new Set<string>();
    for (const stage of project.stages) {
      teamIds.add(stage.leadScholarId);
      for (const aid of stage.assistantScholarIds) teamIds.add(aid);
    }
    const validIds = Array.from(teamIds).filter(id => Game.state.scholars.some(s => s.id === id));
    for (const [a, b] of pairs(validIds)) {
      incrementShared(a, b);
      const delta = (quality - 0.5) * 10 + (Math.random() - 0.5) * 6;
      adjustScore(a, b, delta);
    }
  }

  private finalizeParticipant(scholar: Scholar, topicName: string, xpBurst: number, workId: string) {
    scholar.isAvailable = true;
    scholar.projectHistory.push(workId);
    this.gainXp(scholar, topicName, xpBurst);
    scholar.exhaustion = Math.max(0, (scholar.exhaustion ?? 0) - 0.05);
    this.tryRevealTrait(scholar);
    this.tryRevealTalent(scholar, topicName);
  }

  // Every 2 completed projects, the scholar's next hidden trait flips to visible.
  private tryRevealTrait(scholar: Scholar) {
    if (scholar.hiddenTraits.length === 0) return;
    const projectsDone = scholar.projectHistory.length;
    if (projectsDone < 2 || projectsDone % 2 !== 0) return;

    const trait = scholar.hiddenTraits.shift()!;
    scholar.visibleTraits.push(trait);

    const firstName = scholar.name.split(' ')[0];
    const flavor = `After working closely with ${firstName} on this project, you've come to recognize a quality in them: ${trait}.`;
    Events.emit(GameEvents.SCHOLAR_TRAIT_REVEALED, { scholarId: scholar.id, trait, flavor });
  }

  // A hidden talent reveals when the project's topic discipline matches the talent.
  private tryRevealTalent(scholar: Scholar, topicName: string) {
    const talent = scholar.hiddenTalent;
    if (!talent || talent.revealed) return;
    if (talent.discipline !== topicName) return;

    talent.revealed = true;
    // The talent becomes a real (modest) discipline skill.
    scholar.disciplines[talent.discipline] = Math.max(
      scholar.disciplines[talent.discipline] ?? 0,
      5,
    );

    const firstName = scholar.name.split(' ')[0];
    const flavor = `While working on this project, ${firstName} has shown an unexpected gift for ${talent.discipline}.`;
    Events.emit(GameEvents.SCHOLAR_TALENT_REVEALED, {
      scholarId: scholar.id,
      discipline: talent.discipline,
      flavor,
    });
  }

  private calculateQuality(project: Project): QualityBreakdown {
    const topic = TOPICS.find(t => t.id === project.topicId)!;

    // Stage slices already encode skill, synergy, priority emphasis, and
    // wellbeing for each stage's lead. We split that aggregate into the
    // breakdown's named buckets for the release report's sake.
    const stageTotal = project.stages.reduce((sum, s) => sum + s.qualitySlice, 0);
    const skill = stageTotal * 0.70;          // bulk of slice is lead-skill driven
    const collaboration = stageTotal * 0.18;  // assistants' share within slices
    const priorities = stageTotal * 0.07;     // emphasis bonus share
    const wellbeing = stageTotal * 0.05 - stageTotal * 0.05; // net mild, kept for shape

    // Synergy label still informs the report
    const synergyLabel: 'strong' | 'neutral' | 'weak' =
      topic.strongFormats.includes(project.formatId) ? 'strong'
      : topic.weakFormats.includes(project.formatId)   ? 'weak'
      : 'neutral';
    const synergy = synergyLabel === 'strong' ? 0.04 : synergyLabel === 'weak' ? -0.02 : 0;

    // Chemistry — sum band deltas across every distinct pair that ever worked
    // together across all stages.
    const everyone = new Set<string>();
    for (const stage of project.stages) {
      everyone.add(stage.leadScholarId);
      for (const aid of stage.assistantScholarIds) everyone.add(aid);
    }
    let chemistry = 0;
    for (const [a, b] of pairs(Array.from(everyone))) {
      chemistry += BAND_QUALITY_DELTA[getBand(getScore(a, b))];
    }

    const institution =
      institutionLens.effectMagnitude('quality_bonus') +
      institutionLens.effectMagnitude('topic_quality', topic.name) +
      institutionLens.departmentQualityBonus(topic.name);

    const variance = (Math.random() - 0.5) * 0.06;

    // Legendary applies if the first-stage lead carried the project and
    // peak conditions held at completion.
    const owner = Game.state.scholars.find(s => s.id === project.leadScholarId);
    const legendary = owner ? this.legendaryBoost(project, owner, topic.name) : 0;

    const total = Math.max(0, Math.min(1,
      stageTotal + synergy + chemistry + institution + variance + legendary,
    ));

    return { skill, synergy, synergyLabel, priorities, wellbeing, collaboration, chemistry, institution, variance, total };
  }

  // Returns 0..0.2 when peak conditions align for a scholar with hidden legendary potential.
  private legendaryBoost(project: Project, lead: Scholar, topicName: string): number {
    if (!lead.legendaryPotential) return 0;
    if (lead.age < 40 || lead.age > 60) return 0;
    if (lead.primaryDiscipline !== topicName) return 0;
    const skill = lead.disciplines[topicName] ?? 0;
    if (skill < 8) return 0;

    // Ambition fulfilled OR at least one rapport-or-better pairing with an assistant.
    const ambitionPath = !!lead.ambitionFulfilled;
    let companionPath = false;
    for (const aid of project.assistantScholarIds) {
      const score = getScore(lead.id, aid);
      const band = getBand(score);
      if (band === 'rapport' || band === 'deep_collaboration' || band === 'legendary_partnership') {
        companionPath = true;
        break;
      }
    }
    if (!ambitionPath && !companionPath) return 0;

    // 0.10 baseline + up to +0.10 from a strong synergy. Random within range.
    return 0.10 + Math.random() * 0.10;
  }

  private buildWork(project: Project, breakdown: QualityBreakdown, xpGained: number): Work {
    const topic   = TOPICS.find(t => t.id === project.topicId)!;
    const format  = FORMATS.find(f => f.id === project.formatId)!;
    const quality = breakdown.total;
    const revenue = this.calculateRevenue(quality, project.formatId, topic.name);
    const tier    = flavorTier(quality);
    const reactions = FLAVOR_REACTIONS[tier];
    const flavor  = reactions[Math.floor(Math.random() * reactions.length)];

    return {
      id:               `work_${Date.now()}`,
      title:            `${format.name} on ${topic.name}`,
      topicId:          project.topicId,
      formatId:         project.formatId,
      leadScholarId:    project.leadScholarId,
      assistantScholarIds: this.projectParticipantIds(project).filter(id => id !== project.leadScholarId),
      qualityDescriptor: qualityDescriptor(quality),
      revenue,
      releaseDay:       Game.state.day,
      flavorReaction:   flavor,
      breakdown,
      xpGained:         Math.round(xpGained),
      stages:           project.stages.map(stage => ({
        ...stage,
        assistantScholarIds: [...stage.assistantScholarIds],
      })),
    };
  }

  private projectParticipantIds(project: Project): string[] {
    const ids = new Set<string>();
    for (const stage of project.stages) {
      ids.add(stage.leadScholarId);
      for (const aid of stage.assistantScholarIds) ids.add(aid);
    }
    return Array.from(ids);
  }

  private calculateRevenue(quality: number, formatId: string, topicName: string): number {
    const base = BASE_REVENUE[formatId] ?? 50;
    const facilityBonus = 1 + institutionLens.effectMagnitude('revenue_bonus');
    const worldMod = worldLens.revenueModifier(topicName);
    return Math.round(base * (0.5 + quality) * facilityBonus * worldMod);
  }
}
