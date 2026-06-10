import Phaser from 'phaser';
import { Game } from '../game/GameManager';
import { Events, GameEvents } from '../game/EventBus';
import type { EventPayloads, MidEventChoice } from '../game/EventBus';
import { ProjectSystem } from '../systems/ProjectSystem';
import { RecruitmentSystem } from '../systems/RecruitmentSystem';
import { MilestoneSystem } from '../systems/MilestoneSystem';
import { InstitutionSystem } from '../systems/InstitutionSystem';
import { InstitutionPanel } from '../ui/panels/InstitutionPanel';
import { TreasuryPanel } from '../ui/panels/TreasuryPanel';
import { IdeologyPanel } from '../ui/panels/IdeologyPanel';
import { WorldPanel } from '../ui/panels/WorldPanel';
import { IdeologySystem } from '../systems/IdeologySystem';
import { DepartmentSystem } from '../systems/DepartmentSystem';
import { WorldSystem } from '../systems/WorldSystem';
import { ReprintSystem } from '../systems/ReprintSystem';
import { SalesSystem } from '../systems/SalesSystem';
import { ProjectPanel } from '../ui/panels/ProjectPanel';
import { StageGateModal } from '../ui/modals/StageGateModal';
import { STAGE_INFO, STAGE_ORDER } from '../models/Project';
import { STAGE_AXES } from '../data/stageEmphasis';
import { Audio } from '../game/Audio';
import { getScore } from '../game/Chemistry';
import { ScholarPanel } from '../ui/panels/ScholarPanel';
import { DecisionModal } from '../ui/modals/DecisionModal';
import { ReleaseReportModal } from '../ui/modals/ReleaseReportModal';
import { TOPICS } from '../data/topics';
import { FORMATS } from '../data/formats';
import type { GameSpeed } from '../game/TimeManager';
import type { Project, StageKey } from '../models/Project';
import type { Work } from '../models/Work';
import { GROUND, BUILDINGS, COURTYARD_PROPS, LANTERNS, WINDOW_GLOWS } from './campusLayout';

// ── Constants ─────────────────────────────────────────────────────

const BAR_H         = 56;
const BAR_ALPHA     = 0.82;
const BAR_COLOR     = 0x0d0704;
const PROGRESS_BAR_W = 320;
// Pixel display face for headers/buttons; body text stays Georgia.
const DISPLAY_FONT  = 'Alagard, Georgia, serif';

const TREASURY_THRESHOLDS = { prosperous: 300, stable: 150, strained: 50 };
const TREASURY_LABELS: Record<string, string> = {
  prosperous: 'Prosperous', stable: 'Stable', strained: 'Strained', critical: 'Critical',
};
const TREASURY_COLORS: Record<string, string> = {
  prosperous: '#8ab87a',  // soft green
  stable:     '#c8a87a',  // warm parchment
  strained:   '#d4a855',  // amber warning
  critical:   '#c87a4a',  // glowing ember red
};
const TREASURY_HOVER: Record<string, string> = {
  prosperous: '#a8d49a',
  stable:     '#e8d5b0',
  strained:   '#f0c878',
  critical:   '#e8946a',
};

// Named scholars that have campus sprite assets
const NAMED_SCHOLARS = ['yildiz', 'ossavi', 'meridian', 'vasara', 'harlow'] as const;
type NamedId = typeof NAMED_SCHOLARS[number];

// Ground anchor positions (feet) in the courtyard for the founders.
const SCHOLAR_POS: Record<NamedId, { x: number; y: number }> = {
  yildiz:   { x: 362, y: 482 },
  ossavi:   { x: 492, y: 506 },
  meridian: { x: 632, y: 494 },
  vasara:   { x: 772, y: 508 },
  harlow:   { x: 904, y: 486 },
};

// Fallback positions for hires beyond the five founders.
const HIRE_POS: Array<{ x: number; y: number }> = [
  { x: 250, y: 494 }, { x: 1026, y: 494 },
  { x: 300, y: 528 }, { x: 964,  y: 528 },
  { x: 426, y: 538 }, { x: 838,  y: 538 },
];

const DUST_MOTE_BOUNDS = { x: 380, y: 250, w: 540, h: 250 };
const ACTIVE_WORK_AREA = { x: 640, y: 540 };
// Courtyard rectangle idle scholars may wander inside.
const WANDER_BOUNDS = { minX: 240, maxX: 1040, minY: 460, maxY: 620 };
// Seats around the workstation. Lead takes seat 0. `flip` turns the sprite
// toward the desk so the team reads as gathered around the work.
const WORK_SEATS = [
  { x: 548, y: 586, flip: false },
  { x: 734, y: 586, flip: true },
  { x: 592, y: 632, flip: false },
  { x: 690, y: 632, flip: true },
  { x: 641, y: 648, flip: false },
];
// Pixel-art sprite frames are 32x48; drawn at 2x.
const ACTOR_SCALE = 2;
const WALK_SPEED = 0.085; // px per ms
const GENERIC_VARIANTS = ['a', 'b', 'c'] as const;
const STAGE_TINTS: Record<StageKey, number> = {
  research:   0xd4a855,
  drafting:   0xe8d5b0,
  refinement: 0x8ab87a,
};

// ── Helpers ────────────────────────────────────────────────────────

function getTreasuryState(amount: number): string {
  if (amount >= TREASURY_THRESHOLDS.prosperous) return 'prosperous';
  if (amount >= TREASURY_THRESHOLDS.stable)     return 'stable';
  if (amount >= TREASURY_THRESHOLDS.strained)   return 'strained';
  return 'critical';
}

function formatDay(day: number): string {
  const month = Math.floor((day - 1) / 30) + 1;
  const d     = ((day - 1) % 30) + 1;
  return `Month ${month}, Day ${d}`;
}

function prestigeTier(value: number): string {
  if (value >= 100) return 'Celebrated';
  if (value >= 50)  return 'Renowned';
  if (value >= 20)  return 'Regional renown';
  if (value >= 5)   return 'Local renown';
  return 'Unknown';
}

// One animated character in the courtyard. `mode` is the current behavior
// state; `target` is where the actor was last sent so refreshes don't
// restart walks already in flight.
interface ScholarActor {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  zzz: Phaser.GameObjects.Text;
  alert: Phaser.GameObjects.Text;
  home: { x: number; y: number };
  spriteSet: string;           // 'yildiz' … or 'generic_a' …
  hasFullAnims: boolean;       // founders have walk/sit/react sheets
  mode: 'idle' | 'working' | 'resting' | 'away';
  target: { x: number; y: number };
  walkTween?: Phaser.Tweens.Tween;
  wanderEvent?: Phaser.Time.TimerEvent;
}

// ── Scene ──────────────────────────────────────────────────────────

export class CampusScene extends Phaser.Scene {
  // Top bar
  private dayText!: Phaser.GameObjects.Text;
  private prestigeLabel!: Phaser.GameObjects.Text;
  private institutionLabel!: Phaser.GameObjects.Text;
  private treasuryIndicator!: Phaser.GameObjects.Image;
  private treasuryLabel!: Phaser.GameObjects.Text;

  // Speed buttons
  private btnPause!: Phaser.GameObjects.Image;
  private btnPlay!: Phaser.GameObjects.Image;
  private btnFast!: Phaser.GameObjects.Image;

  // Bottom bar — project area
  private scholarsBtn!: Phaser.GameObjects.Text;
  private newWorkBtn!: Phaser.GameObjects.Text;
  private activeProjectPanelBg!: Phaser.GameObjects.Rectangle;
  private activeProjectLabel!: Phaser.GameObjects.Text;
  private activeScholarLabel!: Phaser.GameObjects.Text;
  // Per-stage segments for the HUD progress bar (Research / Drafting / Refinement)
  private stageSegmentTracks: Phaser.GameObjects.Rectangle[] = [];
  private stageSegmentFills:  Phaser.GameObjects.Rectangle[] = [];
  private progressPct!: Phaser.GameObjects.Text;
  private cancelBtn!: Phaser.GameObjects.Text;

  // Live stage axis gauge (Game Dev Tycoon-style point accumulators per axis).
  // Transient: resets each stage, not saved. The three axis fills shrink/grow
  // proportionally to the accumulator vs the largest accumulated axis.
  private stageAxisAccumulator: Record<string, number> = {};
  private stageGaugeTracks: Phaser.GameObjects.Rectangle[] = [];
  private stageGaugeFills:  Phaser.GameObjects.Rectangle[] = [];
  private stageGaugeLabels: Phaser.GameObjects.Text[] = [];
  private stageGaugeValues: Phaser.GameObjects.Text[] = [];
  private stageGaugeKeyForIndex: string[] = []; // axis name at each gauge slot
  private bubbleTimer?: Phaser.Time.TimerEvent;

  // Active project tracking
  private activeScholarId: string | undefined;

  // Campus actors — animated character sprites for every scholar
  private actors = new Map<string, ScholarActor>();
  private actorsLayer!: Phaser.GameObjects.Container;
  private studentSprites: Phaser.GameObjects.Sprite[] = [];
  private ambientLayer!: Phaser.GameObjects.Container;
  private activeWorkLayer!: Phaser.GameObjects.Container;
  private activeWorkStation!: Phaser.GameObjects.Image;
  private activeWorkTitle!: Phaser.GameObjects.Text;
  private activeWorkStage!: Phaser.GameObjects.Text;
  private activeWorkTimer?: Phaser.Time.TimerEvent;
  private birdTimer?: Phaser.Time.TimerEvent;
  private emoteTimer?: Phaser.Time.TimerEvent;
  private idleChatTimer?: Phaser.Time.TimerEvent;

  // Day/night + seasons
  private duskOverlay!: Phaser.GameObjects.Rectangle;
  private winterOverlay!: Phaser.GameObjects.Rectangle;
  private nightLights!: Phaser.GameObjects.Container;
  private snowTimer?: Phaser.Time.TimerEvent;
  private snowing = false;

  // Chronicle feed — non-blocking event notes stacked on the right edge
  private chronicleCards: Phaser.GameObjects.Container[] = [];

  // Systems & UI
  private projectSystem!: ProjectSystem;
  private recruitment!: RecruitmentSystem;
  private milestones!: MilestoneSystem;
  private institution!: InstitutionSystem;
  private departments!: DepartmentSystem;
  private world!: WorldSystem;
  private reprints!: ReprintSystem;
  private sales!: SalesSystem;
  private projectPanel!: ProjectPanel;
  private scholarPanel!: ScholarPanel;
  private institutionPanel!: InstitutionPanel;
  private treasuryPanel!: TreasuryPanel;
  private ideologyPanel!: IdeologyPanel;
  private worldPanel!: WorldPanel;
  private stanceBtn!: Phaser.GameObjects.Text;

  // Info strips beneath the top bar
  private goalStrip!: Phaser.GameObjects.Container;
  private commissionStrip!: Phaser.GameObjects.Container;
  private releasesStrip!: Phaser.GameObjects.Container;
  private eventModal!: DecisionModal;
  private releaseModal!: ReleaseReportModal;
  private stageGateModal!: StageGateModal;

  constructor() { super({ key: 'Campus' }); }

  create() {
    const { width, height } = this.scale;
    const cx = width / 2;

    // Audio service was initialized from MenuScene. Start the campus ambient
    // music loop. No-op if the asset doesn't exist (gracefully degrades).
    Audio.playMusic('music_campus');

    this.projectSystem    = new ProjectSystem();
    this.recruitment      = new RecruitmentSystem();
    this.milestones       = new MilestoneSystem();
    this.institution      = new InstitutionSystem();
    this.departments      = new DepartmentSystem();
    this.world            = new WorldSystem();
    this.projectPanel     = new ProjectPanel();
    this.scholarPanel     = new ScholarPanel(this.recruitment);
    this.institutionPanel = new InstitutionPanel(this.institution);
    this.reprints         = new ReprintSystem();
    this.sales            = new SalesSystem();
    this.treasuryPanel    = new TreasuryPanel(Game.economy, this.reprints);
    this.ideologyPanel    = new IdeologyPanel();
    this.worldPanel       = new WorldPanel();
    this.eventModal       = new DecisionModal();
    this.releaseModal     = new ReleaseReportModal();
    this.stageGateModal   = new StageGateModal();

    this.scholarPanel.onHireRequest = (idx) => this.showSalaryModal(idx);

    // Composed pixel-art stage: sky backdrop, tiled plateau, buildings,
    // courtyard props. Replaces the old painted background.
    this.buildCampusStage();

    // Campus life (drawn before bars so they appear under the chrome)
    this.ensureCampusAnims();
    this.buildAmbientLayer();
    this.buildActiveWorkLayer();
    // Actors (and the courtyard props that y-sort with them) render above
    // the ambient layer and the workstation.
    this.children.bringToTop(this.actorsLayer);
    this.buildScholarSprites();
    this.buildStudents();
    this.buildMoodLayers(width, height);
    this.updateDayNight(Game.state.day, true);

    // UI bars
    this.add.rectangle(cx, BAR_H / 2,          width, BAR_H, BAR_COLOR, BAR_ALPHA);
    this.add.rectangle(cx, height - BAR_H / 2, width, BAR_H, BAR_COLOR, BAR_ALPHA);

    this.buildTopBar(width, height);
    this.buildInfoStrips(width);
    this.buildBottomBar(width, height);
    this.buildKeyboardShortcuts();

    // Off-project social texture — idle scholars chat now and then.
    this.idleChatTimer = this.time.addEvent({
      delay: 9000,
      loop: true,
      callback: () => this.emitIdleChatter(),
    });

    Game.start();
    this.projectSystem.init();
    this.recruitment.init();
    this.milestones.init();
    this.institution.init();
    this.departments.init();
    this.world.init();
    this.reprints.init();
    this.sales.init();

    // Restore UI state when loading from a save with an active project
    if (Game.state.activeProject) {
      this.onProjectStarted(Game.state.activeProject);
      this.updateProgressBar(Game.state.activeProject.progress);
    } else {
      this.refreshNewWorkBtn();
    }

    // ── Event subscriptions ────────────────────────────────────────
    const onDay       = ({ day }:    { day: number })    => {
      this.dayText.setText(formatDay(day));
      // Refresh strips daily so sales chips track earnings + days-left.
      this.refreshInfoStrips();
      // Resting scholars auto-wake when fully recovered — refresh actor
      // state daily so Zzz overlays disappear and idling resumes promptly.
      this.refreshScholarSprites();
      this.updateDayNight(day);
    };
    const onTreasury  = ({ amount }: { amount: number }) => this.updateTreasuryDisplay(amount);
    const onMonthLedger = (l: EventPayloads[typeof GameEvents.MONTH_LEDGER]) => {
      const income   = l.backlist + l.stipends;
      const expenses = l.salaries + l.upkeep + l.ops;
      const sign = l.net >= 0 ? '+' : '−';
      this.queueJournalNote(
        `The ledger for month ${l.month}: income ${income} gold` +
        (l.stipends > 0 ? ` (${l.stipends} from patrons)` : '') +
        `, expenses ${expenses} gold. Net ${sign}${Math.abs(l.net)} — ${l.treasury} gold remains.`,
      );
    };
    const onStarted   = ({ project }: { project: Project }) => this.onProjectStarted(project);
    const onProgress  = ({ progress }: { progress: number }) => {
      this.updateProgressBar(progress);
      this.spawnProgressPop();
    };
    const onMidEvent  = ({ scholarName, text, choice }: EventPayloads[typeof GameEvents.MID_PROJECT_EVENT]) =>
      this.showMidEvent(scholarName, text, choice);
    const onStageGate = ({ project, nextStageKey }: EventPayloads[typeof GameEvents.PROJECT_STAGE_GATE]) =>
      this.showStageGate(project, nextStageKey);
    const onStageStarted = (_: EventPayloads[typeof GameEvents.PROJECT_STAGE_STARTED]) =>
      this.onStageStarted();
    const onCompleted = ({ work }: { work: Work }) => {
      Audio.playSfx('project_complete');
      this.onProjectCompleted(work);
      // The work just released; if it's selling, the strip should appear.
      this.refreshInfoStrips();
      this.fireMilestone('firstWorkReleased',
        'Your first work is released. Critics weigh in, the work sells over 90 days, and your institution begins to build a reputation.',
      );
    };
    const onSkillUp   = ({ scholarId, topic, newLevel }: { scholarId: string; topic: string; newLevel: number }) => {
      Audio.playSfx('quill_scratch', { volume: 0.6 });
      this.showSkillUpToast(scholarId, topic, newLevel);
      this.playReact(scholarId);
    };
    const onHired     = () => {
      Audio.playSfx('coin_gain');
      this.refreshNewWorkBtn();
      this.rebuildScholarSprites();
      this.fireMilestone('firstHire',
        'A new scholar joins the institution. Your roster grows — assign them to a work and watch their discipline strengthen over time.',
      );
    };
    const onLow       = ({ tier }: EventPayloads[typeof GameEvents.TREASURY_LOW]) =>
      this.showTreasuryLowToast(tier);
    const onBankrupt  = ({ amount, monthsNegative }: EventPayloads[typeof GameEvents.BANKRUPTCY]) =>
      this.showBankruptcyModal(amount, monthsNegative);
    const onPatron    = ({ amount, flavor }: EventPayloads[typeof GameEvents.PATRON_GRANTED]) =>
      this.showPatronToast(amount, flavor);
    const onTraitRev  = ({ flavor }: EventPayloads[typeof GameEvents.SCHOLAR_TRAIT_REVEALED]) =>
      this.queueJournalNote(flavor);
    const onTalentRev = ({ flavor }: EventPayloads[typeof GameEvents.SCHOLAR_TALENT_REVEALED]) =>
      this.queueJournalNote(flavor);
    const onRestless  = ({ scholarId, reason }: EventPayloads[typeof GameEvents.SCHOLAR_RESTLESS]) =>
      this.showRestlessToast(scholarId, reason);
    const onLeft      = ({ scholarName, reason }: EventPayloads[typeof GameEvents.SCHOLAR_LEFT]) =>
      this.showLeftModal(scholarName, reason);
    const onAmbition  = ({ scholarName, ambition }: EventPayloads[typeof GameEvents.SCHOLAR_AMBITION_FULFILLED]) =>
      this.queueJournalNote(`${scholarName}'s ambition is fulfilled — ${ambition}.`);
    const onFear      = ({ scholarName, fear }: EventPayloads[typeof GameEvents.SCHOLAR_FEAR_TRIGGERED]) =>
      this.queueJournalNote(`${scholarName} confronts a quiet dread: ${fear}.`);
    const onRetired   = ({ scholarName, age }: EventPayloads[typeof GameEvents.SCHOLAR_RETIRED]) => {
      this.rebuildScholarSprites();
      this.refreshNewWorkBtn();
      this.queueJournalNote(`${scholarName} has chosen to retire from active scholarship, at age ${age}. Their works remain.`);
    };
    const onTierPromoted = ({ tierName }: EventPayloads[typeof GameEvents.TIER_PROMOTED]) => {
      this.refreshInstitutionLabel();
      this.queueJournalNote(`Word has spread. The institution is now known as a${tierName === 'Academy' ? 'n' : ''} ${tierName}.`);
      // Students begin to appear in the courtyard from Academy tier.
      if (this.studentSprites.length === 0) this.buildStudents();
      // New wings appear on the campus as the institution grows.
      this.buildTierSetPieces();
    };
    const onZoneUnlocked = ({ zoneName }: EventPayloads[typeof GameEvents.ZONE_UNLOCKED]) => {
      this.showToast(`Zone unlocked: ${zoneName}`, '#d4a855');
      this.fireMilestone('firstZoneUnlocked',
        'A new zone opens. Visit the Institution panel to build facilities here — each gives a small permanent bonus to your works.',
      );
    };
    const onDeptFounded  = ({ name, headScholarName }: EventPayloads[typeof GameEvents.DEPARTMENT_FOUNDED]) =>
      this.queueJournalNote(`${name} is founded under ${headScholarName}. Their work begins.`);
    const onDeptDisbanded = ({ name, reason }: EventPayloads[typeof GameEvents.DEPARTMENT_DISBANDED]) =>
      this.queueJournalNote(`${name} disbands. ${reason}`);
    const onPatronOffered = ({ patron, arrivalFlavor }: EventPayloads[typeof GameEvents.MAJOR_PATRON_OFFERED]) =>
      this.showPatronOfferModal(patron, arrivalFlavor);
    const onPatronAccepted = ({ patronName }: EventPayloads[typeof GameEvents.MAJOR_PATRON_ACCEPTED]) =>
      this.queueJournalNote(`${patronName} is now a patron of the institution. Their monthly stipend has begun.`);
    const onPatronWithdrew = ({ patronName, reason }: EventPayloads[typeof GameEvents.MAJOR_PATRON_WITHDREW]) =>
      this.queueJournalNote(`${patronName} has withdrawn their patronage. ${reason}`);
    const onCommissionOffered = ({ commission }: EventPayloads[typeof GameEvents.MINOR_COMMISSION_OFFERED]) => {
      this.showCommissionOfferModal(commission);
      this.refreshInfoStrips();
    };
    const onCommissionAccepted = () => this.refreshInfoStrips();
    const onCommissionDeclined = () => this.refreshInfoStrips();
    const onCommissionCompleted = ({ patronName, payment }: EventPayloads[typeof GameEvents.MINOR_COMMISSION_COMPLETED]) => {
      this.showToast(`Commission delivered to ${patronName}  ·  +${payment} gold`, '#8ab87a', 3200);
      this.refreshInfoStrips();
    };
    const onGrantClaimed = ({ amount, flavor }: EventPayloads[typeof GameEvents.GRANT_CLAIMED]) =>
      this.queueJournalNote(`${flavor}\n\n+${amount} gold to the treasury.`);
    const onWorkRightsSold = ({ workTitle, amount }: EventPayloads[typeof GameEvents.WORK_RIGHTS_SOLD]) =>
      this.showToast(`Rights to "${workTitle}" sold  ·  +${amount} gold`, '#d4a855', 3200);
    const onPatronAppeal = ({ amount }: EventPayloads[typeof GameEvents.PATRON_APPEAL_USED]) =>
      this.queueJournalNote(`The patrons have answered an emergency appeal. +${amount} gold. Their patience, however, is thinner now.`);
    const onGameOver = (state: EventPayloads[typeof GameEvents.GAME_OVER]) =>
      this.showGameOverModal(state);
    const onIdeologyDrift = (_: EventPayloads[typeof GameEvents.IDEOLOGY_DRIFT]) =>
      this.stanceBtn.setText(this.formatStance());
    const onFactionFavor = ({ factionName }: EventPayloads[typeof GameEvents.FACTION_FAVOR_OFFERED]) =>
      this.queueJournalNote(`${factionName} has begun to favor the institution. Their support may follow.`);
    const onFactionDenounce = ({ factionName }: EventPayloads[typeof GameEvents.FACTION_DENOUNCED]) =>
      this.queueJournalNote(`${factionName} has denounced the institution. Their hostility is now open.`);
    const onWorkSuppressed = ({ workTitle, factionName, revenueLost }: EventPayloads[typeof GameEvents.WORK_SUPPRESSED]) =>
      this.queueJournalNote(`${factionName} has moved against "${workTitle}". Copies are seized, sales suppressed — ${revenueLost} gold of revenue is lost. Their standing with the institution sours.`);
    const onFactionPatronage = (payload: EventPayloads[typeof GameEvents.FACTION_PATRONAGE_OFFERED]) =>
      this.showFactionPatronageOffer(payload);
    const onDeptProposed = (payload: EventPayloads[typeof GameEvents.DEPARTMENT_PROJECT_PROPOSED]) =>
      this.showDepartmentProposal(payload);
    const onDeptEscalated = (payload: EventPayloads[typeof GameEvents.DEPARTMENT_PROJECT_ESCALATED]) =>
      this.showDepartmentEscalation(payload);
    const onDeptCompleted = ({ departmentName, work }: EventPayloads[typeof GameEvents.DEPARTMENT_PROJECT_COMPLETED]) =>
      this.queueJournalNote(`${departmentName} has completed a new work: "${work.title}". ${work.qualityDescriptor}. + ${work.revenue} gold to the treasury.`);
    const onFounderSuccession = (payload: EventPayloads[typeof GameEvents.FOUNDER_SUCCESSION]) =>
      this.showFounderSuccession(payload);
    const onRivalReleased = ({ rivalName, formatName, topicName }: EventPayloads[typeof GameEvents.RIVAL_RELEASED]) =>
      this.queueJournalNote(`${rivalName} has published a ${formatName} on ${topicName}. Word reaches the institution within days.`);
    const onWorldEventStarted = ({ eventName, flavor }: EventPayloads[typeof GameEvents.WORLD_EVENT_STARTED]) =>
      this.queueJournalNote(`${eventName} — ${flavor}`);
    const onWorldEventEnded = ({ eventName }: EventPayloads[typeof GameEvents.WORLD_EVENT_ENDED]) =>
      this.showToast(`${eventName} has passed`, '#8a6848', 2200);
    const onPoachAttempt = (payload: EventPayloads[typeof GameEvents.POACH_ATTEMPT]) =>
      this.showPoachAttempt(payload);
    const onScholarPoached = ({ scholarName, rivalName }: EventPayloads[typeof GameEvents.SCHOLAR_POACHED]) => {
      this.rebuildScholarSprites();
      this.queueJournalNote(`${scholarName} has joined ${rivalName}. The institution is poorer for it.`);
    };
    const onReprintStarted = ({ workTitle, projectedRevenue }: EventPayloads[typeof GameEvents.REPRINT_STARTED]) =>
      this.showToast(`Reprint of "${workTitle}" begins  ·  +${projectedRevenue} on completion`, '#c8a87a', 2600);
    const onReprintCompleted = ({ workTitle, revenue }: EventPayloads[typeof GameEvents.REPRINT_COMPLETED]) =>
      this.showToast(`Reprint of "${workTitle}" lands  ·  +${revenue} gold`, '#d4a855', 3000);
    const onWorkSaleTick = ({ amount }: EventPayloads[typeof GameEvents.WORK_SALE_TICK]) => {
      if (amount > 0) {
        this.spawnSalesCoin(amount);
        this.fireMilestone('firstSaleEarned',
          'Your first work begins selling. Sales decay from a strong opening to a quiet tail over 90 days.',
        );
      }
    };
    const onChemistryBand = ({ scholarA, scholarB, nextBand, direction }: EventPayloads[typeof GameEvents.CHEMISTRY_BAND_CHANGED]) => {
      // Surface only the meaningful crossings. Skipping neutral≀friction
      // flips keeps toasts from spamming during long campaigns.
      const meaningful: Record<string, true> = {
        rapport: true,
        deep_collaboration: true,
        legendary_partnership: true,
        friction: true,
        tension: true,
        deep_conflict: true,
      };
      if (!meaningful[nextBand]) return;
      const a = Game.state.scholars.find(s => s.id === scholarA);
      const b = Game.state.scholars.find(s => s.id === scholarB);
      if (!a || !b) return;
      const an = a.name.split(' ')[0];
      const bn = b.name.split(' ')[0];
      const phrases: Record<string, string> = {
        rapport: `${an} and ${bn} have found a working rhythm together.`,
        deep_collaboration: `${an} and ${bn} now collaborate deeply — their next work together will sing.`,
        legendary_partnership: `${an} and ${bn} have become a legendary pair. The institution should celebrate them.`,
        friction: `${an} and ${bn} are getting on each other's nerves. The next pairing may strain.`,
        tension: `Tension has hardened between ${an} and ${bn}. Their work together suffers.`,
        deep_conflict: `${an} and ${bn} can barely stand to share a room. Avoid pairing them.`,
      };
      const text = phrases[nextBand] ?? '';
      if (text) {
        this.queueJournalNote(text);
        Audio.playSfx(direction === 'up' ? 'page_turn' : 'error', { volume: direction === 'up' ? 0.5 : 0.35 });
      }
    };
    const onWorkSalesFinished = ({ workTitle, earnedTotal, projectedTotal }: EventPayloads[typeof GameEvents.WORK_SALES_FINISHED]) => {
      const ratio = projectedTotal > 0 ? earnedTotal / projectedTotal : 1;
      const verdict = ratio >= 1.05 ? 'beat expectations'
                   : ratio >= 0.85 ? 'met expectations'
                   :                 'underperformed';
      this.queueJournalNote(`"${workTitle}" has finished its run, earning ${earnedTotal} gold total. The work ${verdict}.`);
      // Strip should drop this work now that sales are complete.
      this.refreshInfoStrips();
    };

    Events.on(GameEvents.DAY_PASSED,        onDay);
    Events.on(GameEvents.TREASURY_CHANGED,  onTreasury);
    Events.on(GameEvents.MONTH_LEDGER,      onMonthLedger);
    Events.on(GameEvents.PROJECT_STARTED,   onStarted);
    Events.on(GameEvents.PROJECT_PROGRESS,  onProgress);
    Events.on(GameEvents.MID_PROJECT_EVENT, onMidEvent);
    Events.on(GameEvents.PROJECT_STAGE_GATE, onStageGate);
    Events.on(GameEvents.PROJECT_STAGE_STARTED, onStageStarted);
    Events.on(GameEvents.PROJECT_COMPLETED, onCompleted);
    Events.on(GameEvents.SCHOLAR_SKILL_UP,  onSkillUp);
    Events.on(GameEvents.SCHOLAR_HIRED,     onHired);
    Events.on(GameEvents.TREASURY_LOW,      onLow);
    Events.on(GameEvents.BANKRUPTCY,        onBankrupt);
    Events.on(GameEvents.PATRON_GRANTED,    onPatron);
    Events.on(GameEvents.SCHOLAR_TRAIT_REVEALED,  onTraitRev);
    Events.on(GameEvents.SCHOLAR_TALENT_REVEALED, onTalentRev);
    Events.on(GameEvents.SCHOLAR_RESTLESS,        onRestless);
    Events.on(GameEvents.SCHOLAR_LEFT,            onLeft);
    Events.on(GameEvents.SCHOLAR_AMBITION_FULFILLED, onAmbition);
    Events.on(GameEvents.SCHOLAR_FEAR_TRIGGERED,     onFear);
    Events.on(GameEvents.SCHOLAR_RETIRED,             onRetired);
    Events.on(GameEvents.TIER_PROMOTED,                onTierPromoted);
    Events.on(GameEvents.ZONE_UNLOCKED,                onZoneUnlocked);
    Events.on(GameEvents.DEPARTMENT_FOUNDED,           onDeptFounded);
    Events.on(GameEvents.DEPARTMENT_DISBANDED,         onDeptDisbanded);
    Events.on(GameEvents.MAJOR_PATRON_OFFERED,         onPatronOffered);
    Events.on(GameEvents.MAJOR_PATRON_ACCEPTED,        onPatronAccepted);
    Events.on(GameEvents.MAJOR_PATRON_WITHDREW,        onPatronWithdrew);
    Events.on(GameEvents.MINOR_COMMISSION_OFFERED,     onCommissionOffered);
    Events.on(GameEvents.MINOR_COMMISSION_ACCEPTED,    onCommissionAccepted);
    Events.on(GameEvents.MINOR_COMMISSION_DECLINED,    onCommissionDeclined);
    Events.on(GameEvents.MINOR_COMMISSION_COMPLETED,   onCommissionCompleted);
    Events.on(GameEvents.GRANT_CLAIMED,                onGrantClaimed);
    Events.on(GameEvents.WORK_RIGHTS_SOLD,             onWorkRightsSold);
    Events.on(GameEvents.PATRON_APPEAL_USED,           onPatronAppeal);
    Events.on(GameEvents.GAME_OVER,                    onGameOver);
    Events.on(GameEvents.IDEOLOGY_DRIFT,               onIdeologyDrift);
    Events.on(GameEvents.FACTION_FAVOR_OFFERED,        onFactionFavor);
    Events.on(GameEvents.FACTION_DENOUNCED,            onFactionDenounce);
    Events.on(GameEvents.WORK_SUPPRESSED,              onWorkSuppressed);
    Events.on(GameEvents.FACTION_PATRONAGE_OFFERED,    onFactionPatronage);
    Events.on(GameEvents.DEPARTMENT_PROJECT_PROPOSED,  onDeptProposed);
    Events.on(GameEvents.DEPARTMENT_PROJECT_ESCALATED, onDeptEscalated);
    Events.on(GameEvents.DEPARTMENT_PROJECT_COMPLETED, onDeptCompleted);
    Events.on(GameEvents.FOUNDER_SUCCESSION,           onFounderSuccession);
    Events.on(GameEvents.RIVAL_RELEASED,                onRivalReleased);
    Events.on(GameEvents.WORLD_EVENT_STARTED,           onWorldEventStarted);
    Events.on(GameEvents.WORLD_EVENT_ENDED,             onWorldEventEnded);
    Events.on(GameEvents.POACH_ATTEMPT,                 onPoachAttempt);
    Events.on(GameEvents.SCHOLAR_POACHED,               onScholarPoached);
    Events.on(GameEvents.CHEMISTRY_BAND_CHANGED,        onChemistryBand);
    Events.on(GameEvents.REPRINT_STARTED,                onReprintStarted);
    Events.on(GameEvents.REPRINT_COMPLETED,              onReprintCompleted);
    Events.on(GameEvents.WORK_SALE_TICK,                 onWorkSaleTick);
    Events.on(GameEvents.WORK_SALES_FINISHED,            onWorkSalesFinished);

    this.events.once('shutdown', () => {
      Events.off(GameEvents.DAY_PASSED,        onDay);
      Events.off(GameEvents.TREASURY_CHANGED,  onTreasury);
      Events.off(GameEvents.MONTH_LEDGER,      onMonthLedger);
      Events.off(GameEvents.PROJECT_STARTED,   onStarted);
      Events.off(GameEvents.PROJECT_PROGRESS,  onProgress);
      Events.off(GameEvents.MID_PROJECT_EVENT, onMidEvent);
      Events.off(GameEvents.PROJECT_STAGE_GATE, onStageGate);
      Events.off(GameEvents.PROJECT_STAGE_STARTED, onStageStarted);
      Events.off(GameEvents.PROJECT_COMPLETED, onCompleted);
      Events.off(GameEvents.SCHOLAR_SKILL_UP,  onSkillUp);
      Events.off(GameEvents.SCHOLAR_HIRED,     onHired);
      Events.off(GameEvents.TREASURY_LOW,      onLow);
      Events.off(GameEvents.BANKRUPTCY,        onBankrupt);
      Events.off(GameEvents.PATRON_GRANTED,    onPatron);
      Events.off(GameEvents.SCHOLAR_TRAIT_REVEALED,  onTraitRev);
      Events.off(GameEvents.SCHOLAR_TALENT_REVEALED, onTalentRev);
      Events.off(GameEvents.SCHOLAR_RESTLESS,        onRestless);
      Events.off(GameEvents.SCHOLAR_LEFT,            onLeft);
      Events.off(GameEvents.SCHOLAR_AMBITION_FULFILLED, onAmbition);
      Events.off(GameEvents.SCHOLAR_FEAR_TRIGGERED,     onFear);
      Events.off(GameEvents.SCHOLAR_RETIRED,             onRetired);
      Events.off(GameEvents.TIER_PROMOTED,                onTierPromoted);
      Events.off(GameEvents.ZONE_UNLOCKED,                onZoneUnlocked);
      Events.off(GameEvents.DEPARTMENT_FOUNDED,           onDeptFounded);
      Events.off(GameEvents.DEPARTMENT_DISBANDED,         onDeptDisbanded);
      Events.off(GameEvents.MAJOR_PATRON_OFFERED,         onPatronOffered);
      Events.off(GameEvents.MAJOR_PATRON_ACCEPTED,        onPatronAccepted);
      Events.off(GameEvents.MAJOR_PATRON_WITHDREW,        onPatronWithdrew);
      Events.off(GameEvents.MINOR_COMMISSION_OFFERED,     onCommissionOffered);
      Events.off(GameEvents.MINOR_COMMISSION_ACCEPTED,    onCommissionAccepted);
      Events.off(GameEvents.MINOR_COMMISSION_DECLINED,    onCommissionDeclined);
      Events.off(GameEvents.MINOR_COMMISSION_COMPLETED,   onCommissionCompleted);
      Events.off(GameEvents.GRANT_CLAIMED,                onGrantClaimed);
      Events.off(GameEvents.WORK_RIGHTS_SOLD,             onWorkRightsSold);
      Events.off(GameEvents.PATRON_APPEAL_USED,           onPatronAppeal);
      Events.off(GameEvents.GAME_OVER,                    onGameOver);
      Events.off(GameEvents.IDEOLOGY_DRIFT,               onIdeologyDrift);
      Events.off(GameEvents.FACTION_FAVOR_OFFERED,        onFactionFavor);
      Events.off(GameEvents.FACTION_DENOUNCED,            onFactionDenounce);
      Events.off(GameEvents.WORK_SUPPRESSED,              onWorkSuppressed);
      Events.off(GameEvents.FACTION_PATRONAGE_OFFERED,    onFactionPatronage);
      Events.off(GameEvents.DEPARTMENT_PROJECT_PROPOSED,  onDeptProposed);
      Events.off(GameEvents.DEPARTMENT_PROJECT_ESCALATED, onDeptEscalated);
      Events.off(GameEvents.DEPARTMENT_PROJECT_COMPLETED, onDeptCompleted);
      Events.off(GameEvents.FOUNDER_SUCCESSION,           onFounderSuccession);
      Events.off(GameEvents.RIVAL_RELEASED,                onRivalReleased);
      Events.off(GameEvents.WORLD_EVENT_STARTED,           onWorldEventStarted);
      Events.off(GameEvents.WORLD_EVENT_ENDED,             onWorldEventEnded);
      Events.off(GameEvents.POACH_ATTEMPT,                 onPoachAttempt);
      Events.off(GameEvents.SCHOLAR_POACHED,               onScholarPoached);
      Events.off(GameEvents.CHEMISTRY_BAND_CHANGED,        onChemistryBand);
      Events.off(GameEvents.REPRINT_STARTED,                onReprintStarted);
      Events.off(GameEvents.REPRINT_COMPLETED,              onReprintCompleted);
      Events.off(GameEvents.WORK_SALE_TICK,                 onWorkSaleTick);
      Events.off(GameEvents.WORK_SALES_FINISHED,            onWorkSalesFinished);
      Game.time.setSpeed('paused');
      this.projectPanel.hide();
      this.scholarPanel.hide();
      this.institutionPanel.hide();
      this.treasuryPanel.hide();
      this.ideologyPanel.hide();
      this.worldPanel.hide();
      this.eventModal.hide();
      this.stageGateModal.hide();
      this.activeWorkTimer?.remove(false);
      this.birdTimer?.remove(false);
      this.emoteTimer?.remove(false);
      this.idleChatTimer?.remove(false);
      this.snowTimer?.remove(false);
      this.snowTimer = undefined;
      this.snowing = false;
      this.destroyActors();
      this.chronicleCards = [];
      this.projectSystem.destroy();
      this.recruitment.destroy();
      this.milestones.destroy();
      this.institution.destroy();
      this.departments.destroy();
      this.world.destroy();
      this.reprints.destroy();
      this.sales.destroy();
    });

    this.cameras.main.fadeIn(600, 26, 15, 10);
  }

  // ── Campus stage ───────────────────────────────────────────────────

  // Lanterns swap to their lit texture after dusk; tier-gated set pieces
  // are tracked so promotions can add them without rebuilding the scene.
  private lanternSprites: Phaser.GameObjects.Image[] = [];
  private placedSetPieceKeys = new Set<string>();

  // Compose the campus from the pixel-art kit: procedural sky, tiled
  // plateau, architecture, courtyard props. All sprites are 1× pixel art
  // drawn at scale 2 so the grain matches the character sheets.
  private buildCampusStage() {
    this.placedSetPieceKeys.clear();
    this.lanternSprites = [];

    // Sky backdrop (640×360 at 2×, horizon lands at SKY_HORIZON_Y).
    this.add.image(0, 0, 'bg_campus_sky').setOrigin(0).setScale(2);

    // Ground bands — tileSprites tile at 1× and scale up with the grain.
    const band = (r: { x: number; y: number; w: number; h: number }, tex: string) =>
      this.add.tileSprite(r.x, r.y, r.w / 2, r.h / 2, tex).setOrigin(0).setScale(2);
    band(GROUND.grass, 'tile_grass');
    band(GROUND.courtyard, 'tile_flagstone');
    band(GROUND.path, 'tile_flagstone');
    band(GROUND.rim, 'tile_wall');

    // Soft edge shadow where the courtyard meets the grass.
    this.add.rectangle(
      GROUND.courtyard.x + GROUND.courtyard.w / 2, GROUND.courtyard.y + 2,
      GROUND.courtyard.w, 4, 0x120804, 0.25,
    );

    // Architecture + the actor layer (so courtyard props y-sort with
    // scholars). Tier-gated pieces are added via buildTierSetPieces.
    this.actorsLayer = this.add.container(0, 0);
    this.buildTierSetPieces();

    // Lanterns flank the hall door and courtyard corners; lit after dusk.
    for (const p of LANTERNS) {
      const lantern = this.add.image(p.x, p.y, 'prop_lantern_off')
        .setOrigin(0.5, 1)
        .setScale(2);
      this.actorsLayer.add(lantern);
      this.lanternSprites.push(lantern);
    }
  }

  // Place buildings and courtyard props allowed at the current tier that
  // are not on the stage yet. Called at build time and on TIER_PROMOTED.
  private buildTierSetPieces() {
    const tier = Game.state.tier;
    for (const piece of [...BUILDINGS, ...COURTYARD_PROPS]) {
      const id = `${piece.key}@${piece.x},${piece.y}`;
      if (this.placedSetPieceKeys.has(id)) continue;
      if (piece.minTier && tier < piece.minTier) continue;
      if (!this.textures.exists(piece.key)) continue;
      this.placedSetPieceKeys.add(id);
      const img = this.add.image(piece.x, piece.y, piece.key)
        .setOrigin(0.5, 1)
        .setScale(2);
      if (piece.walkable) this.actorsLayer.add(img);
      else this.children.moveBelow(img, this.actorsLayer);
    }
  }

  // ── Animations & input ─────────────────────────────────────────────

  // Register sprite animations once (anims are global across scene restarts).
  // NEAREST filtering comes from the global render.pixelArt flag.
  private ensureCampusAnims() {
    const make = (key: string, tex: string, frames: number, rate: number, repeat: number, yoyo = false) => {
      if (!this.textures.exists(tex)) return;
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(tex, { start: 0, end: frames - 1 }),
        frameRate: rate,
        repeat,
        yoyo,
      });
    };
    for (const id of NAMED_SCHOLARS) {
      make(`${id}_idle`,  `scholar_${id}_idle`,  4, 5, -1, true);
      make(`${id}_walk`,  `scholar_${id}_walk`,  4, 9, -1);
      make(`${id}_sit`,   `scholar_${id}_sit`,   2, 2, -1, true);
      make(`${id}_react`, `scholar_${id}_react`, 2, 6, 3, true);
    }
    for (const v of GENERIC_VARIANTS) {
      make(`generic_${v}_idle`, `scholar_generic_${v}_idle`, 4, 5, -1, true);
    }
    make('student_idle', 'student_idle', 4, 5, -1, true);
    make('student_walk', 'student_walk', 4, 9, -1);
    make('bird_fly',     'bird_sheet',   6, 9, -1);
  }

  // Space toggles pause, 1/2 select normal/fast. Skipped while the player is
  // typing into a DOM panel input or while a blocking modal is open.
  private buildKeyboardShortcuts() {
    const kb = this.input.keyboard;
    if (!kb) return;
    const blocked = () => {
      const el = document.activeElement;
      if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return true;
      return this.eventModal.isOpen()
        || this.stageGateModal.isOpen()
        || this.projectPanel.isOpen();
    };
    kb.on('keydown-SPACE', () => {
      if (blocked()) return;
      this.applySpeed(Game.time.speed === 'paused' ? 'normal' : 'paused');
    });
    kb.on('keydown-ONE', () => { if (!blocked()) this.applySpeed('normal'); });
    kb.on('keydown-TWO', () => { if (!blocked()) this.applySpeed('fast'); });
  }

  // ── Day/night & seasons ────────────────────────────────────────────

  // Mood layers sit above the campus life but below the UI bars: a cool
  // multiply wash for dusk/night, a faint cold wash for winter, and warm
  // window glows + lantern flames that come alive after dark.
  private buildMoodLayers(width: number, height: number) {
    this.duskOverlay = this.add.rectangle(width / 2, height / 2, width, height, 0x16203e)
      .setBlendMode(Phaser.BlendModes.MULTIPLY)
      .setAlpha(0);
    this.winterOverlay = this.add.rectangle(width / 2, height / 2, width, height, 0xaec4dc)
      .setBlendMode(Phaser.BlendModes.MULTIPLY)
      .setAlpha(0);

    // Warm light anchored to the placed lantern sprites and the founding
    // hall's painted windows (positions from campusLayout).
    this.nightLights = this.add.container(0, 0).setAlpha(0);
    for (const p of LANTERNS) {
      // The flame sits near the top of the 16×24 lantern drawn at 2×.
      const fx = p.x, fy = p.y - 34;
      const halo = this.add.circle(fx, fy, 14, 0xff9840, 0.18).setBlendMode(Phaser.BlendModes.ADD);
      const core = this.add.circle(fx, fy, 5, 0xffd080, 0.50).setBlendMode(Phaser.BlendModes.ADD);
      // Faint pool of light on the flagstones beneath the lantern.
      const pool = this.add.ellipse(p.x, p.y + 4, 52, 18, 0xff9840, 0.10).setBlendMode(Phaser.BlendModes.ADD);
      this.nightLights.add([halo, core, pool]);
      this.tweens.add({
        targets: [halo, core], alpha: '-=0.08', scaleX: 1.25, scaleY: 1.25,
        duration: 380 + Math.random() * 240, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    }
    for (const w of WINDOW_GLOWS) {
      const windowGlow = this.add.ellipse(w.x, w.y, w.w, w.h, 0xffb050, 0.28).setBlendMode(Phaser.BlendModes.ADD);
      this.nightLights.add(windowGlow);
      this.tweens.add({
        targets: windowGlow, alpha: 0.38, duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    }
  }

  // Each month ends in a short night: dusk falls around day 24, full dark
  // holds through 28, and dawn breaks before the new month. Winter (months
  // 12 and 1 of each year) adds a cold cast and falling snow.
  private updateDayNight(day: number, immediate = false) {
    const dayOfMonth = ((day - 1) % 30) + 1;
    const NIGHT: Record<number, number> = {
      23: 0.12, 24: 0.24, 25: 0.36, 26: 0.44, 27: 0.46, 28: 0.44, 29: 0.30, 30: 0.12,
    };
    const duskTarget  = NIGHT[dayOfMonth] ?? 0;
    const lightTarget = Math.min(1, duskTarget / 0.36);

    const monthOfYear = (Math.floor((day - 1) / 30) % 12) + 1;
    const winter = monthOfYear === 12 || monthOfYear === 1;
    const winterTarget = winter ? 0.14 : 0;
    this.setSnowing(winter);

    // Lanterns light up as dusk falls.
    const lanternTex = lightTarget > 0.4 ? 'prop_lantern_on' : 'prop_lantern_off';
    for (const lantern of this.lanternSprites) {
      if (lantern.active && lantern.texture.key !== lanternTex) lantern.setTexture(lanternTex);
    }

    if (immediate) {
      this.duskOverlay.setAlpha(duskTarget);
      this.nightLights.setAlpha(lightTarget);
      this.winterOverlay.setAlpha(winterTarget);
      return;
    }
    this.tweens.killTweensOf(this.duskOverlay);
    this.tweens.killTweensOf(this.nightLights);
    this.tweens.killTweensOf(this.winterOverlay);
    this.tweens.add({ targets: this.duskOverlay,   alpha: duskTarget,   duration: 1100, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: this.nightLights,   alpha: lightTarget,  duration: 1100, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: this.winterOverlay, alpha: winterTarget, duration: 1100, ease: 'Sine.easeInOut' });
  }

  private setSnowing(on: boolean) {
    if (on === this.snowing) return;
    this.snowing = on;
    if (!on) {
      this.snowTimer?.remove(false);
      this.snowTimer = undefined;
      return;
    }
    this.snowTimer = this.time.addEvent({
      delay: 240,
      loop: true,
      callback: () => this.spawnSnowflake(),
    });
  }

  private spawnSnowflake() {
    const x = Math.random() * 1280;
    const flake = this.add.circle(x, -6, 1.5 + Math.random() * 1.8, 0xf4f6fb, 0.45 + Math.random() * 0.35);
    // Drawn into the ambient layer so flakes stay under the UI chrome.
    this.ambientLayer.add(flake);
    this.tweens.add({
      targets: flake,
      y: 700,
      x: x + (Math.random() - 0.5) * 140,
      duration: 6500 + Math.random() * 4500,
      ease: 'Sine.easeInOut',
      onComplete: () => flake.destroy(),
    });
  }

  // ── Campus life ───────────────────────────────────────────────────

  private buildAmbientLayer() {
    this.ambientLayer = this.add.container(0, 0);
    this.buildAnchoredAmbientArt();
    this.buildDustMotes();
    this.startSkyLife();
    this.updateAmbientMood();
  }

  private activeWorkHalo!: Phaser.GameObjects.Ellipse;

  private buildActiveWorkLayer() {
    const { x, y } = ACTIVE_WORK_AREA;
    this.activeWorkLayer = this.add.container(0, 0).setVisible(false);

    // Soft halo behind the station — gets tinted by stage. Pulses slowly so
    // the focal point of the campus reads as "alive" during a project.
    const halo = this.add.ellipse(x, y + 6, 230, 110, 0xd4a855, 0.10)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.activeWorkHalo = halo;
    this.tweens.add({
      targets: halo,
      alpha: 0.22,
      scaleX: 1.08,
      scaleY: 1.08,
      duration: 2200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const stationShadow = this.add.ellipse(x, y + 42, 190, 40, 0x120804, 0.40);

    // Parchment slab under the station — gives the icon weight on the ground
    const parchment = this.add.ellipse(x, y + 30, 150, 24, 0x6a4828, 0.22)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);

    this.activeWorkStation = this.add.image(x, y + 10, 'workstation_research')
      .setOrigin(0.5, 0.68)
      .setScale(2)
      .setAlpha(0.97);

    this.activeWorkTitle = this.add.text(x, y - 94, '', {
      fontSize: '16px',
      color: '#e8d5b0',
      fontFamily: DISPLAY_FONT,
      stroke: '#1a0d06',
      strokeThickness: 3,
    }).setOrigin(0.5);
    this.activeWorkStage = this.add.text(x, y - 72, '', {
      fontSize: '12px',
      color: '#d4a855',
      fontFamily: 'Georgia, serif',
      stroke: '#1a0d06',
      strokeThickness: 3,
    }).setOrigin(0.5);

    this.activeWorkLayer.add([
      halo, stationShadow, parchment, this.activeWorkStation,
      this.activeWorkTitle, this.activeWorkStage,
    ]);
  }

  private buildAnchoredAmbientArt() {
    // Drifting pixel clouds above the mountain horizon.
    const clouds: Array<[string, number, number, number]> = [
      ['cloud_px_a', 180, 96, 0.5],   // [tex, x, y, alpha]
      ['cloud_px_b', 520, 150, 0.38],
      ['cloud_px_a', 950, 120, 0.42],
    ];
    clouds.forEach(([tex, x, y, alpha], i) => {
      if (!this.textures.exists(tex)) return;
      const cloud = this.add.image(x, y, tex).setScale(2).setAlpha(alpha);
      this.ambientLayer.add(cloud);
      this.tweens.add({
        targets: cloud,
        x: x + 60 + i * 24,
        duration: 36000 + i * 9000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    });
  }

  private buildDustMotes() {
    for (let i = 0; i < 16; i++) {
      const mote = this.add.circle(
        DUST_MOTE_BOUNDS.x + Math.random() * DUST_MOTE_BOUNDS.w,
        DUST_MOTE_BOUNDS.y + Math.random() * DUST_MOTE_BOUNDS.h,
        1 + Math.random() * 1.4,
        0xf2d19a,
        0.08 + Math.random() * 0.12,
      ).setBlendMode(Phaser.BlendModes.ADD);
      this.ambientLayer.add(mote);

      this.tweens.add({
        targets:  mote,
        x:        mote.x + (Math.random() - 0.5) * 32,
        y:        mote.y - (14 + Math.random() * 36),
        duration: 5200 + Math.random() * 4200,
        yoyo:     true,
        repeat:   -1,
        ease:     'Sine.easeInOut',
        delay:    Math.random() * 3000,
      });
      this.tweens.add({
        targets:  mote,
        alpha:    0.02,
        duration: 1800 + Math.random() * 1800,
        yoyo:     true,
        repeat:   -1,
        ease:     'Sine.easeInOut',
        delay:    Math.random() * 1600,
      });
    }
  }

  private startSkyLife() {
    this.birdTimer = this.time.addEvent({
      delay: 9000,
      loop: true,
      callback: () => this.spawnSkyBirds(),
    });
    this.time.delayedCall(2500, () => this.spawnSkyBirds());
  }

  private spawnSkyBirds() {
    // Birds cross the full mountain sky, above the rooflines.
    const groupSize = 1 + Math.floor(Math.random() * 3);
    const leftToRight = Math.random() < 0.5;
    const startX = leftToRight ? -40 : 1320;
    const endX = leftToRight ? 1320 : -40;
    const startY = 70 + Math.random() * 110;
    const canFly = this.textures.exists('bird_sheet') && this.anims.exists('bird_fly');

    for (let i = 0; i < groupSize; i++) {
      const x = startX - i * (16 + Math.random() * 16);
      const y = startY + (Math.random() - 0.5) * 34;
      const bird = canFly
        ? this.add.sprite(x, y, 'bird_sheet')
        : this.add.image(x, y, 'ambient_birds_sheet');
      bird.setOrigin(0.5)
        .setScale(0.16 + Math.random() * 0.08)
        .setAlpha(0.24)
        .setFlipX(!leftToRight);
      if (canFly) {
        (bird as Phaser.GameObjects.Sprite).play({ key: 'bird_fly', delay: Math.random() * 300 });
      }
      this.ambientLayer.add(bird);

      this.tweens.add({
        targets: bird,
        x: endX,
        y: bird.y - 12 + Math.random() * 10,
        alpha: 0.18,
        duration: 10500 + Math.random() * 4200,
        ease: 'Sine.easeInOut',
        onComplete: () => bird.destroy(),
      });
    }
  }

  private updateAmbientMood() {
    const treasuryState = getTreasuryState(Game.state.treasury);
    const targetAlpha = treasuryState === 'critical' ? 0.55
      : treasuryState === 'strained' ? 0.75
      : 1;

    this.tweens.add({
      targets:  this.ambientLayer,
      alpha:    targetAlpha,
      duration: 900,
      ease:     'Sine.easeInOut',
    });
  }

  // ── Work-table social life ─────────────────────────────────────────

  // While a project runs, scholars at the table periodically exchange
  // emotes driven by their actual chemistry scores — partnerships glow,
  // rivalries spark. This is the visible texture of "the team at work."
  private startWorkEmotes() {
    if (this.emoteTimer) return;
    this.emoteTimer = this.time.addEvent({
      delay: 4600,
      loop: true,
      callback: () => this.emitWorkEmote(),
    });
  }

  private stopWorkEmotes() {
    this.emoteTimer?.remove(false);
    this.emoteTimer = undefined;
  }

  private emitWorkEmote() {
    const project = Game.state.activeProject;
    const stage = project?.stages[project.stages.length - 1];
    if (!project || !stage || project.state !== 'in_development') return;

    const ids = [stage.leadScholarId, ...stage.assistantScholarIds]
      .filter(id => this.actors.has(id));
    if (ids.length === 0) return;

    // Pairs chat most of the time; otherwise the lead mutters over the work.
    if (ids.length >= 2 && Math.random() < 0.75) {
      const i = Math.floor(Math.random() * ids.length);
      let j = Math.floor(Math.random() * (ids.length - 1));
      if (j >= i) j += 1;
      this.emoteChat(ids[i], ids[j]);
    } else {
      const lead = this.actors.get(stage.leadScholarId);
      if (lead) this.spawnEmote(lead, '✎', '#c8a87a');
    }
  }

  // Glyph + color for a chemistry score between two working scholars.
  private chemistryEmote(score: number): { glyph: string; color: string } {
    if (score >= 80)  return { glyph: '♥', color: '#e8b4c8' };
    if (score >= 50)  return { glyph: '♥', color: '#d4a855' };
    if (score >= 20)  return { glyph: '♪', color: '#8ab87a' };
    if (score <= -80) return { glyph: '⚡', color: '#c84a3a' };
    if (score <= -50) return { glyph: '⚡', color: '#c87a4a' };
    if (score <= -20) return { glyph: '✗', color: '#a88858' };
    return { glyph: '…', color: '#a89878' };
  }

  private emoteChat(idA: string, idB: string) {
    const a = this.actors.get(idA);
    const b = this.actors.get(idB);
    if (!a || !b) return;
    const score = getScore(idA, idB);
    const { glyph, color } = this.chemistryEmote(score);
    const friendly = score >= 20;
    const hostile  = score <= -20;

    for (const actor of [a, b]) {
      // Small hop — toward each other when friendly, a stiff shrug otherwise.
      const dir = actor === a ? Math.sign(b.container.x - a.container.x) : Math.sign(a.container.x - b.container.x);
      this.tweens.add({
        targets: actor.container,
        y: actor.container.y - (friendly ? 5 : 3),
        x: actor.container.x + (friendly ? dir * 3 : 0),
        angle: hostile ? (actor === a ? -3 : 3) : 0,
        duration: 150,
        yoyo: true,
        ease: 'Sine.easeOut',
      });
      this.spawnEmote(actor, glyph, color);
    }
  }

  private spawnEmote(actor: ScholarActor, glyph: string, color: string) {
    const x = actor.container.x + (Math.random() - 0.5) * 10;
    const y = actor.container.y - 104;
    const emote = this.add.text(x, y, glyph, {
      fontSize: '15px', color, fontFamily: 'Georgia, serif',
      stroke: '#0d0704', strokeThickness: 3,
    }).setOrigin(0.5).setAlpha(0).setDepth(8);
    this.tweens.add({
      targets: emote,
      alpha: { from: 0, to: 0.95 },
      y: y - 14,
      duration: 420,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: emote, alpha: 0, y: emote.y - 10, duration: 700, delay: 350,
          onComplete: () => emote.destroy(),
        });
      },
    });
  }

  // Idle scholars near each other occasionally exchange a word, colored by
  // their chemistry — keeps the courtyard alive between projects and
  // quietly teaches who works well with whom.
  private emitIdleChatter() {
    if (Game.state.activeProject) return; // work emotes cover project time
    if (Math.random() < 0.45) return;
    const idle = [...this.actors.entries()].filter(([, a]) => a.mode === 'idle' && !a.walkTween);
    for (let i = 0; i < idle.length; i++) {
      for (let j = i + 1; j < idle.length; j++) {
        const [idA, a] = idle[i];
        const [idB, b] = idle[j];
        const close = Phaser.Math.Distance.Between(
          a.container.x, a.container.y, b.container.x, b.container.y,
        ) < 240;
        if (close) {
          this.emoteChat(idA, idB);
          return;
        }
      }
    }
  }

  // React animation on one scholar (skill-ups, mid-events, celebrations).
  private playReact(scholarId: string) {
    const actor = this.actors.get(scholarId);
    if (!actor || !actor.hasFullAnims || actor.walkTween) return;
    if (actor.mode === 'working') {
      // Return to the seated pose after reacting.
      actor.sprite.play(`${actor.spriteSet}_react`);
      actor.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        if (actor.mode === 'working') actor.sprite.play(`${actor.spriteSet}_sit`);
        else this.playMotionAnim(actor, 'idle');
      });
    } else if (actor.mode === 'idle') {
      actor.sprite.play(`${actor.spriteSet}_react`);
      actor.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        if (actor.mode === 'idle') this.playMotionAnim(actor, 'idle');
      });
    }
  }

  // Everyone at the table cheers — used at stage completions and release.
  private celebrateWorkTeam(burst: boolean) {
    const project = Game.state.activeProject;
    const stage = project?.stages[project.stages.length - 1];
    const ids = stage ? [stage.leadScholarId, ...stage.assistantScholarIds] : [];
    for (const id of ids) {
      const actor = this.actors.get(id);
      if (!actor) continue;
      this.playReact(id);
      this.tweens.add({
        targets: actor.container,
        y: actor.container.y - 9,
        duration: 170,
        yoyo: true,
        repeat: 1,
        ease: 'Sine.easeOut',
      });
    }
    if (burst) this.spawnCompletionBurst();
  }

  private spawnCompletionBurst() {
    const { x, y } = ACTIVE_WORK_AREA;
    for (let i = 0; i < 14; i++) {
      const angle = (i / 14) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 50 + Math.random() * 70;
      const spark = this.add.image(x, y - 20, 'fx_gold_sparkle', 1 + Math.floor(Math.random() * 2))
        .setScale(1.2 + Math.random() * 1.2)
        .setAlpha(0.9)
        .setDepth(8)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * dist,
        y: y - 20 + Math.sin(angle) * dist * 0.6 - 30,
        alpha: 0,
        angle: (Math.random() - 0.5) * 180,
        duration: 800 + Math.random() * 400,
        ease: 'Cubic.easeOut',
        onComplete: () => spark.destroy(),
      });
    }
  }

  // ── Stage axis bubbles + live gauge ────────────────────────────────

  // Reset the accumulator + gauge labels for a stage. Called at project
  // start and at every stage gate.
  private resetStageGauge(stageKey: StageKey) {
    const axes = STAGE_AXES[stageKey];
    this.stageAxisAccumulator = {};
    this.stageGaugeKeyForIndex = [...axes];
    for (let i = 0; i < 3; i++) {
      const axis = axes[i];
      this.stageAxisAccumulator[axis] = 0;
      this.stageGaugeLabels[i].setText(axis);
      this.stageGaugeValues[i].setText('0');
      this.stageGaugeFills[i].width = 1;
    }
  }

  private showStageGauge() {
    for (const t of this.stageGaugeTracks) t.setVisible(true);
    for (const f of this.stageGaugeFills)  f.setVisible(true);
    for (const l of this.stageGaugeLabels) l.setVisible(true);
    for (const v of this.stageGaugeValues) v.setVisible(true);
  }

  private hideStageGauge() {
    for (const t of this.stageGaugeTracks) t.setVisible(false);
    for (const f of this.stageGaugeFills)  f.setVisible(false);
    for (const l of this.stageGaugeLabels) l.setVisible(false);
    for (const v of this.stageGaugeValues) v.setVisible(false);
  }

  private refreshStageGauge() {
    // Find the current maximum so the fills are relative — visually you can
    // tell which axis is being emphasized even early on.
    let maxVal = 0;
    for (const axis of this.stageGaugeKeyForIndex) {
      maxVal = Math.max(maxVal, this.stageAxisAccumulator[axis] ?? 0);
    }
    const denom = Math.max(maxVal, 8); // floor so first bubble doesn't fill 100%
    for (let i = 0; i < 3; i++) {
      const axis = this.stageGaugeKeyForIndex[i];
      const v    = this.stageAxisAccumulator[axis] ?? 0;
      const track = this.stageGaugeTracks[i];
      const fill  = this.stageGaugeFills[i];
      fill.width = Math.max(1, track.width * (v / denom));
      this.stageGaugeValues[i].setText(String(v));
    }
  }

  private startBubbleEmitter() {
    if (this.bubbleTimer) return;
    this.bubbleTimer = this.time.addEvent({
      delay: 1100,
      loop: true,
      callback: () => this.emitBubbleRound(),
    });
  }

  private stopBubbleEmitter() {
    this.bubbleTimer?.remove(false);
    this.bubbleTimer = undefined;
  }

  // One emission tick: every working scholar has a chance to drop a bubble
  // on one of the current stage's 3 axes. Probability + value scale with
  // their topic skill. The lead drops bigger/more bubbles than assistants.
  private emitBubbleRound() {
    const project = Game.state.activeProject;
    if (!project || project.state !== 'in_development') return;
    const stage = project.stages[project.stages.length - 1];
    if (!stage) return;
    const topic = TOPICS.find(t => t.id === project.topicId);
    if (!topic) return;
    const axes = STAGE_AXES[stage.key];

    const positions = this.activeWorkScholarPositions();
    for (const [scholarId, pos] of positions) {
      const scholar = Game.state.scholars.find(s => s.id === scholarId);
      if (!scholar) continue;
      const isLead = scholarId === stage.leadScholarId;
      const skill  = scholar.disciplines[topic.name] ?? 1;
      // Drop chance: 50% baseline scaled by skill 1-10
      const dropChance = (isLead ? 0.55 : 0.35) + skill * 0.025;
      if (Math.random() > dropChance) continue;
      // Pick an axis — weight by the stage's emphasis points if any were
      // spent, otherwise even split. This makes the player's emphasis
      // visible in real time.
      const axis = this.pickAxisForScholar(stage, axes);
      // Value: 1..3 driven by skill, lead gets a small bonus
      const base = 1 + Math.floor((skill / 10) * 2);
      const value = base + (isLead ? 1 : 0) + (Math.random() < 0.18 ? 1 : 0);
      this.stageAxisAccumulator[axis] = (this.stageAxisAccumulator[axis] ?? 0) + value;
      this.spawnBubble(pos.x, pos.y - 86, axis, value, isLead, skill);
    }
    this.refreshStageGauge();
  }

  private pickAxisForScholar(
    stage: import('../models/Project').StageRecord,
    axes: readonly string[],
  ): string {
    const weights: number[] = [];
    let total = 0;
    for (const a of axes) {
      // base 1 + 2× emphasis points the player allocated to this axis
      const w = 1 + 2 * (stage.emphasis?.[a] ?? 0);
      weights.push(w);
      total += w;
    }
    let pick = Math.random() * total;
    for (let i = 0; i < axes.length; i++) {
      pick -= weights[i];
      if (pick <= 0) return axes[i];
    }
    return axes[axes.length - 1];
  }

  // Visual bubble — small text chip that floats up and fades out.
  // Big numbers come in brighter and a touch larger.
  private spawnBubble(x: number, y: number, axis: string, value: number, isLead: boolean, skill: number) {
    const quality = Math.min(1, (skill + value) / 13);
    const color = quality >= 0.7 ? '#8ab87a'
                : quality >= 0.4 ? '#d4a855'
                :                  '#a88858';
    const fontSize = 9 + Math.min(4, value);
    const bubble = this.add.text(x + (Math.random() - 0.5) * 18, y, `+${value} ${axis}`, {
      fontSize: `${fontSize}px`,
      color,
      fontFamily: 'Georgia, serif',
      stroke: '#0d0704',
      strokeThickness: 3,
      fontStyle: isLead ? 'bold' : 'normal',
    }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({
      targets: bubble,
      alpha: { from: 0, to: 0.95 },
      y: bubble.y - 28,
      duration: 700,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: bubble,
          alpha: 0,
          y: bubble.y - 8,
          duration: 600,
          onComplete: () => bubble.destroy(),
        });
      },
    });
  }

  private showActiveWork(project: Project) {
    this.activeWorkLayer.setVisible(true);
    this.refreshActiveWork(project);
    this.startActiveWorkEffects();
  }

  private hideActiveWork() {
    this.activeWorkLayer.setVisible(false);
    this.activeWorkTimer?.remove(false);
    this.activeWorkTimer = undefined;
  }

  private refreshActiveWork(project: Project) {
    const topic = TOPICS.find(t => t.id === project.topicId);
    const format = FORMATS.find(f => f.id === project.formatId);
    const stage = project.stages[project.stages.length - 1];
    const stageInfo = stage ? STAGE_INFO[stage.key] : undefined;
    const tint = stage ? STAGE_TINTS[stage.key] : 0xd4a855;

    this.activeWorkStation.setTexture(`workstation_${stage?.key ?? 'research'}`);
    this.activeWorkTitle.setText(`${format?.name ?? 'Work'} on ${topic?.name ?? 'Unknown'}`);
    this.activeWorkStage.setText(stageInfo ? `${stageInfo.label} in progress` : 'In progress');
    this.activeWorkStage.setColor(`#${tint.toString(16).padStart(6, '0')}`);
    // Halo tracks the stage tint so the focal area in the campus picks up
    // the same color language as the segmented HUD bar.
    if (this.activeWorkHalo) this.activeWorkHalo.setFillStyle(tint, 0.18);
  }

  // Progress is shown entirely by the segmented HUD bar in the panel above
  // the bottom bar; this is a no-op stub kept to avoid touching every caller.
  private updateActiveWorkProgress(_progress: number) {
    // intentionally empty
  }

  private startActiveWorkEffects() {
    if (this.activeWorkTimer) return;
    this.activeWorkTimer = this.time.addEvent({
      delay: 1300,
      loop: true,
      callback: () => this.spawnStageActivity(),
    });
  }

  private spawnStageActivity() {
    const project = Game.state.activeProject;
    const stage = project?.stages[project.stages.length - 1];
    if (!project || !stage || !this.activeWorkLayer.visible) return;

    this.spawnStageSpark(stage.key);
  }

  // Stage effects are anchored to fixed points ON the workstation art —
  // books on the left (research), the quill area on the right (drafting),
  // the manuscript center (refinement) — so the motion reads as part of the
  // desk rather than detached glows.
  private spawnStageSpark(stage: StageKey) {
    const anchors: Record<StageKey, { dx: number; dy: number; tex: string; frame: number; scale: number; alpha: number }> = {
      research:   { dx: -34, dy: -34, tex: 'fx_gold_sparkle', frame: 1, scale: 0.6, alpha: 0.30 },
      drafting:   { dx:  22, dy: -26, tex: 'fx_ink_splatter', frame: 2, scale: 0.65, alpha: 0.30 },
      refinement: { dx:   2, dy: -34, tex: 'fx_gold_sparkle', frame: 2, scale: 1.0, alpha: 0.45 },
    };
    const a = anchors[stage];
    const spark = this.add.image(
      ACTIVE_WORK_AREA.x + a.dx + (Math.random() - 0.5) * 14,
      ACTIVE_WORK_AREA.y + a.dy + (Math.random() - 0.5) * 8,
      a.tex,
      a.frame,
    )
      .setScale(a.scale + Math.random() * 0.04)
      .setAlpha(a.alpha)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.activeWorkLayer.add(spark);
    this.tweens.add({
      targets: spark,
      y: spark.y - 16,
      angle: (Math.random() - 0.5) * 30,
      alpha: 0,
      duration: 1100,
      ease: 'Sine.easeOut',
      onComplete: () => spark.destroy(),
    });
  }

  // Build one animated actor per scholar. Founders use their own sheets;
  // procedural hires share the three generic villager sheets (picked by a
  // stable hash of their id so a scholar keeps their look across sessions).
  private buildScholarSprites() {
    if (!this.actorsLayer || !this.actorsLayer.active) {
      this.actorsLayer = this.add.container(0, 0);
    }
    let hireSlot = 0;
    for (const scholar of Game.state.scholars) {
      const isNamed = (NAMED_SCHOLARS as readonly string[]).includes(scholar.id);
      const pos = isNamed
        ? SCHOLAR_POS[scholar.id as NamedId]
        : HIRE_POS[hireSlot++ % HIRE_POS.length];
      this.actors.set(scholar.id, this.buildActor(scholar.id, scholar, isNamed, pos));
    }
    this.refreshScholarSprites();
  }

  private rebuildScholarSprites() {
    this.destroyActors();
    this.buildScholarSprites();
  }

  // Students are independent of the roster and survive actor rebuilds;
  // the scene teardown destroys them with everything else.
  private destroyActors() {
    for (const actor of this.actors.values()) {
      actor.walkTween?.stop();
      actor.wanderEvent?.remove(false);
      actor.container.destroy();
    }
    this.actors.clear();
  }

  private genericVariant(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
    return `generic_${GENERIC_VARIANTS[Math.abs(hash) % GENERIC_VARIANTS.length]}`;
  }

  private buildActor(
    id: string,
    scholar: { name: string; isAvailable: boolean; isResting?: boolean },
    isNamed: boolean,
    pos: { x: number; y: number },
  ): ScholarActor {
    const firstName = scholar.name.split(' ')[0];
    const spriteSet = isNamed ? id : this.genericVariant(id);
    const idleTex = `scholar_${spriteSet}_idle`;

    const shadow = this.add.ellipse(0, 0, 40, 12, 0x120804, 0.35);
    const sprite = this.add.sprite(0, 2, this.textures.exists(idleTex) ? idleTex : 'scholar_yildiz_idle')
      .setOrigin(0.5, 1)
      .setScale(ACTOR_SCALE);
    const label = this.add.text(0, 6, firstName, {
      fontSize: '11px', color: '#c8a87a', fontFamily: 'Georgia, serif',
      stroke: '#1a0d06', strokeThickness: 3,
    }).setOrigin(0.5, 0);
    const zzz = this.add.text(16, -100, 'Zzz', {
      fontSize: '13px', color: '#8ab8c8', fontFamily: 'Georgia, serif',
      fontStyle: 'italic', stroke: '#0a1218', strokeThickness: 3,
    }).setOrigin(0.5).setVisible(scholar.isResting === true);
    // Restlessness warning — the campus itself signals who needs attention.
    const alert = this.add.text(-16, -102, '!', {
      fontSize: '15px', color: '#c87a4a', fontFamily: 'Georgia, serif',
      fontStyle: 'bold', stroke: '#1a0d06', strokeThickness: 3,
    }).setOrigin(0.5).setVisible(false);

    const container = this.add.container(pos.x, pos.y, [shadow, sprite, label, zzz, alert]);
    this.actorsLayer.add(container);

    const actor: ScholarActor = {
      container, sprite, label, zzz, alert,
      home: pos,
      spriteSet,
      hasFullAnims: isNamed,
      // Start in 'away' so the first refresh transitions into the real mode
      // (which kicks off wandering / seating as appropriate).
      mode: 'away',
      target: { ...pos },
    };
    this.playMotionAnim(actor, 'idle');

    sprite.setInteractive({ useHandCursor: true });
    sprite.on('pointerover', () => {
      label.setColor('#e8d5b0');
      Audio.playHover();
      const s = Game.state.scholars.find(sch => sch.id === id);
      const status = s?.restlessFlagged ? '  ·  restless' : s?.isResting ? '  ·  resting' : '';
      this.showTooltip(`${scholar.name} — ${s?.primaryDiscipline ?? ''}${status}`, container.x, container.y - 110);
    });
    sprite.on('pointerout', () => {
      label.setColor('#c8a87a');
      this.hideTooltip();
    });
    sprite.on('pointerdown', () => {
      this.hideTooltip();
      this.openScholarActionMenu(id);
    });

    return actor;
  }

  // Play idle/walk/sit by name with graceful fallback for generic sheets
  // that only ship an idle strip.
  private playMotionAnim(actor: ScholarActor, kind: 'idle' | 'walk' | 'sit') {
    const wanted = actor.hasFullAnims ? `${actor.spriteSet}_${kind}` : `${actor.spriteSet}_idle`;
    const fallback = `${actor.spriteSet}_idle`;
    const key = this.anims.exists(wanted) ? wanted : this.anims.exists(fallback) ? fallback : undefined;
    if (key && actor.sprite.anims?.currentAnim?.key !== key) actor.sprite.play(key);
  }

  // Show a small in-scene action menu anchored beneath the scholar's
  // sprite. Currently exposes: open detail panel, toggle rest.
  // The menu is a single transient container that destroys itself on
  // pointerdown anywhere off it.
  private scholarActionMenu?: Phaser.GameObjects.Container;
  private openScholarActionMenu(scholarId: string) {
    this.closeScholarActionMenu();

    const scholar = Game.state.scholars.find(s => s.id === scholarId);
    const actor = this.actors.get(scholarId);
    if (!scholar || !actor) return;

    const onProject = !scholar.isAvailable && !scholar.isResting;
    const canRest   = !onProject;

    // Menu positioned just under the scholar's feet
    const menuW = 168;
    const menuX = Math.min(1100, Math.max(180, actor.container.x));
    const menuY = Math.min(640, actor.container.y + 52);

    const bg = this.add.rectangle(0, 0, menuW, canRest ? 84 : 56, 0x14100a, 0.96)
      .setStrokeStyle(1, 0x5a3820);

    const rows: Phaser.GameObjects.GameObject[] = [bg];

    // Row 1: Details
    const detailsRow = this.makeMenuRow(0, -18, 'View details', () => {
      this.closeScholarActionMenu();
      this.scholarPanel.show();
    });
    rows.push(detailsRow);

    if (canRest) {
      const isResting = scholar.isResting === true;
      const label = isResting ? 'Wake them' : 'Send to rest';
      const restRow = this.makeMenuRow(0, 14, label, () => {
        this.closeScholarActionMenu();
        this.toggleScholarRest(scholarId);
      });
      rows.push(restRow);
    }

    const container = this.add.container(menuX, menuY, rows).setDepth(80);
    this.scholarActionMenu = container;

    // Dismiss on any click outside the menu (next frame to skip the
    // pointerdown that opened it)
    this.time.delayedCall(10, () => {
      this.input.once('pointerdown', () => this.closeScholarActionMenu());
    });
  }

  private makeMenuRow(x: number, y: number, label: string, onClick: () => void) {
    const row = this.add.rectangle(x, y, 156, 24, 0x1a120a, 0)
      .setInteractive({ useHandCursor: true });
    const text = this.add.text(x, y, label, {
      fontSize: '12px', color: '#c8a87a', fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);
    row.on('pointerover', () => { row.setFillStyle(0x2a1808, 1); text.setColor('#e8d5b0'); });
    row.on('pointerout',  () => { row.setFillStyle(0x1a120a, 0); text.setColor('#c8a87a'); });
    row.on('pointerdown', (_p: Phaser.Input.Pointer, _lx: number, _ly: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      onClick();
    });
    return this.add.container(0, 0, [row, text]);
  }

  private closeScholarActionMenu() {
    if (this.scholarActionMenu) {
      this.scholarActionMenu.destroy();
      this.scholarActionMenu = undefined;
    }
  }

  // Toggle a scholar's rest state. Resting flips them out of the
  // available pool so they don't get picked for projects, and they recover
  // ~3x faster. Auto-ends in ProjectSystem.recoverIdleScholars once
  // exhaustion and stress reach zero.
  toggleScholarRest(scholarId: string) {
    const scholar = Game.state.scholars.find(s => s.id === scholarId);
    if (!scholar) return;
    // Cannot rest while on a project (isAvailable === false but not
    // resting either). UI should prevent this; defensive guard here.
    if (!scholar.isAvailable && !scholar.isResting) return;

    if (scholar.isResting) {
      scholar.isResting = false;
      scholar.isAvailable = true;
      Events.emit(GameEvents.SCHOLAR_REST_ENDED, { scholarId });
    } else {
      scholar.isResting = true;
      scholar.isAvailable = false;
      Events.emit(GameEvents.SCHOLAR_REST_STARTED, { scholarId });
    }
    this.updateRestOverlay(scholarId);
    this.refreshScholarSprites();
    this.refreshNewWorkBtn();
  }

  private updateRestOverlay(scholarId: string) {
    const scholar = Game.state.scholars.find(s => s.id === scholarId);
    const actor = this.actors.get(scholarId);
    if (!scholar || !actor) return;
    actor.zzz.setVisible(scholar.isResting === true);
  }

  // ── Actor behavior engine ──────────────────────────────────────────

  // Re-derive every actor's desired mode from game state and steer them
  // there. Called daily and after any roster/project change. Walks already
  // heading to the right place are left alone.
  private refreshScholarSprites() {
    const seats = this.activeWorkScholarPositions();
    for (const [id, actor] of this.actors) {
      const scholar = Game.state.scholars.find(s => s.id === id);
      if (!scholar) continue; // a scholar that left will be cleared by rebuild

      const seat = seats.get(id);
      const mode: ScholarActor['mode'] =
        seat              ? 'working' :
        scholar.isResting ? 'resting' :
        scholar.isAvailable ? 'idle'  :
        'away';
      const target = seat ?? actor.home;

      const changed = mode !== actor.mode
        || Math.abs(actor.target.x - target.x) > 1
        || Math.abs(actor.target.y - target.y) > 1;
      if (changed) this.applyActorMode(actor, mode, target, seat?.flip ?? false);

      // Light state that can change without a mode change
      actor.zzz.setVisible(scholar.isResting === true);
      actor.alert.setVisible(scholar.restlessFlagged === true);
      actor.container.setAlpha(mode === 'away' ? 0.55 : mode === 'resting' ? 0.85 : 1);
    }
    this.sortActorsByDepth();
  }

  private applyActorMode(
    actor: ScholarActor,
    mode: ScholarActor['mode'],
    target: { x: number; y: number },
    flipAtSeat: boolean,
  ) {
    actor.mode = mode;
    actor.target = { x: target.x, y: target.y };
    actor.wanderEvent?.remove(false);
    actor.wanderEvent = undefined;

    switch (mode) {
      case 'working':
        this.walkActorTo(actor, target.x, target.y, () => {
          actor.sprite.setFlipX(flipAtSeat);
          this.playMotionAnim(actor, 'sit');
        });
        break;
      case 'resting':
        this.walkActorTo(actor, actor.home.x, actor.home.y, () => {
          this.playMotionAnim(actor, 'sit');
        });
        break;
      case 'idle':
        this.walkActorTo(actor, actor.home.x, actor.home.y, () => {
          this.playMotionAnim(actor, 'idle');
          this.scheduleWander(actor);
        });
        break;
      case 'away':
        this.walkActorTo(actor, actor.home.x, actor.home.y, () => {
          this.playMotionAnim(actor, 'idle');
        });
        break;
    }
  }

  // Walk (with the walk animation and direction flip) to a point, then
  // settle. Close-enough targets snap immediately so daily refreshes don't
  // cause shuffling in place.
  private walkActorTo(actor: ScholarActor, x: number, y: number, onArrive: () => void) {
    actor.walkTween?.stop();
    actor.walkTween = undefined;

    const dist = Phaser.Math.Distance.Between(actor.container.x, actor.container.y, x, y);
    if (dist < 6) {
      actor.container.setPosition(x, y);
      onArrive();
      this.sortActorsByDepth();
      return;
    }

    actor.sprite.setFlipX(x < actor.container.x);
    this.playMotionAnim(actor, 'walk');
    actor.walkTween = this.tweens.add({
      targets: actor.container,
      x, y,
      duration: dist / WALK_SPEED,
      ease: 'Sine.easeInOut',
      onUpdate: () => this.sortActorsByDepth(),
      onComplete: () => {
        actor.walkTween = undefined;
        actor.sprite.setFlipX(false);
        onArrive();
        this.sortActorsByDepth();
      },
    });
  }

  // Idle scholars drift between spots near their home so the courtyard
  // reads as inhabited rather than posed.
  private scheduleWander(actor: ScholarActor) {
    actor.wanderEvent?.remove(false);
    actor.wanderEvent = this.time.addEvent({
      delay: 4000 + Math.random() * 6000,
      callback: () => {
        if (actor.mode !== 'idle' || actor.walkTween) { this.scheduleWander(actor); return; }
        const x = Phaser.Math.Clamp(actor.home.x + (Math.random() - 0.5) * 150, WANDER_BOUNDS.minX, WANDER_BOUNDS.maxX);
        const y = Phaser.Math.Clamp(actor.home.y + (Math.random() - 0.5) * 50,  WANDER_BOUNDS.minY, WANDER_BOUNDS.maxY);
        this.walkActorTo(actor, x, y, () => {
          this.playMotionAnim(actor, 'idle');
          this.scheduleWander(actor);
        });
      },
    });
  }

  // Painter's order: actors lower on the screen draw in front.
  private sortActorsByDepth() {
    if (!this.actorsLayer) return;
    const layer = this.actorsLayer as unknown as { sort?: (prop: string) => void };
    layer.sort?.('y');
  }

  // A couple of student NPCs wander the lower courtyard once the
  // institution reaches Academy tier — the campus visibly grows with you.
  private buildStudents() {
    // Scene restarts reuse this instance — drop refs to destroyed sprites.
    this.studentSprites = this.studentSprites.filter(s => s.active);
    if (this.studentSprites.length > 0) return;
    if (Game.state.tier < 2) return;
    if (!this.textures.exists('student_idle')) return;
    for (let i = 0; i < 2; i++) {
      const x = 360 + Math.random() * 560;
      const y = 600 + Math.random() * 30;
      const student = this.add.sprite(x, y, 'student_idle')
        .setOrigin(0.5, 1)
        .setScale(ACTOR_SCALE)
        .setAlpha(0.9);
      if (this.anims.exists('student_idle')) student.play('student_idle');
      this.actorsLayer.add(student);
      this.studentSprites.push(student);
      this.wanderStudent(student);
    }
  }

  private wanderStudent(student: Phaser.GameObjects.Sprite) {
    if (!student.active) return;
    this.time.delayedCall(3000 + Math.random() * 7000, () => {
      if (!student.active) return;
      const x = Phaser.Math.Clamp(student.x + (Math.random() - 0.5) * 240, 300, 1000);
      const y = Phaser.Math.Clamp(student.y + (Math.random() - 0.5) * 40, 580, 650);
      student.setFlipX(x < student.x);
      if (this.anims.exists('student_walk')) student.play('student_walk');
      this.tweens.add({
        targets: student,
        x, y,
        duration: Phaser.Math.Distance.Between(student.x, student.y, x, y) / (WALK_SPEED * 0.8),
        ease: 'Sine.easeInOut',
        onComplete: () => {
          if (!student.active) return;
          student.setFlipX(false);
          if (this.anims.exists('student_idle')) student.play('student_idle');
          this.wanderStudent(student);
        },
      });
    });
  }

  private activeWorkScholarPositions(): Map<string, { x: number; y: number; flip: boolean }> {
    const positions = new Map<string, { x: number; y: number; flip: boolean }>();
    const project = Game.state.activeProject;
    const stage = project?.stages[project.stages.length - 1];
    if (!stage || project.state !== 'in_development') return positions;

    const ids = [stage.leadScholarId, ...stage.assistantScholarIds];
    ids.forEach((id, index) => {
      positions.set(id, WORK_SEATS[index % WORK_SEATS.length]);
    });
    return positions;
  }

  // ── Top bar ───────────────────────────────────────────────────────

  // Tooltip element — created once, reused across hover events. The same
  // container is hidden/shown and repositioned, avoiding allocations.
  private tooltipBg?: Phaser.GameObjects.Rectangle;
  private tooltipText?: Phaser.GameObjects.Text;

  private ensureTooltip() {
    if (this.tooltipBg) return;
    this.tooltipText = this.add.text(0, 0, '', {
      fontSize: '11px', color: '#e8d5b0', fontFamily: 'Georgia, serif',
      backgroundColor: '#1a0d06ee', padding: { x: 8, y: 5 },
    }).setOrigin(0.5, 1).setDepth(60).setVisible(false);
    // Background isn't strictly needed since text has its own backgroundColor,
    // but we keep the field as a sentinel so we don't re-init.
    this.tooltipBg = this.add.rectangle(0, 0, 0, 0, 0x000000, 0).setDepth(59);
  }

  private showTooltip(text: string, x: number, y: number) {
    this.ensureTooltip();
    this.tooltipText!.setText(text).setPosition(x, y - 8).setVisible(true);
  }

  private hideTooltip() {
    this.tooltipText?.setVisible(false);
  }

  // Attach hover SFX + hover/out color swap + optional tooltip + click SFX
  // to a text/image target. Centralizes the patterns previously inlined per
  // button so adding sound + hints is one call.
  private wireButton(
    target: Phaser.GameObjects.Text | Phaser.GameObjects.Image,
    opts: { hoverColor?: string; idleColor?: string; tooltip?: string; onClick: () => void; clickSfx?: 'ui_click' | 'ui_select' | 'ui_back' },
  ) {
    target.setInteractive({ useHandCursor: true });
    const isText = (target as Phaser.GameObjects.Text).setColor !== undefined;
    target.on('pointerover', () => {
      if (isText && opts.hoverColor) (target as Phaser.GameObjects.Text).setColor(opts.hoverColor);
      Audio.playHover();
      if (opts.tooltip) {
        const bounds = target.getBounds();
        this.showTooltip(opts.tooltip, bounds.centerX, bounds.top);
      }
    });
    target.on('pointerout', () => {
      if (isText && opts.idleColor) (target as Phaser.GameObjects.Text).setColor(opts.idleColor);
      this.hideTooltip();
    });
    target.on('pointerdown', () => {
      Audio.playSfx(opts.clickSfx ?? 'ui_click');
      this.hideTooltip();
      opts.onClick();
    });
  }

  private buildTopBar(width: number, _height: number) {
    const cy = BAR_H / 2;

    // ── Left cluster ───────────────────────────────────────────────
    // Institution name (anchored left), then Day positioned right of it with a gap.
    const instBtn = this.add.text(20, cy, this.formatInstitutionLabel(), {
      fontSize: '16px', color: '#e8d5b0', fontFamily: DISPLAY_FONT,
    }).setOrigin(0, 0.5);
    this.wireButton(instBtn, {
      hoverColor: '#d4a855', idleColor: '#e8d5b0',
      tooltip: 'Institution — name, tier, facilities, departments',
      onClick: () => this.institutionPanel.show(),
    });
    this.institutionLabel = instBtn;

    this.dayText = this.add.text(instBtn.x + instBtn.width + 24, cy, formatDay(Game.state.day), {
      fontSize: '14px', color: '#c8a87a', fontFamily: 'Georgia, serif',
    }).setOrigin(0, 0.5);

    // ── Right cluster (laid out right-to-left) ─────────────────────
    // Quit → Restart → divider → Treasury(label+indicator) → divider → World → Stance → Prestige
    // Each element uses the LEFT edge of the previous element as its right anchor,
    // so growing strings push leftward into empty space instead of overlapping.
    const rightEdge = width - 20;
    const iconGap = 26;
    const groupGap = 18;        // gap between visual groups (around dividers)
    const innerGap = 12;        // gap between elements within a group

    const quitBtn = this.add.text(rightEdge, cy, '↩', {
      fontSize: '18px', color: '#6a4828', fontFamily: 'Georgia, serif',
    }).setOrigin(1, 0.5);
    this.wireButton(quitBtn, {
      hoverColor: '#c8a87a', idleColor: '#6a4828',
      tooltip: 'Quit to main menu', clickSfx: 'ui_back',
      onClick: () => this.requestQuitToMenu(),
    });

    // Audio toggle — sits left of Quit, mutes/unmutes SFX + music
    const muteBtn = this.add.text(quitBtn.getLeftCenter().x - iconGap, cy, Audio.isMuted() ? '♪̸' : '♪', {
      fontSize: '17px', color: '#6a4828', fontFamily: 'Georgia, serif',
    }).setOrigin(1, 0.5);
    this.wireButton(muteBtn, {
      hoverColor: '#c8a87a', idleColor: '#6a4828',
      tooltip: 'Toggle audio',
      onClick: () => {
        const muted = Audio.toggleMute();
        muteBtn.setText(muted ? '♪̸' : '♪');
        muteBtn.setColor('#c8a87a');
      },
    });

    const restartBtn = this.add.text(muteBtn.getLeftCenter().x - iconGap, cy, '↻', {
      fontSize: '18px', color: '#6a4828', fontFamily: 'Georgia, serif',
    }).setOrigin(1, 0.5);
    this.wireButton(restartBtn, {
      hoverColor: '#c8a87a', idleColor: '#6a4828',
      tooltip: 'Restart from a fresh institution',
      onClick: () => this.requestRestart(),
    });

    // Divider 1: between icons and treasury info
    const divider1X = restartBtn.getLeftCenter().x - groupGap;
    this.add.rectangle(divider1X, cy, 1, 22, 0x3a2818, 0.7);

    const state = getTreasuryState(Game.state.treasury);
    this.treasuryLabel = this.add.text(divider1X - groupGap, cy, this.formatTreasury(Game.state.treasury, state), {
      fontSize: '14px', color: TREASURY_COLORS[state], fontFamily: 'Georgia, serif',
    }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true });
    this.treasuryLabel.on('pointerover', () => {
      this.treasuryLabel.setColor(TREASURY_HOVER[getTreasuryState(Game.state.treasury)]);
      Audio.playHover();
      const b = this.treasuryLabel.getBounds();
      this.showTooltip('Treasury — income, expenses, sales over time', b.centerX, b.top);
    });
    this.treasuryLabel.on('pointerout',  () => {
      this.treasuryLabel.setColor(TREASURY_COLORS[getTreasuryState(Game.state.treasury)]);
      this.hideTooltip();
    });
    this.treasuryLabel.on('pointerdown', () => { Audio.playSfx('ui_click'); this.hideTooltip(); this.treasuryPanel.show(); });

    this.treasuryIndicator = this.add.image(
      this.treasuryLabel.getLeftCenter().x - innerGap, cy, `indicator_${state}`,
    ).setOrigin(1, 0.5).setScale(2);
    this.wireButton(this.treasuryIndicator, {
      tooltip: 'Treasury health',
      onClick: () => this.treasuryPanel.show(),
    });

    // Divider 2: between treasury and world/stance/prestige cluster
    const divider2X = this.treasuryIndicator.getLeftCenter().x - groupGap;
    this.add.rectangle(divider2X, cy, 1, 22, 0x3a2818, 0.7);

    // Inside the stats group we use a wider gap because the labels grow
    // (e.g. "Prestige: 100 · Renowned" or "Stance: Strongly Populist").
    const labelGap = 24;

    const worldBtn = this.add.text(divider2X - groupGap, cy, 'World', {
      fontSize: '13px', color: '#c8a87a', fontFamily: 'Georgia, serif',
    }).setOrigin(1, 0.5);
    this.wireButton(worldBtn, {
      hoverColor: '#e8d5b0', idleColor: '#c8a87a',
      tooltip: 'World — events, rivals, demand for topics',
      onClick: () => this.worldPanel.show(),
    });

    this.stanceBtn = this.add.text(worldBtn.getLeftCenter().x - labelGap, cy, this.formatStance(), {
      fontSize: '13px', color: '#c8a87a', fontFamily: 'Georgia, serif',
    }).setOrigin(1, 0.5);
    this.wireButton(this.stanceBtn, {
      hoverColor: '#e8d5b0', idleColor: '#c8a87a',
      tooltip: 'Ideology — institution stance, factions, imprints',
      onClick: () => this.ideologyPanel.show(),
    });

    this.prestigeLabel = this.add.text(this.stanceBtn.getLeftCenter().x - labelGap, cy, this.formatPrestige(Game.state.prestige), {
      fontSize: '13px', color: '#c8a87a', fontFamily: 'Georgia, serif',
    }).setOrigin(1, 0.5);
  }

  private requestRestart() {
    if (this.eventModal.isOpen()) return;

    const prevSpeed = Game.time.speed;
    Game.time.setSpeed('paused');
    this.refreshSpeedButtons();

    this.eventModal.confirm({
      heading: 'Restart the institution?',
      text: 'This will end the current run and begin a new one. Your treasury, scholars, works, and prestige will all be lost.',
      confirmLabel: 'Begin anew',
      cancelLabel: 'Keep this run',
      onConfirm: () => {
        Game.reset();
        this.scene.start('Menu');
      },
      onCancel: () => {
        Game.time.setSpeed(prevSpeed);
        this.refreshSpeedButtons();
      },
    });
  }

  private requestQuitToMenu() {
    if (this.eventModal.isOpen()) return;

    const prevSpeed = Game.time.speed;
    Game.time.setSpeed('paused');
    this.refreshSpeedButtons();

    this.eventModal.confirm({
      heading: 'Return to menu?',
      text: 'Your progress is saved automatically. You can pick up where you left off from the menu — or start a new game.',
      confirmLabel: 'Return to menu',
      cancelLabel: 'Stay here',
      onConfirm: () => this.scene.start('Menu'),
      onCancel: () => {
        Game.time.setSpeed(prevSpeed);
        this.refreshSpeedButtons();
      },
    });
  }

  // ── Info cards (commission / releases) under the top bar ─────────

  private static readonly CARD_X = 16;
  private static readonly CARD_W = 380;
  private static readonly CARD_Y_START = BAR_H + 10;
  private static readonly CARD_GAP = 8;

  private buildInfoStrips(_width: number) {
    this.goalStrip       = this.add.container(CampusScene.CARD_X, CampusScene.CARD_Y_START).setDepth(5);
    this.commissionStrip = this.add.container(CampusScene.CARD_X, CampusScene.CARD_Y_START).setDepth(5);
    this.releasesStrip   = this.add.container(CampusScene.CARD_X, CampusScene.CARD_Y_START).setDepth(5);
    this.refreshInfoStrips();
  }

  // The next structural goal for the institution, derived fresh from state
  // each refresh. Returns null once the player has seen it all — free play.
  private currentGoal(): { title: string; detail: string } | null {
    const s = Game.state;
    if (s.completedWorks.length < 1) {
      return { title: 'Release your first work',
               detail: 'Begin a New Work and guide it through all three stages.' };
    }
    if (s.scholars.length < 3) {
      return { title: 'Grow the roster',
               detail: 'Recruit from the Scholars panel — candidates take a month to arrive.' };
    }
    if (s.prestige < 50) {
      return { title: 'Reach 50 prestige',
               detail: `Quality works build renown (now ${s.prestige}). Patrons notice at 50.` };
    }
    if (s.tier < 2) {
      return { title: 'Become an Academy',
               detail: 'Hold 300 gold and six scholars. New zones will unlock.' };
    }
    if (s.departments.length === 0) {
      return { title: 'Found a department',
               detail: 'Three scholars sharing a discipline can work under a head.' };
    }
    if (s.tier < 3) {
      return { title: 'Become a University',
               detail: `Prestige 200 (now ${s.prestige}), 800 gold, twelve scholars.` };
    }
    return null;
  }

  // Tear down + rebuild the cards. Sales tick at most once a day per work,
  // so this is cheap and keeps state-vs-layout logic together.
  private refreshInfoStrips() {
    this.goalStrip.removeAll(true);
    this.commissionStrip.removeAll(true);
    this.releasesStrip.removeAll(true);

    let y = CampusScene.CARD_Y_START;

    // 0. Goal card — steady guidance at the top of the stack
    const goal = this.currentGoal();
    if (goal) {
      const h = this.populateGoalCard(goal);
      this.goalStrip.setY(y);
      y += h + CampusScene.CARD_GAP;
      this.goalStrip.setVisible(true);
    } else {
      this.goalStrip.setVisible(false);
    }

    // 1. Commission card
    const active  = Game.state.activeCommission;
    const pending = Game.state.pendingCommission;
    if (active || pending) {
      const h = this.populateCommissionCard();
      this.commissionStrip.setY(y);
      y += h + CampusScene.CARD_GAP;
      this.commissionStrip.setVisible(true);
    } else {
      this.commissionStrip.setVisible(false);
    }

    // 2. Releases card
    const selling = Game.state.completedWorks.filter(w => w.salesState && !w.salesState.complete);
    if (selling.length > 0) {
      this.populateReleasesCard(selling);
      this.releasesStrip.setY(y);
      this.releasesStrip.setVisible(true);
    } else {
      this.releasesStrip.setVisible(false);
    }
  }

  // Compact "what to aim for next" card. Same visual language as the
  // commission card; returns its height for stacking.
  private populateGoalCard(goal: { title: string; detail: string }): number {
    const w = CampusScene.CARD_W;
    const padX = 12;
    const padY = 8;
    const h = padY * 2 + 44;

    const bg = this.add.rectangle(0, 0, w, h, BAR_COLOR, 0.92)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x3a2818, 0.9);
    const accent = this.add.rectangle(0, 0, 3, h, 0x8ab87a, 0.9).setOrigin(0, 0);

    const tag = this.add.text(padX + 6, padY, 'GOAL', {
      fontSize: '10px', color: '#8ab87a', fontFamily: 'Georgia, serif',
    }).setOrigin(0, 0);
    tag.setLetterSpacing(2);

    const title = this.add.text(padX + 52, padY - 1, goal.title, {
      fontSize: '13px', color: '#e8d5b0', fontFamily: 'Georgia, serif',
    }).setOrigin(0, 0);

    const detail = this.add.text(padX + 6, padY + 18, goal.detail, {
      fontSize: '11px', color: '#8a6848', fontFamily: 'Georgia, serif', fontStyle: 'italic',
      wordWrap: { width: w - padX * 2 - 12 },
    }).setOrigin(0, 0);

    this.goalStrip.add([bg, accent, tag, title, detail]);
    return h;
  }

  // Returns the card's actual height so the next card below can stack.
  private populateCommissionCard(): number {
    const w = CampusScene.CARD_W;
    const active = Game.state.activeCommission;
    const pending = Game.state.pendingCommission;
    const padX = 12;
    const padY = 8;

    const data = active
      ? {
          tag: 'COMMISSION',
          tagColor: '#d4a855',
          title: active.patronName,
          subtitle: this.commissionWorkDescription(active.topicId, active.formatId),
          hint: `${active.payment} gold on delivery`,
          borderColor: 0xd4a855,
        }
      : pending
      ? {
          tag: 'OFFER',
          tagColor: '#c87a4a',
          title: pending.patronName,
          subtitle: this.commissionWorkDescription(pending.topicId, pending.formatId),
          hint: `${pending.payment} gold · expires day ${pending.expiresDay}`,
          borderColor: 0xc87a4a,
        }
      : null;
    if (!data) return 0;

    const h = padY * 2 + 48;

    const bg = this.add.rectangle(0, 0, w, h, BAR_COLOR, 0.92)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x3a2818, 0.9);
    this.commissionStrip.add(bg);

    const accent = this.add.rectangle(0, 0, 3, h, data.borderColor, 0.9).setOrigin(0, 0);
    this.commissionStrip.add(accent);

    const tagText = this.add.text(padX + 6, padY, data.tag, {
      fontSize: '10px', color: data.tagColor, fontFamily: 'Georgia, serif',
    }).setOrigin(0, 0);
    tagText.setLetterSpacing(2);
    this.commissionStrip.add(tagText);

    const titleText = this.add.text(padX + 6, padY + 14, data.title, {
      fontSize: '14px', color: '#e8d5b0', fontFamily: 'Georgia, serif',
    }).setOrigin(0, 0);
    this.commissionStrip.add(titleText);

    const subtitleText = this.add.text(padX + 6, padY + 32, data.subtitle, {
      fontSize: '11px', color: '#8a6848', fontFamily: 'Georgia, serif', fontStyle: 'italic',
    }).setOrigin(0, 0);
    this.commissionStrip.add(subtitleText);

    const hintText = this.add.text(w - padX, padY + 32, data.hint, {
      fontSize: '11px', color: data.tagColor, fontFamily: 'Georgia, serif',
    }).setOrigin(1, 0);
    this.commissionStrip.add(hintText);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.treasuryPanel.show());
    bg.on('pointerover', () => bg.setStrokeStyle(1, 0x5a3820, 1));
    bg.on('pointerout',  () => bg.setStrokeStyle(1, 0x3a2818, 0.9));

    return h;
  }

  private commissionWorkDescription(topicId: string, formatId: string): string {
    const topic  = TOPICS.find(t => t.id === topicId);
    const format = FORMATS.find(f => f.id === formatId);
    return `${format?.name ?? 'work'} on ${topic?.name ?? '—'}`;
  }

  // Pack up to 3 in-flight releases into a single card. Each release has a
  // title row (title + reception tag) and a 90-bar sparkline below.
  private populateReleasesCard(selling: import('../models/Work').Work[]) {
    const w = CampusScene.CARD_W;
    const padX = 12;
    const padY = 8;
    const rowH = 56;

    const sortedRecent = [...selling]
      .sort((a, b) => (b.salesState!.startDay - a.salesState!.startDay))
      .slice(0, 3);

    const headingH = 16;
    const h = padY * 2 + headingH + rowH * sortedRecent.length + 6;

    const bg = this.add.rectangle(0, 0, w, h, BAR_COLOR, 0.92)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x3a2818, 0.9);
    this.releasesStrip.add(bg);

    const accent = this.add.rectangle(0, 0, 3, h, 0xc8a87a, 0.9).setOrigin(0, 0);
    this.releasesStrip.add(accent);

    const heading = this.add.text(padX + 6, padY, 'RELEASES', {
      fontSize: '10px', color: '#8a6848', fontFamily: 'Georgia, serif',
    }).setOrigin(0, 0);
    heading.setLetterSpacing(2);
    this.releasesStrip.add(heading);

    if (selling.length > sortedRecent.length) {
      const more = this.add.text(w - padX, padY, `+${selling.length - sortedRecent.length} more`, {
        fontSize: '10px', color: '#6a4828', fontFamily: 'Georgia, serif',
      }).setOrigin(1, 0);
      this.releasesStrip.add(more);
    }

    let rowY = padY + headingH + 4;
    for (const work of sortedRecent) {
      this.populateReleaseRow(work, padX + 6, rowY, w - padX * 2 - 6);
      rowY += rowH;
    }

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.treasuryPanel.show());
    bg.on('pointerover', () => bg.setStrokeStyle(1, 0x5a3820, 1));
    bg.on('pointerout',  () => bg.setStrokeStyle(1, 0x3a2818, 0.9));
  }

  // One release row inside the releases card.
  private populateReleaseRow(work: import('../models/Work').Work, x: number, y: number, rowW: number) {
    const s = work.salesState!;
    const earnedPct = s.projectedTotal > 0 ? s.earnedTotal / s.projectedTotal : 0;
    const daysLeft  = Math.max(0, s.endDay - Game.state.day);
    const reception = this.receptionForRelease(earnedPct * 100, s.daysActive);

    const shortTitle = work.title.length > 32 ? work.title.slice(0, 30) + '…' : work.title;
    const titleText = this.add.text(x, y, shortTitle, {
      fontSize: '12px', color: '#e8d5b0', fontFamily: 'Georgia, serif', fontStyle: 'italic',
    }).setOrigin(0, 0);
    this.releasesStrip.add(titleText);

    const tagText = this.add.text(x + rowW, y, reception.label, {
      fontSize: '10px', color: reception.color, fontFamily: 'Georgia, serif',
    }).setOrigin(1, 0);
    tagText.setLetterSpacing(1.5);
    this.releasesStrip.add(tagText);

    const numLine = this.add.text(x, y + 16, `${s.earnedTotal} of ~${s.projectedTotal}g  ·  ${daysLeft}d left`, {
      fontSize: '10px', color: '#8a6848', fontFamily: 'Georgia, serif',
    }).setOrigin(0, 0);
    this.releasesStrip.add(numLine);

    // Sparkline of 90 thin bars under the row
    this.drawSparkline(s, x, y + 32, rowW, 18);
  }

  // 90-bar sparkline. Filled bars (gold) for elapsed days, faint dots for
  // upcoming days. Bar height scales with that day's earnings relative to
  // the work's peak daily value.
  private drawSparkline(
    sales: import('../models/Work').WorkSalesState,
    x: number, y: number,
    w: number, h: number,
  ) {
    const days = 90;
    const barW = Math.max(1, w / days);

    const history = sales.dailyHistory ?? [];
    const peakHistorical = history.length > 0 ? Math.max(...history, 1) : 0;
    const peakEstimate   = sales.projectedTotal / 22; // matches τ=22 sales curve
    const peak = Math.max(peakHistorical, peakEstimate, 1);

    // Baseline track
    const track = this.add.rectangle(x, y + h - 1, w, 1, 0x2a1808, 0.8).setOrigin(0, 0);
    this.releasesStrip.add(track);

    for (let i = 0; i < days; i++) {
      const bx = x + i * barW;
      const bw = Math.max(1, barW - 0.5);
      if (i < history.length) {
        const val = history[i];
        const barH = Math.max(1, (val / peak) * h);
        const bar = this.add.rectangle(bx, y + h, bw, barH, 0xd4a855, 0.92).setOrigin(0, 1);
        this.releasesStrip.add(bar);
      } else {
        const ghost = this.add.rectangle(bx, y + h, bw, 2, 0x5a3820, 0.40).setOrigin(0, 1);
        this.releasesStrip.add(ghost);
      }
    }

    // "Today" marker — thin vertical at the boundary between filled and ghost.
    if (history.length > 0 && history.length < days) {
      const markerX = x + history.length * barW;
      const marker = this.add.rectangle(markerX, y - 1, 1, h + 2, 0xe8d5b0, 0.5).setOrigin(0, 0);
      this.releasesStrip.add(marker);
    }
  }

  // Compact reception label for in-flight releases. Mirrors TreasuryPanel's
  // receptionLabel but returns a color string for direct use in Phaser text.
  private receptionForRelease(earnedPct: number, daysActive: number): { label: string; color: string } {
    const expected = (1 - Math.exp(-daysActive / 22)) * 100;
    const delta = earnedPct - expected;
    if (delta >=  15) return { label: 'ON FIRE', color: '#f0c878' };
    if (delta >=   5) return { label: 'STRONG',  color: '#8ab87a' };
    if (delta >= -10) return { label: 'STEADY',  color: '#c8a87a' };
    if (delta >= -25) return { label: 'SLOW',    color: '#a08868' };
    return { label: 'QUIET', color: '#c87a4a' };
  }

  // ── Bottom bar ────────────────────────────────────────────────────

  private buildBottomBar(width: number, height: number) {
    const cy  = height - BAR_H / 2;
    const cx  = width / 2;
    const gap = 68;

    this.btnPause = this.add.image(cx - gap, cy, 'btn_pause').setScale(2);
    this.wireButton(this.btnPause, { tooltip: 'Pause time', onClick: () => this.applySpeed('paused') });

    this.btnPlay = this.add.image(cx, cy, 'btn_play_active').setScale(2);
    this.wireButton(this.btnPlay, { tooltip: 'Normal speed', onClick: () => this.applySpeed('normal') });

    this.btnFast = this.add.image(cx + gap, cy, 'btn_fast').setScale(2);
    this.wireButton(this.btnFast, { tooltip: 'Fast forward', onClick: () => this.applySpeed('fast') });

    this.refreshSpeedButtons();

    this.scholarsBtn = this.add.text(24, cy, 'Scholars', {
      fontSize: '14px', color: '#c8a87a', fontFamily: DISPLAY_FONT,
      padding: { x: 13, y: 7 }, backgroundColor: '#2d1a0e',
    }).setOrigin(0, 0.5);
    this.wireButton(this.scholarsBtn, {
      hoverColor: '#e8d5b0', idleColor: '#c8a87a',
      tooltip: 'Scholars — roster, recruitment, rest',
      onClick: () => this.scholarPanel.show(),
    });

    this.newWorkBtn = this.add.text(width - 24, cy, 'New Work', {
      fontSize: '14px', color: '#c8a87a', fontFamily: DISPLAY_FONT,
      padding: { x: 13, y: 7 }, backgroundColor: '#2d1a0e',
    }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true })
      .on('pointerover', () => {
        if (this.newWorkBtnEnabled()) { this.newWorkBtn.setColor('#e8d5b0'); Audio.playHover(); }
        const b = this.newWorkBtn.getBounds();
        this.showTooltip('Begin a new work', b.centerX, b.top);
      })
      .on('pointerout',  () => { this.refreshNewWorkBtn(); this.hideTooltip(); })
      .on('pointerdown', () => { Audio.playSfx('ui_click'); this.hideTooltip(); this.onNewWorkBtnPressed(); });

    // Active project info sits ABOVE the bottom bar so it doesn't collide
    // with the Scholars / New Work buttons inside the bar itself.
    // Panel height extended to host the live axis gauge below the progress bar.
    const infoTopY = height - BAR_H - 120;
    const panelBg = this.add.rectangle(20, infoTopY - 4, PROGRESS_BAR_W + 150, 102, BAR_COLOR, 0.88)
      .setOrigin(0, 0).setVisible(false);
    this.activeProjectPanelBg = panelBg;

    this.activeProjectLabel = this.add.text(28, infoTopY + 6, '', {
      fontSize: '14px', color: '#e8d5b0', fontFamily: 'Georgia, serif', fontStyle: 'italic',
      stroke: '#1a0d06', strokeThickness: 2,
    }).setOrigin(0, 0).setVisible(false);

    this.activeScholarLabel = this.add.text(28, infoTopY + 25, '', {
      fontSize: '11px', color: '#c8a87a', fontFamily: 'Georgia, serif',
    }).setOrigin(0, 0).setVisible(false);

    const barY = infoTopY + 47;
    // The bar is split into N stage segments (one per StageKey). Each segment
    // has a dark track and a colored fill; completed stages stay fully filled
    // in that stage's tint, the current stage's fill animates as project
    // progress accrues, and upcoming stages are empty.
    const segmentGap = 3;
    const segmentW = (PROGRESS_BAR_W - segmentGap * (STAGE_ORDER.length - 1)) / STAGE_ORDER.length;
    this.stageSegmentTracks = [];
    this.stageSegmentFills = [];
    for (let i = 0; i < STAGE_ORDER.length; i++) {
      const sx = 28 + i * (segmentW + segmentGap);
      const track = this.add.rectangle(sx, barY, segmentW, 4, 0x2d1a0e)
        .setOrigin(0, 0.5).setVisible(false);
      const fill = this.add.rectangle(sx, barY, 1, 4, STAGE_TINTS[STAGE_ORDER[i]])
        .setOrigin(0, 0.5).setVisible(false);
      this.stageSegmentTracks.push(track);
      this.stageSegmentFills.push(fill);
    }

    this.progressPct = this.add.text(28 + PROGRESS_BAR_W + 8, barY, '0%', {
      fontSize: '11px', color: '#c8a87a', fontFamily: 'Georgia, serif',
    }).setOrigin(0, 0.5).setVisible(false);

    this.cancelBtn = this.add.text(28 + PROGRESS_BAR_W + 56, barY, 'Cancel', {
      fontSize: '11px', color: '#8a6848', fontFamily: 'Georgia, serif',
    })
      .setOrigin(0, 0.5)
      .setVisible(false)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => this.cancelBtn.setColor('#c87a4a'))
      .on('pointerout',  () => this.cancelBtn.setColor('#8a6848'))
      .on('pointerdown', () => this.requestCancelProject());

    // Live axis gauge — 3 thin bars under the progress bar. Each bar fills
    // as bubbles drop from working scholars; the proportions show how the
    // accumulated points are split across this stage's 3 axes.
    const gaugeStartY = barY + 16;
    const gaugeRowH   = 13;
    const labelW      = 72;
    const valueW      = 40;
    const gaugeBarW   = PROGRESS_BAR_W - labelW - valueW - 8;
    this.stageGaugeTracks = [];
    this.stageGaugeFills  = [];
    this.stageGaugeLabels = [];
    this.stageGaugeValues = [];
    this.stageGaugeKeyForIndex = [];
    for (let i = 0; i < 3; i++) {
      const rowY = gaugeStartY + i * gaugeRowH;
      const label = this.add.text(28, rowY, '', {
        fontSize: '10px', color: '#8a6848', fontFamily: 'Georgia, serif',
      }).setOrigin(0, 0.5).setVisible(false);
      const trackX = 28 + labelW;
      const track = this.add.rectangle(trackX, rowY, gaugeBarW, 3, 0x2d1a0e)
        .setOrigin(0, 0.5).setVisible(false);
      const fill = this.add.rectangle(trackX, rowY, 1, 3, 0xd4a855)
        .setOrigin(0, 0.5).setVisible(false);
      const value = this.add.text(trackX + gaugeBarW + 6, rowY, '0', {
        fontSize: '10px', color: '#c8a87a', fontFamily: 'Georgia, serif',
      }).setOrigin(0, 0.5).setVisible(false);
      this.stageGaugeLabels.push(label);
      this.stageGaugeTracks.push(track);
      this.stageGaugeFills.push(fill);
      this.stageGaugeValues.push(value);
    }
  }

  // ── Speed control ─────────────────────────────────────────────────

  private applySpeed(speed: GameSpeed) {
    Game.time.setSpeed(speed);
    this.refreshSpeedButtons();
  }

  private pausedHint?: Phaser.GameObjects.Text;

  private refreshSpeedButtons() {
    const s = Game.time.speed;
    this.btnPause.setTexture(s === 'paused' ? 'btn_pause_active' : 'btn_pause');
    this.btnPlay.setTexture(s === 'normal'  ? 'btn_play_active'  : 'btn_play');
    this.btnFast.setTexture(s === 'fast'    ? 'btn_fast_active'  : 'btn_fast');

    // Quiet hint above the speed buttons while time is stopped — pairs with
    // the Space shortcut so a paused game never reads as a frozen one.
    if (!this.pausedHint) {
      const { width, height } = this.scale;
      this.pausedHint = this.add.text(width / 2, height - BAR_H - 14, 'Paused  ·  Space to resume', {
        fontSize: '11px', color: '#c8a87a', fontFamily: 'Georgia, serif', fontStyle: 'italic',
        stroke: '#0d0704', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(15).setVisible(false);
    }
    this.pausedHint.setVisible(s === 'paused');
  }

  // ── Project panel ─────────────────────────────────────────────────

  private openProjectPanel() {
    if (Game.state.activeProject) return;
    const prevSpeed = Game.time.speed;
    Game.time.setSpeed('paused');
    this.refreshSpeedButtons();
    this.projectPanel.show();

    const poll = this.time.addEvent({
      delay: 100, loop: true,
      callback: () => {
        if (!this.projectPanel.isOpen()) {
          poll.remove();
          if (!Game.state.activeProject) {
            Game.time.setSpeed(prevSpeed);
            this.refreshSpeedButtons();
          }
        }
      },
    });
  }

  private onProjectStarted(project: Project) {
    Audio.playSfx('project_start');
    this.fireMilestone('firstProjectStarted',
      'Your first work begins. Each stage (Research → Drafting → Refinement) lets you pick a new lead and emphasis. Watch the live gauge below the progress bar to see the work taking shape.',
    );
    this.activeProjectPanelBg.setVisible(true);
    this.refreshActiveProjectInfo(project);
    this.showActiveWork(project);

    for (const t of this.stageSegmentTracks) t.setVisible(true);
    for (const f of this.stageSegmentFills)  f.setVisible(true);
    this.progressPct.setVisible(true);
    this.cancelBtn.setVisible(true);
    this.startWorkEmotes();
    // Initialize and show the per-stage axis gauge, and start the bubble
    // emitter. Both reset/respawn at every stage gate transition.
    const stage = project.stages[project.stages.length - 1];
    if (stage) {
      this.resetStageGauge(stage.key);
      this.showStageGauge();
      this.startBubbleEmitter();
    }
    this.refreshNewWorkBtn();
    this.refreshScholarSprites();
    Game.time.setSpeed('normal');
    this.refreshSpeedButtons();
  }

  // Rebuild the title/subtitle of the active-project panel using the
  // CURRENT stage's lead and team. Called on project start and on every
  // stage transition.
  private refreshActiveProjectInfo(project: Project) {
    const topic  = TOPICS.find(t => t.id === project.topicId);
    const format = FORMATS.find(f => f.id === project.formatId);
    const stage  = project.stages[project.stages.length - 1];
    const lead   = stage ? Game.state.scholars.find(s => s.id === stage.leadScholarId) : undefined;

    const stageLabel = stage ? STAGE_INFO[stage.key].label : '';
    this.activeScholarId = lead?.id;

    this.activeProjectLabel
      .setText(`✦  ${format?.name ?? ''} on ${topic?.name ?? ''}  ·  ${stageLabel}`)
      .setVisible(true);

    if (lead && topic && stage) {
      const skill = lead.disciplines[topic.name] ?? 1;
      const synergy = topic.strongFormats.includes(project.formatId) ? '⬆ Strong fit'
                    : topic.weakFormats.includes(project.formatId)   ? '⬇ Weak fit'
                    : '— Neutral';
      const teamCount = stage.assistantScholarIds.length;
      const teamSuffix = teamCount > 0 ? `  +${teamCount}` : '';
      const firstName = lead.name.split(' ')[0];
      this.activeScholarLabel
        .setText(`${firstName}${teamSuffix}  ·  ${topic.name} ${skill}/10  ·  ${synergy}  ·  Stage ${project.currentStageIndex + 1}/${STAGE_ORDER.length}`)
        .setVisible(true);
    }
  }

  // Player completed a stage — show the gate modal so they can pick the
  // next lead with full awareness of how the work is going.
  private showStageGate(project: import('../models/Project').Project, nextStageKey: import('../models/Project').StageKey) {
    Game.time.setSpeed('paused');
    this.refreshSpeedButtons();
    this.stopWorkEmotes();
    this.stopBubbleEmitter();
    // The team marks the finished stage before the player picks what's next.
    this.celebrateWorkTeam(false);
    this.stageGateModal.show(project, nextStageKey, (scholarId, framing, emphasis) => {
      this.projectSystem.beginNextStage(scholarId, framing, emphasis);
    });
    this.activeWorkTimer?.remove(false);
    this.activeWorkTimer = undefined;
    this.refreshActiveWork(project);
    this.refreshScholarSprites();
  }

  // A new stage just started — refresh labels and resume.
  private onStageStarted() {
    const project = Game.state.activeProject;
    if (!project) return;
    this.refreshActiveProjectInfo(project);
    this.showActiveWork(project);
    this.refreshScholarSprites();
    this.startWorkEmotes();
    const stage = project.stages[project.stages.length - 1];
    if (stage) {
      this.resetStageGauge(stage.key);
      this.showStageGauge();
      this.startBubbleEmitter();
    }
    Game.time.setSpeed('normal');
    this.refreshSpeedButtons();
  }

  // ── Progress bar ──────────────────────────────────────────────────

  private updateProgressBar(progress: number) {
    // Distribute overall progress across the per-stage segments. Stage i runs
    // from i/N..((i+1)/N) of total progress.
    const N = STAGE_ORDER.length;
    for (let i = 0; i < N; i++) {
      const stageStart = i / N;
      const stageEnd   = (i + 1) / N;
      const within = Math.max(0, Math.min(1, (progress - stageStart) / (stageEnd - stageStart)));
      const track = this.stageSegmentTracks[i];
      const fill  = this.stageSegmentFills[i];
      if (track && fill) {
        const targetW = Math.max(1, track.width * within);
        fill.width = targetW;
        // Keep upcoming segments hidden of fill (width=1 looks like a stub),
        // but visible track is fine — the tracks already convey "the stage exists."
        if (within <= 0) fill.width = 0.0001;
      }
    }
    this.progressPct.setText(`${Math.floor(progress * 100)}%`);
    this.updateActiveWorkProgress(progress);
  }

  // ── Progress pop (floating +N on each day tick) ───────────────────

  // Small "+N gold" float near the institution entrance when a sale lands.
  // Throttled implicitly — only fires when SalesSystem reports a non-zero amount.
  private spawnSalesCoin(amount: number) {
    Audio.playSfx('coin_gain', { volume: 0.45 });
    // Drop the coin near the entrance (between the two candle positions).
    const baseX = 642;
    const baseY = 470;
    const x = baseX + (Math.random() - 0.5) * 80;
    const y = baseY + (Math.random() - 0.5) * 20;
    const pop = this.add.text(x, y, `+${amount}g`, {
      fontSize: '12px',
      color: '#d4a855',
      fontFamily: 'Georgia, serif',
      stroke: '#1a0d06',
      strokeThickness: 2,
    }).setOrigin(0.5, 1).setDepth(10).setAlpha(0);

    this.tweens.add({
      targets: pop,
      alpha:   { from: 0, to: 0.85 },
      duration: 280,
      onComplete: () => {
        this.tweens.add({
          targets: pop,
          y:       y - 36,
          alpha:   0,
          duration: 1400,
          ease:    'Sine.easeOut',
          onComplete: () => pop.destroy(),
        });
      },
    });
  }

  private spawnProgressPop() {
    const id = this.activeScholarId;
    if (!id) return;
    const actor   = this.actors.get(id);
    const scholar = Game.state.scholars.find(s => s.id === id);
    const project = Game.state.activeProject;
    if (!actor || !scholar || !project) return;
    const pos = { x: actor.container.x, y: actor.container.y };
    const topic = TOPICS.find(t => t.id === project.topicId);
    const skill = scholar.disciplines[topic?.name ?? ''] ?? 1;
    const pts   = Math.max(1, Math.round(skill / 2));
    const x     = pos.x + (Math.random() - 0.5) * 24;
    const pop   = this.add.text(x, pos.y - 108, `+${pts}`, {
      fontSize: '13px', color: '#d4a855', fontFamily: 'Georgia, serif',
      stroke: '#1a0d06', strokeThickness: 2,
    }).setOrigin(0.5, 1).setDepth(10);
    this.tweens.add({
      targets:  pop,
      y:        pos.y - 140,
      alpha:    0,
      duration: 1100,
      ease:     'Sine.easeOut',
      onComplete: () => pop.destroy(),
    });
  }

  // ── Mid-project event ─────────────────────────────────────────────

  private showMidEvent(scholarName: string, text: string, choice?: MidEventChoice) {
    Game.time.setSpeed('paused');
    this.refreshSpeedButtons();

    // The scholar at the heart of the event reacts in the courtyard.
    const subject = Game.state.scholars.find(s => s.name === scholarName);
    if (subject) this.playReact(subject.id);

    if (choice) {
      this.eventModal.choice<'push' | 'rest' | 'ignore'>({
        heading: scholarName,
        text,
        options: choice.options.map(o => ({ label: o.label, value: o.effect })),
        onPick: (effect) => {
          this.projectSystem.applyMidEventChoice(effect);
          Game.time.setSpeed('normal');
          this.refreshSpeedButtons();
        },
      });
      return;
    }

    this.eventModal.show(scholarName, text, () => {
      Game.time.setSpeed('normal');
      this.refreshSpeedButtons();
    });
  }

  // ── Project completed ─────────────────────────────────────────────

  private onProjectCompleted(work: Work) {
    this.updateProgressBar(1);
    Game.time.setSpeed('paused');
    this.refreshSpeedButtons();
    this.celebrateWorkTeam(true);

    this.releaseModal.show(work, () => {
      Events.emit(GameEvents.WORK_RELEASED, { work });

      this.updatePrestigeDisplay();
      this.clearActiveProjectUI();
    });
  }

  private clearActiveProjectUI() {
    this.activeScholarId = undefined;
    this.stopWorkEmotes();
    this.stopBubbleEmitter();
    this.hideStageGauge();
    this.hideActiveWork();
    this.activeProjectPanelBg.setVisible(false);
    this.activeProjectLabel.setVisible(false);
    this.activeScholarLabel.setVisible(false);
    for (const t of this.stageSegmentTracks) t.setVisible(false);
    for (const f of this.stageSegmentFills)  f.setVisible(false);
    this.progressPct.setVisible(false);
    this.cancelBtn.setVisible(false);
    this.updateProgressBar(0);
    this.refreshNewWorkBtn();
    this.refreshScholarSprites();
  }

  // ── Guard rails ───────────────────────────────────────────────────

  private canStartProject(): boolean {
    if (Game.state.activeProject) return false;
    return Game.state.scholars.some(s => s.isAvailable);
  }

  private refreshNewWorkBtn() {
    const project = Game.state.activeProject;
    if (project) {
      // Stages auto-assign every idle scholar, so there's nothing to "Add".
      // Show a calm read-only label so the chrome doesn't disappear.
      this.newWorkBtn.setVisible(true);
      this.newWorkBtn.setColor('#5a4030');
      const idx = project.currentStageIndex;
      const stageLabel = STAGE_INFO[STAGE_ORDER[idx]].label;
      this.newWorkBtn.setText(`Stage ${idx + 1}/${STAGE_ORDER.length} · ${stageLabel}`);
      return;
    }
    const enabled = this.canStartProject();
    this.newWorkBtn.setVisible(true);
    this.newWorkBtn.setColor(enabled ? '#c8a87a' : '#5a4030');
    this.newWorkBtn.setText(enabled ? 'New Work' : 'No scholars free');
  }

  private newWorkBtnEnabled(): boolean {
    return !Game.state.activeProject && this.canStartProject();
  }

  private onNewWorkBtnPressed() {
    if (!Game.state.activeProject && this.canStartProject()) {
      this.openProjectPanel();
    }
  }

  // ── Cancel ────────────────────────────────────────────────────────

  private requestCancelProject() {
    const project = Game.state.activeProject;
    if (!project) return;
    if (this.eventModal.isOpen()) return;

    const prevSpeed = Game.time.speed;
    Game.time.setSpeed('paused');
    this.refreshSpeedButtons();

    const scholar = Game.state.scholars.find(s => s.id === project.leadScholarId);
    const firstName = scholar?.name.split(' ')[0] ?? 'the scholar';
    const pct = Math.round(project.progress * 100);

    this.eventModal.confirm({
      heading: 'Abandon this work?',
      text: `${firstName} is ${pct}% of the way through. All progress will be lost.`,
      confirmLabel: 'Abandon',
      cancelLabel: 'Keep working',
      onConfirm: () => {
        // Release every scholar who ever touched the project (across all stages).
        const involved = new Set<string>();
        involved.add(project.leadScholarId);
        for (const aid of project.assistantScholarIds) involved.add(aid);
        for (const s of project.stages) {
          involved.add(s.leadScholarId);
          for (const aid of s.assistantScholarIds) involved.add(aid);
        }
        for (const id of involved) {
          const sch = Game.state.scholars.find(x => x.id === id);
          if (sch) sch.isAvailable = true;
        }
        Game.state.activeProject = undefined;
        Events.emit(GameEvents.PROJECT_CANCELLED, { project, refund: 0 });
        this.clearActiveProjectUI();
      },
      onCancel: () => {
        Game.time.setSpeed(prevSpeed);
        this.refreshSpeedButtons();
      },
    });
  }

  // ── Toasts ────────────────────────────────────────────────────────

  // One-shot toast for first-time achievements. Persists the flag on
  // Game.state so a saved game won't re-fire the same milestone. Pass a
  // unique key and the toast body; we short-circuit if already shown.
  private fireMilestone(key: keyof NonNullable<typeof Game.state.milestoneFlags>, text: string) {
    if (!Game.state.milestoneFlags) Game.state.milestoneFlags = {};
    if (Game.state.milestoneFlags[key]) return;
    Game.state.milestoneFlags[key] = true;
    this.queueJournalNote(`★ ${text}`);
    Audio.playSfx('ui_select', { volume: 0.7 });
  }

  private showToast(text: string, color: string = '#d4a855', dwellMs: number = 2200) {
    Audio.playSfx('page_turn', { volume: 0.5 });
    const { width } = this.scale;
    const toast = this.add.text(width / 2, 72, text, {
      fontSize: '13px', color, fontFamily: 'Georgia, serif',
      backgroundColor: '#0d0704e8', padding: { x: 14, y: 7 },
    }).setOrigin(0.5).setDepth(20).setAlpha(0);

    this.tweens.add({
      targets: toast, alpha: 1, duration: 280,
      onComplete: () => {
        this.time.delayedCall(dwellMs, () => {
          this.tweens.add({
            targets: toast, alpha: 0, duration: 500,
            onComplete: () => toast.destroy(),
          });
        });
      },
    });
  }

  private showSkillUpToast(scholarId: string, topic: string, newLevel: number) {
    const scholar = Game.state.scholars.find(s => s.id === scholarId);
    if (!scholar) return;
    const firstName = scholar.name.split(' ')[0];
    this.showToast(`${firstName}  ·  ${topic} improved to ${newLevel}`);
  }

  private showTreasuryLowToast(tier: 'strained' | 'critical') {
    const text = tier === 'critical'
      ? 'The coffers are nearly empty. The next month\'s salaries may not be paid.'
      : 'The treasury is running thin. Consider releasing a work or trimming costs.';
    this.showToast(text, tier === 'critical' ? '#c87a4a' : '#c8a87a', 3600);
  }

  private showBankruptcyModal(amount: number, monthsNegative: number) {
    Game.time.setSpeed('paused');
    this.refreshSpeedButtons();
    this.eventModal.show(
      'The Institution Falters',
      `For ${monthsNegative} months the treasury has held no coin (${amount} gold). The scholars whisper. Patrons withdraw. The work continues for now — but on borrowed time.`,
      () => { /* dismiss; not a hard game-over yet */ },
    );
  }

  private showPatronToast(amount: number, flavor: string) {
    this.eventModal.show('A Patron Arrives', `${flavor}\n\n+ ${amount} gold to the treasury.`, () => {});
  }

  private showPoachAttempt(payload: EventPayloads[typeof GameEvents.POACH_ATTEMPT]) {
    Game.time.setSpeed('paused');
    this.refreshSpeedButtons();
    const canAffordCounter = Game.state.treasury >= payload.counterOfferCost;
    this.eventModal.choice<'counter' | 'persuade' | 'release'>({
      heading: `${payload.rivalName} has approached ${payload.scholarName}`,
      text: `${payload.rivalName} has made ${payload.scholarName} an offer. They are weighing it. How does the institution respond?`,
      options: [
        { label: `Match the offer · ${payload.counterOfferCost} gold`,
          value: 'counter',
          blurb: canAffordCounter
            ? 'A bonus and a raise. They stay, their morale rises, restlessness eases.'
            : 'Insufficient treasury — they will leave if you choose this.' },
        { label: 'Speak to them, persuade them to stay',
          value: 'persuade',
          blurb: 'No cost; success depends on their current morale.' },
        { label: 'Let them go',
          value: 'release',
          blurb: `They join ${payload.rivalName}.` },
      ],
      onPick: (choice) => {
        if (choice === 'counter') {
          this.world.applyCounterOffer(payload.rivalId, payload.scholarId, payload.counterOfferCost);
        } else if (choice === 'persuade') {
          const stayed = this.world.applyPersuade(payload.rivalId, payload.scholarId);
          if (stayed) {
            this.showToast(`${payload.scholarName.split(' ')[0]} agrees to stay`, '#8ab87a', 2600);
          }
        } else {
          this.world.applyLetGo(payload.rivalId, payload.scholarId);
        }
      },
    });
  }

  private showDepartmentProposal(payload: EventPayloads[typeof GameEvents.DEPARTMENT_PROJECT_PROPOSED]) {
    Game.time.setSpeed('paused');
    this.refreshSpeedButtons();
    this.eventModal.confirm({
      heading: `${payload.departmentName} proposes a new work`,
      text: `${payload.headName} proposes a ${payload.formatName} on ${payload.topicName}. They and a small team from the department will see it through — unavailable for player projects until it is done.`,
      confirmLabel: 'Approve the work',
      cancelLabel:  'Decline this proposal',
      onConfirm: () => this.departments.acceptProposal(payload.proposalId),
      onCancel:  () => this.departments.declineProposal(payload.proposalId),
    });
  }

  private showDepartmentEscalation(payload: EventPayloads[typeof GameEvents.DEPARTMENT_PROJECT_ESCALATED]) {
    Game.time.setSpeed('paused');
    this.refreshSpeedButtons();
    const cost = payload.kind === 'missing_source' ? 60
              : payload.kind === 'controversy'    ? 80
              :                                     40;
    this.eventModal.choice<'pay' | 'ignore'>({
      heading: `Trouble in ${payload.departmentName}`,
      text: payload.flavor,
      options: [
        { label: `Intervene · ${cost} gold`, value: 'pay',
          blurb: 'The institution steps in. The project resumes immediately.' },
        { label: 'Let them resolve it themselves', value: 'ignore',
          blurb: 'The project pauses up to 30 days; morale and progress will suffer.' },
      ],
      onPick: (choice) => this.departments.resolveEscalation(payload.projectId, choice === 'pay'),
    });
  }

  private showFounderSuccession(payload: EventPayloads[typeof GameEvents.FOUNDER_SUCCESSION]) {
    Game.time.setSpeed('paused');
    this.refreshSpeedButtons();

    if (!payload.departmentId) {
      // Founder retired but didn't lead a department — just a ceremonial note.
      this.eventModal.show(
        `${payload.founderName} departs`,
        `One of the founding scholars has chosen to step away from active work. Their hand shaped the institution; their absence will be felt. (+5 prestige)`,
        () => {},
      );
      return;
    }

    const dept = Game.state.departments.find(d => d.id === payload.departmentId);
    if (!dept) return;

    // Candidates: members of the same discipline who are still around
    const candidates = Game.state.scholars.filter(s =>
      s.id !== payload.founderId && s.primaryDiscipline === dept.discipline,
    );

    if (candidates.length === 0) {
      this.eventModal.confirm({
        heading: `${payload.founderName} departs`,
        text: `${payload.founderName} has retired. ${dept.name} has no remaining members of the right discipline to lead. The department will be disbanded.`,
        confirmLabel: 'Disband',
        cancelLabel:  'Keep open (no head)',
        onConfirm: () => this.institution.disbandDepartment(dept.id, 'No successor could be found.'),
        onCancel:  () => { /* leaves it leaderless; institution will auto-disband next tick */ },
      });
      return;
    }

    this.eventModal.choice<string>({
      heading: `${payload.founderName} departs — name a successor`,
      text: `${payload.founderName} has retired. ${dept.name} needs a new head. Choose a scholar to carry their work forward, or close the department.`,
      options: [
        ...candidates.map(c => ({
          label: `${c.name}`,
          value: c.id,
          blurb: `${dept.discipline} ${c.disciplines[dept.discipline] ?? 0}/10  ·  ${c.archetype}`,
        })),
        { label: 'Disband the department', value: '__disband__', blurb: 'Their work was theirs alone.' },
      ],
      onPick: (choice) => {
        if (choice === '__disband__') {
          this.institution.disbandDepartment(dept.id, `Following ${payload.founderName}'s retirement, no successor was named.`);
        } else {
          dept.headScholarId = choice;
          dept.morale = Math.max(0.4, dept.morale - 0.1);
          this.queueJournalNote(`${Game.state.scholars.find(s => s.id === choice)?.name ?? 'A new head'} now leads ${dept.name}.`);
        }
      },
    });
  }

  private showFactionPatronageOffer(payload: EventPayloads[typeof GameEvents.FACTION_PATRONAGE_OFFERED]) {
    Game.time.setSpeed('paused');
    this.refreshSpeedButtons();
    this.eventModal.confirm({
      heading: `${payload.factionName} extends patronage`,
      text: `${payload.flavor}\n\nMonthly stipend: ${payload.stipend} gold.`,
      confirmLabel: 'Accept their patronage',
      cancelLabel:  'Decline politely',
      onConfirm: () => {
        const patron = new IdeologySystem().buildFactionPatron(payload.factionId);
        Game.state.majorPatrons.push(patron);
        Events.emit(GameEvents.MAJOR_PATRON_ACCEPTED, {
          patronId: patron.id, patronName: patron.name,
        });
      },
      onCancel: () => {
        // Standing softens slightly when declined.
        const f = Game.state.ideology.factions[payload.factionId];
        Game.state.ideology.factions[payload.factionId] = Math.max(0, f - 20);
      },
    });
  }

  private showPatronOfferModal(patron: import('../models/Economy').MajorPatron, arrivalFlavor: string) {
    Game.time.setSpeed('paused');
    this.refreshSpeedButtons();
    const expects = patron.expectsDiscipline
      ? `\n\nThey expect periodic works in ${patron.expectsDiscipline}.`
      : '';
    this.eventModal.confirm({
      heading: `${patron.name} extends an offer`,
      text: `${arrivalFlavor}\n\nMonthly stipend: ${patron.stipend} gold.${expects}`,
      confirmLabel: 'Accept their patronage',
      cancelLabel:  'Decline politely',
      onConfirm: () => Game.economy.acceptMajorPatron(patron),
      onCancel:  () => Game.economy.declineMajorPatron(patron),
    });
  }

  private showCommissionOfferModal(commission: import('../models/Economy').MinorCommission) {
    Game.time.setSpeed('paused');
    this.refreshSpeedButtons();
    const topic  = TOPICS.find(t => t.id === commission.topicId);
    const format = FORMATS.find(f => f.id === commission.formatId);
    const text = `${commission.patronName} ${commission.flavor}: a ${format?.name ?? 'work'} on ${topic?.name ?? 'a subject'}. They offer ${commission.payment} gold on delivery.`;
    this.eventModal.confirm({
      heading: `A commission from ${commission.patronName}`,
      text,
      confirmLabel: 'Accept commission',
      cancelLabel:  'Decline',
      onConfirm: () => Game.economy.acceptMinorCommission(),
      onCancel:  () => Game.economy.declineMinorCommission(),
    });
  }

  private showSalaryModal(candidateIdx: number) {
    const candidate = Game.state.currentCandidates[candidateIdx];
    if (!candidate) return;
    const askingSalary = candidate.salary;
    const above = Math.ceil(askingSalary * 1.10);
    const below = Math.max(1, Math.floor(askingSalary * 0.90));
    this.eventModal.choice<'asking' | 'above' | 'below'>({
      heading: `Negotiate with ${candidate.name}`,
      text: `${candidate.name.split(' ')[0]} asks ${askingSalary} gold per month. How will you pay them?`,
      options: [
        { label: `Pay above asking · ${above}/mo`,  value: 'above',
          blurb: 'They arrive grateful. Higher morale, lower restlessness.' },
        { label: `Pay the asking salary · ${askingSalary}/mo`, value: 'asking',
          blurb: 'A fair deal. They arrive on neutral terms.' },
        { label: `Pay below asking · ${below}/mo`,  value: 'below',
          blurb: 'They take less, but resent it. Lower morale, faster restlessness.' },
      ],
      onPick: (deal) => {
        if (!this.scholarPanel.completeHire(candidateIdx, deal)) {
          // Treasury fell out from under us; rebuild to refresh disabled states.
          this.scholarPanel.hide(); this.scholarPanel.show();
        }
      },
    });
  }

  private showGameOverModal(state: import('../models/Economy').GameOverState) {
    Game.time.setSpeed('paused');
    this.refreshSpeedButtons();
    const reasonLine = state.reason === 'bankruptcy'
      ? 'The treasury is empty. The institution can no longer pay its way.'
      : 'No scholars remain. The institution has emptied of those who made it.';
    const years = Math.floor((state.day - 1) / 360) + 1;
    const summary =
      `${reasonLine}\n\n` +
      `${state.institutionName} stood for ${years} year${years === 1 ? '' : 's'}.\n` +
      `Prestige at its end: ${state.finalPrestige}.\n` +
      `Works released: ${state.worksReleased}.\n` +
      `Scholars who passed through its halls: ${state.scholarsPassedThrough}.\n\n` +
      `What you built remains in the records.`;
    this.eventModal.show('The End of an Era', summary, () => {
      Game.reset();
      this.scene.start('Menu');
    });
  }

  // ── Chronicle feed ────────────────────────────────────────────────
  // Flavor events (trait reveals, rival news, chemistry shifts, world
  // events…) land here as non-blocking parchment notes on the right edge.
  // The game keeps flowing — only genuine decisions pause time now.

  private static readonly CHRONICLE_W = 312;
  private static readonly CHRONICLE_X = 1280 - 312 - 14;
  private static readonly CHRONICLE_Y = BAR_H + 12;
  private static readonly CHRONICLE_MAX = 4;

  private queueJournalNote(flavor: string) {
    Audio.playSfx('page_turn', { volume: 0.3 });

    const w = CampusScene.CHRONICLE_W;
    const text = this.add.text(12, 9, flavor, {
      fontSize: '12px', color: '#e8d5b0', fontFamily: 'Georgia, serif',
      wordWrap: { width: w - 24 }, lineSpacing: 3,
    }).setOrigin(0, 0);
    const h = Math.min(150, text.height + 18);
    const bg = this.add.rectangle(0, 0, w, h, 0x14100a, 0.93)
      .setOrigin(0, 0).setStrokeStyle(1, 0x3a2818, 0.9);
    const accent = this.add.rectangle(0, 0, 3, h, 0xd4a855, 0.85).setOrigin(0, 0);

    const card = this.add.container(CampusScene.CHRONICLE_X + 30, 0, [bg, accent, text])
      .setDepth(25).setAlpha(0);
    card.setData('h', h);

    // Click to dismiss early.
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => this.dismissChronicleCard(card));

    this.chronicleCards.unshift(card);
    while (this.chronicleCards.length > CampusScene.CHRONICLE_MAX) {
      this.dismissChronicleCard(this.chronicleCards[this.chronicleCards.length - 1]);
    }
    this.layoutChronicle();

    this.tweens.add({
      targets: card, alpha: 1, x: CampusScene.CHRONICLE_X,
      duration: 320, ease: 'Sine.easeOut',
    });
    // Longer notes stay readable longer.
    const dwell = 6000 + Math.min(6000, flavor.length * 22);
    this.time.delayedCall(dwell, () => this.dismissChronicleCard(card));
  }

  private dismissChronicleCard(card: Phaser.GameObjects.Container) {
    const idx = this.chronicleCards.indexOf(card);
    if (idx < 0) return;
    this.chronicleCards.splice(idx, 1);
    this.tweens.add({
      targets: card, alpha: 0, x: card.x + 24, duration: 280, ease: 'Sine.easeIn',
      onComplete: () => card.destroy(),
    });
    this.layoutChronicle();
  }

  private layoutChronicle() {
    let y = CampusScene.CHRONICLE_Y;
    for (const card of this.chronicleCards) {
      this.tweens.add({ targets: card, y, duration: 260, ease: 'Sine.easeOut' });
      y += (card.getData('h') as number) + 8;
    }
  }

  private showRestlessToast(scholarId: string, reason: string) {
    const scholar = Game.state.scholars.find(s => s.id === scholarId);
    if (!scholar) return;
    const firstName = scholar.name.split(' ')[0];
    this.showToast(`${firstName} grows restless · ${reason}`, '#c87a4a', 3600);
  }

  private showLeftModal(scholarName: string, reason: string) {
    Game.time.setSpeed('paused');
    this.refreshSpeedButtons();
    this.rebuildScholarSprites();
    this.eventModal.show(
      'A scholar departs',
      `${scholarName} has left the institution. ${reason}`,
      () => {
        this.refreshNewWorkBtn();
        // If the active project was cancelled because they left, the UI needs to clear.
        if (!Game.state.activeProject) this.clearActiveProjectUI();
      },
    );
  }

  // ── Treasury display ──────────────────────────────────────────────

  private updateTreasuryDisplay(amount: number) {
    const state = getTreasuryState(amount);
    this.treasuryIndicator.setTexture(`indicator_${state}`);
    this.treasuryLabel.setText(this.formatTreasury(amount, state));
    this.treasuryLabel.setColor(TREASURY_COLORS[state]);
    this.updateAmbientMood();
  }

  private formatTreasury(amount: number, state: string): string {
    return `${TREASURY_LABELS[state]}  ·  ${amount} gold`;
  }

  private formatPrestige(value: number): string {
    return value <= 0
      ? 'Prestige: —'
      : `Prestige: ${value}  ·  ${prestigeTier(value)}`;
  }

  // Top-bar stance label — surfaces the dominant axis as a quick read.
  // Falls back to "Stance" when the institution has no published works yet.
  private formatStance(): string {
    const axes = Game.state.ideology?.axes;
    if (!axes) return 'Stance';
    let strongest: { axis: 'piety' | 'tradition' | 'populism'; abs: number } | null = null;
    for (const k of ['piety', 'tradition', 'populism'] as const) {
      const abs = Math.abs(axes[k]);
      if (!strongest || abs > strongest.abs) strongest = { axis: k, abs };
    }
    if (!strongest || strongest.abs < 10) return 'Stance: Balanced';
    const v = axes[strongest.axis];
    const side = v >= 0
      ? (strongest.axis === 'piety' ? 'Pious' : strongest.axis === 'tradition' ? 'Traditional' : 'Populist')
      : (strongest.axis === 'piety' ? 'Secular' : strongest.axis === 'tradition' ? 'Progressive' : 'Elite');
    const intensity = strongest.abs >= 60 ? 'Strongly ' : strongest.abs >= 30 ? '' : 'Leans ';
    return `Stance: ${intensity}${side}`;
  }

  private formatInstitutionLabel(): string {
    const tierName = Game.state.tier === 1 ? 'Founding Hall'
                   : Game.state.tier === 2 ? 'Academy'
                   : 'University';
    return `${Game.state.institutionName}  ·  ${tierName}`;
  }

  private refreshInstitutionLabel() {
    if (this.institutionLabel) this.institutionLabel.setText(this.formatInstitutionLabel());
  }

  private updatePrestigeDisplay() {
    this.prestigeLabel.setText(this.formatPrestige(Game.state.prestige));
  }
}
