import { Events, GameEvents } from './EventBus';
import { TimeManager } from './TimeManager';
import { SaveManager, CURRENT_SAVE_VERSION } from './SaveManager';
import { STARTER_SCHOLARS, FOUNDER_CANDIDATES } from '../data/scholars';
import { RIVALS } from '../data/rivals';
import { TOPICS } from '../data/topics';
import { EconomySystem } from '../systems/EconomySystem';
import { ProjectSystem } from '../systems/ProjectSystem';
import { RecruitmentSystem } from '../systems/RecruitmentSystem';
import { MilestoneSystem } from '../systems/MilestoneSystem';
import { InstitutionSystem } from '../systems/InstitutionSystem';
import { DepartmentSystem } from '../systems/DepartmentSystem';
import { WorldSystem } from '../systems/WorldSystem';
import { ReprintSystem } from '../systems/ReprintSystem';
import { SalesSystem } from '../systems/SalesSystem';
import type { GameState } from '../models/GameState';
import type { Project, StageRecord } from '../models/Project';
import type { Scholar } from '../models/Scholar';

// Restlessness — accumulates each month a scholar isn't doing meaningful work.
// At 3 the scholar shows a restless flag (signal to the player).
// At 6 they leave.
// Restlessness builds slowly — idle scholars take many months to grow uneasy,
// and resting (a chosen break) relieves it. Flag is a warning; leave is the end.
const RESTLESS_FLAG_THRESHOLD = 5;
const RESTLESS_LEAVE_THRESHOLD = 10;

// The 5 starting scholars — used to trigger founder-succession ceremonies.
const FOUNDER_IDS = new Set(['yildiz', 'ossavi', 'meridian', 'vasara', 'harlow']);

export class GameManager {
  state: GameState;
  time: TimeManager;
  readonly save = new SaveManager();
  // The game's systems all live here now (formerly split between GameManager
  // and the old Phaser CampusScene). GameManager owns their lifecycle; the DOM
  // UI reads them for the panels (e.g. ScholarPanel needs `recruitment`).
  readonly economy = new EconomySystem();
  readonly project = new ProjectSystem();
  readonly recruitment = new RecruitmentSystem();
  readonly milestones = new MilestoneSystem();
  readonly institution = new InstitutionSystem();
  readonly departments = new DepartmentSystem();
  readonly world = new WorldSystem();
  readonly reprints = new ReprintSystem();
  readonly sales = new SalesSystem();
  private started = false;
  private readonly onDayPassed = ({ day }: { day: number }) => {
    this.state.day = day;
    // Sample the treasury once a day for the finances graph. This listener is
    // registered last in start(), so it runs after the day's sales are credited.
    if (!this.state.treasuryHistory) this.state.treasuryHistory = [];
    this.state.treasuryHistory.push(this.state.treasury);
    const MAX_HISTORY = 540; // ~1.5 years; keep localStorage bounded
    if (this.state.treasuryHistory.length > MAX_HISTORY) {
      this.state.treasuryHistory.splice(0, this.state.treasuryHistory.length - MAX_HISTORY);
    }
  };
  private readonly handleMonthPassed = () => this.onMonthPassed();
  private readonly handleYearPassed = () => this.onYearPassed();
  private readonly onProjectStarted = () => this.save.save(this.state);
  private readonly onProjectStageGate = () => this.save.save(this.state);
  private readonly onProjectStageStarted = () => this.save.save(this.state);
  private readonly onProjectCompleted = () => this.save.save(this.state);
  private readonly onProjectCancelled = () => this.save.save(this.state);
  private readonly onWorkReleased = () => this.save.save(this.state);
  private readonly onScholarHired = () => {
    this.state.scholarsEverHired += 1;
    this.save.save(this.state);
  };

  constructor() {
    this.state = this.save.load() ?? this.createNewGame();
    this.time = new TimeManager(this.state.day);
  }

  private createNewGame(): GameState {
    return {
      version: CURRENT_SAVE_VERSION,
      day: 1,
      treasury: 300,
      treasuryHistory: [300],
      prestige: 0,
      scholars: STARTER_SCHOLARS.map(s => ({ ...s })),
      activeProject: undefined,
      completedWorks: [],
      institutionName: 'The Founding Hall',
      monthsNegative: 0,
      treasuryWarningTier: null,
      patronGranted: false,
      currentCandidates: [],
      lastRecruitmentDay: 0,
      candidateArrivalDay: 0,
      pendingCandidates: [],
      chemistry: {},
      chemistryShared: {},
      tier: 1,
      unlockedZones: ['founding_hall'],
      facilities: {},
      departments: [],
      majorPatrons: [],
      patronArchetypesGranted: [],
      patronAppealUsed: false,
      workRightsSold: [],
      grantsClaimed: [],
      scholarsEverHired: STARTER_SCHOLARS.length,
      consecutiveBankruptMonths: 0,
      gameOver: false,
      ideology: {
        axes: { piety: 0, tradition: 0, populism: 0 },
        factions: { church: 0, crown: 0, reformers: 0 },
        factionFlags: {
          church:    { favorOffered: false, denounced: false, patronageOffered: false },
          crown:     { favorOffered: false, denounced: false, patronageOffered: false },
          reformers: { favorOffered: false, denounced: false, patronageOffered: false },
        },
      },
      departmentProjects: [],
      activeReprints: [],
      availableFounderCandidates: FOUNDER_CANDIDATES.map(s => s.id),
      world: {
        rivals: RIVALS.map(r => ({
          rivalId: r.id,
          prestige: 0,
          worksReleased: 0,
          lastReleaseDay: 0,
          // Stagger the first release so they don't all fire at once
          nextReleaseDay: Math.floor(r.releaseCadence * (0.5 + Math.random() * 0.5)),
          poachedScholarIds: [],
        })),
        recentReleases: [],
        activeWorldEvents: [],
        worldEventHistory: [],
        lastWorldEventRollDay: 0,
      },
    };
  }

  start() {
    if (this.started) return;
    this.started = true;

    // Systems register their event listeners first, before the clock ticks.
    // Each system's init() is idempotent (guarded), so re-entering the game
    // after a reset doesn't double-register.
    this.economy.init();
    this.project.init();
    this.recruitment.init();
    this.milestones.init();
    this.institution.init();
    this.departments.init();
    this.world.init();
    this.reprints.init();
    this.sales.init();

    Events.on(GameEvents.DAY_PASSED, this.onDayPassed);
    Events.on(GameEvents.MONTH_PASSED, this.handleMonthPassed);
    Events.on(GameEvents.YEAR_PASSED,  this.handleYearPassed);
    Events.on(GameEvents.PROJECT_STARTED,   this.onProjectStarted);
    Events.on(GameEvents.PROJECT_STAGE_GATE, this.onProjectStageGate);
    Events.on(GameEvents.PROJECT_STAGE_STARTED, this.onProjectStageStarted);
    Events.on(GameEvents.PROJECT_COMPLETED, this.onProjectCompleted);
    Events.on(GameEvents.PROJECT_CANCELLED, this.onProjectCancelled);
    Events.on(GameEvents.WORK_RELEASED,     this.onWorkReleased);
    Events.on(GameEvents.SCHOLAR_HIRED, this.onScholarHired);

    // Begin the clock last, so no tick fires before everything is wired.
    this.time.start();
  }

  private stopEventListeners() {
    if (!this.started) return;
    Events.off(GameEvents.DAY_PASSED, this.onDayPassed);
    Events.off(GameEvents.MONTH_PASSED, this.handleMonthPassed);
    Events.off(GameEvents.YEAR_PASSED,  this.handleYearPassed);
    Events.off(GameEvents.PROJECT_STARTED,   this.onProjectStarted);
    Events.off(GameEvents.PROJECT_STAGE_GATE, this.onProjectStageGate);
    Events.off(GameEvents.PROJECT_STAGE_STARTED, this.onProjectStageStarted);
    Events.off(GameEvents.PROJECT_COMPLETED, this.onProjectCompleted);
    Events.off(GameEvents.PROJECT_CANCELLED, this.onProjectCancelled);
    Events.off(GameEvents.WORK_RELEASED,     this.onWorkReleased);
    Events.off(GameEvents.SCHOLAR_HIRED, this.onScholarHired);
    this.economy.destroy();
    this.started = false;
  }

  private onYearPassed() {
    for (const scholar of this.state.scholars) scholar.age += 1;
    this.checkRetirements();
    this.save.save(this.state);
  }

  // Each scholar age 70+ rolls for retirement once per year.
  // Chance scales from 10% at 70 to 100% at 79. Fulfilled ambition adds +20%.
  private checkRetirements() {
    const snapshot = [...this.state.scholars];
    for (const scholar of snapshot) {
      if (scholar.age < 70) continue;
      let chance = (scholar.age - 69) * 0.10;
      if (scholar.ambitionFulfilled) chance += 0.20;
      if (Math.random() >= chance) continue;

      const wasFounder = FOUNDER_IDS.has(scholar.id);
      const ledDept = this.state.departments.find(d => d.headScholarId === scholar.id);

      Events.emit(GameEvents.SCHOLAR_RETIRED, {
        scholarId:   scholar.id,
        scholarName: scholar.name,
        age:         scholar.age,
      });
      // Re-use removal plumbing but suppress the generic "left" event since
      // a retirement event already announces it.
      this.removeScholar(scholar.id, 'They have retired.', { silent: true });

      // Founder's arc: when a starting founder retires, fire a Succession
      // event so the player gets a one-time ceremony moment. If they led a
      // department, the modal will let the player nominate a successor.
      if (wasFounder) {
        Events.emit(GameEvents.FOUNDER_SUCCESSION, {
          founderId:      scholar.id,
          founderName:    scholar.name,
          departmentId:   ledDept?.id,
          departmentName: ledDept?.name,
        });
        // Small prestige bonus for the institution: their legacy lingers.
        this.state.prestige += 5;
      }
    }
  }

  private onMonthPassed() {
    // ── Income ──
    const backlist  = this.calculateBacklistRevenue();
    this.state.treasury += backlist;

    // Patron stipends, donations, commissions offered, grants claimed, patron patience.
    // (Stipends and donations are added to the treasury inside tickMonth.)
    const { stipendsPaid, donationsReceived } = this.economy.tickMonth();

    // ── Expenses ──
    const salaries = this.economy.monthlySalaries();
    const upkeep   = this.economy.monthlyFacilityUpkeep();
    const ops      = this.economy.monthlyOperationalCost();
    this.state.treasury -= salaries + upkeep + ops;

    Events.emit(GameEvents.TREASURY_CHANGED, { amount: this.state.treasury });
    Events.emit(GameEvents.MONTH_LEDGER, {
      month:     Math.floor((this.state.day - 1) / 30) + 1,
      backlist,
      stipends:  stipendsPaid,
      donations: donationsReceived,
      salaries,
      upkeep,
      ops,
      net:       backlist + stipendsPaid + donationsReceived - salaries - upkeep - ops,
      treasury:  this.state.treasury,
    });

    // ── Post-settlement checks ──
    this.checkTreasuryWarning();
    this.checkBankruptcyAndGameOver();
    this.checkFirstPatron();
    this.checkTierPromotion();
    this.updateRestlessness();

    this.save.save(this.state);
  }

  // Tier promotion gates:
  //  1→2 Academy   : prestige ≥ 50,  treasury ≥ 300, scholars ≥ 6
  //  2→3 University: prestige ≥ 200, treasury ≥ 800, scholars ≥ 12
  private checkTierPromotion() {
    const { tier, prestige, treasury, scholars } = this.state;
    const newTier: 1 | 2 | 3 = tier === 1 && prestige >= 50  && treasury >= 300 && scholars.length >= 6  ? 2
                              : tier === 2 && prestige >= 200 && treasury >= 800 && scholars.length >= 12 ? 3
                              : tier;
    if (newTier === tier) return;
    this.state.tier = newTier;
    const name = newTier === 2 ? 'Academy' : 'University';
    Events.emit(GameEvents.TIER_PROMOTED, { newTier, tierName: name });
  }

  private updateRestlessness() {
    const active = this.state.activeProject;
    const currentStage = active ? this.currentStage(active) : undefined;
    const activeTopicName = active
      ? TOPICS.find(t => t.id === active.topicId)?.name
      : undefined;

    // Financial-pressure cascade: late or missed pay grates on everyone.
    const tier = this.state.treasuryWarningTier;
    const financialDrag = tier === 'critical' ? 2 : tier === 'strained' ? 1 : 0;

    // Iterate over a snapshot since scholars may leave mid-loop.
    const snapshot = [...this.state.scholars];
    for (const scholar of snapshot) {
      // Resting is a deliberate break — it steadily relieves restlessness, and
      // a resting scholar never grows restless enough to leave.
      if (scholar.isResting) {
        scholar.restlessness = Math.max(0, scholar.restlessness - 2);
        if (scholar.restlessness < RESTLESS_FLAG_THRESHOLD) scholar.restlessFlagged = false;
        continue;
      }

      const isLead = currentStage?.leadScholarId === scholar.id;
      const isAssistant = currentStage?.assistantScholarIds.includes(scholar.id) ?? false;
      const working = isLead || isAssistant;

      let delta: number;
      if (working && activeTopicName === scholar.primaryDiscipline) {
        delta = isLead ? -2 : -1; // assistants get half the benefit
      } else if (working && activeTopicName === scholar.secondaryDiscipline) {
        delta = isLead ? -1 : 0;
      } else if (working) {
        delta = +1; // working but mismatched
      } else {
        delta = +1; // idle
      }

      scholar.restlessness = Math.max(0, scholar.restlessness + delta + financialDrag);

      this.checkRestlessConsequences(scholar);
    }
  }

  private checkRestlessConsequences(scholar: Scholar) {
    if (scholar.restlessness >= RESTLESS_LEAVE_THRESHOLD) {
      this.removeScholar(scholar.id, 'They felt their work no longer mattered here.');
      return;
    }
    if (scholar.restlessness >= RESTLESS_FLAG_THRESHOLD && !scholar.restlessFlagged) {
      scholar.restlessFlagged = true;
      Events.emit(GameEvents.SCHOLAR_RESTLESS, {
        scholarId: scholar.id,
        reason: 'They have been given work that does not match their calling.',
      });
    } else if (scholar.restlessness < RESTLESS_FLAG_THRESHOLD && scholar.restlessFlagged) {
      scholar.restlessFlagged = false;
    }
  }

  private removeScholar(id: string, reason: string, opts: { silent?: boolean } = {}) {
    const idx = this.state.scholars.findIndex(s => s.id === id);
    if (idx < 0) return;
    const scholar = this.state.scholars[idx];

    // If they were leading the active project, cancel it.
    // If they were an assistant, just drop them from the team.
    const active = this.state.activeProject;
    const currentStage = active ? this.currentStage(active) : undefined;
    if (active && currentStage?.leadScholarId === id) {
      // Free everyone currently assigned to the active stage.
      for (const aid of currentStage.assistantScholarIds) {
        const a = this.state.scholars.find(s => s.id === aid);
        if (a) a.isAvailable = true;
      }
      Events.emit(GameEvents.PROJECT_CANCELLED, { project: active, refund: 0 });
      this.state.activeProject = undefined;
    } else if (active && currentStage?.assistantScholarIds.includes(id)) {
      currentStage.assistantScholarIds = currentStage.assistantScholarIds.filter(aid => aid !== id);
      active.assistantScholarIds = active.assistantScholarIds.filter(aid => aid !== id);
    }

    this.state.scholars.splice(idx, 1);
    if (!opts.silent) {
      Events.emit(GameEvents.SCHOLAR_LEFT, {
        scholarId:   id,
        scholarName: scholar.name,
        reason,
      });
    }
  }

  // Edge-triggered: emit TREASURY_LOW only when tier worsens (null→strained, strained→critical, etc.)
  private checkTreasuryWarning() {
    const amount = this.state.treasury;
    const newTier: 'strained' | 'critical' | null =
      amount < 50  ? 'critical' :
      amount < 150 ? 'strained' :
      null;

    const tierWorsened =
      (newTier === 'strained' && this.state.treasuryWarningTier === null) ||
      (newTier === 'critical' && this.state.treasuryWarningTier !== 'critical');

    if (tierWorsened && newTier !== null) {
      Events.emit(GameEvents.TREASURY_LOW, { amount, tier: newTier });
    }
    this.state.treasuryWarningTier = newTier;
  }

  private checkBankruptcyAndGameOver() {
    if (this.state.treasury < 0) {
      this.state.monthsNegative += 1;
      this.state.consecutiveBankruptMonths = this.state.monthsNegative;
      if (this.state.monthsNegative === 2) {
        Events.emit(GameEvents.BANKRUPTCY, {
          amount:         this.state.treasury,
          monthsNegative: this.state.monthsNegative,
        });
      }
      if (this.state.monthsNegative >= 4) {
        this.triggerGameOver('bankruptcy');
        return;
      }
    } else {
      this.state.monthsNegative = 0;
      this.state.consecutiveBankruptMonths = 0;
    }

    // Also game-over if the roster empties (everyone retired/left and no one was hired in time).
    if (this.state.scholars.length === 0) {
      this.triggerGameOver('no_scholars');
    }
  }

  private triggerGameOver(reason: 'bankruptcy' | 'no_scholars') {
    if (this.state.gameOver) return;
    this.state.gameOver = true;
    Events.emit(GameEvents.GAME_OVER, {
      reason,
      day:                  this.state.day,
      institutionName:      this.state.institutionName,
      finalPrestige:        this.state.prestige,
      finalTreasury:        this.state.treasury,
      worksReleased:        this.state.completedWorks.length,
      scholarsPassedThrough: this.state.scholarsEverHired,
    });
  }

  private checkFirstPatron() {
    if (this.state.patronGranted) return;
    if (this.state.prestige < 50) return;

    const amount = 200;
    this.state.treasury += amount;
    this.state.patronGranted = true;
    Events.emit(GameEvents.PATRON_GRANTED, {
      amount,
      flavor: 'A merchant-house in the lower quarter, hearing rumors of your work, has sent a sealed purse and a note: "for the continuation of the project."',
    });
    Events.emit(GameEvents.TREASURY_CHANGED, { amount: this.state.treasury });
  }

  // Each completed work pays a small recurring trickle that decays over 24 months.
  // At month 0: 4% of original revenue. At month 24+: nothing.
  private calculateBacklistRevenue(): number {
    const total = this.state.completedWorks.reduce((sum, work) => {
      if (this.state.workRightsSold.includes(work.id)) return sum;
      const daysSinceRelease   = Math.max(0, this.state.day - work.releaseDay);
      const monthsSinceRelease = daysSinceRelease / 30;
      const decay              = Math.max(0, 1 - monthsSinceRelease / 24);
      return sum + work.revenue * 0.04 * decay;
    }, 0);
    return Math.round(total);
  }

  private currentStage(project: Project): StageRecord | undefined {
    return project.stages[project.stages.length - 1];
  }

  reset() {
    this.time.destroy();
    this.stopEventListeners();
    this.save.clear();
    this.state = this.createNewGame();
    this.time = new TimeManager(this.state.day);
  }
}

export const Game = new GameManager();
