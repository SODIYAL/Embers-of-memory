// The main game view — a pure-DOM replacement for the old Phaser CampusScene.
// It renders the institution as an illuminated chronicle: a status header, a
// living prose page of the abbey, an event chronicle (journal), and a footer
// of time controls + actions. It owns all GameEvent → UI wiring and reuses the
// existing DOM panels and modals unchanged.

import { Game } from '../game/GameManager';
import { Events, GameEvents } from '../game/EventBus';
import type { EventPayloads } from '../game/EventBus';
import { Audio } from '../game/Audio';
import { TOPICS } from '../data/topics';
import { FORMATS } from '../data/formats';
import { STAGE_ORDER, STAGE_INFO } from '../models/Project';
import { STAGE_AXES, normalizeEmphasis } from '../data/stageEmphasis';
import type { Project, StageKey } from '../models/Project';
import type { Work } from '../models/Work';
import type { Scholar } from '../models/Scholar';
import type { MidEventChoice } from '../game/EventBus';
import { IdeologySystem } from '../systems/IdeologySystem';

import { ProjectPanel } from '../ui/panels/ProjectPanel';
import { ScholarPanel } from '../ui/panels/ScholarPanel';
import { InstitutionPanel } from '../ui/panels/InstitutionPanel';
import { TreasuryPanel } from '../ui/panels/TreasuryPanel';
import { IdeologyPanel } from '../ui/panels/IdeologyPanel';
import { WorldPanel } from '../ui/panels/WorldPanel';
import { DecisionModal } from '../ui/modals/DecisionModal';
import { ReleaseReportModal } from '../ui/modals/ReleaseReportModal';
import { StageGateModal } from '../ui/modals/StageGateModal';

type MilestoneKey = keyof NonNullable<typeof Game.state.milestoneFlags>;
type Tone = 'neutral' | 'gain' | 'loss' | 'grand';

const ROMAN: Array<[number, string]> = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];
function toRoman(n: number): string {
  let out = '', v = Math.max(1, n);
  for (const [val, sym] of ROMAN) while (v >= val) { out += sym; v -= val; }
  return out;
}

function calendar(day: number) {
  const year  = Math.floor((day - 1) / 360) + 1;
  const month = Math.floor(((day - 1) % 360) / 30) + 1;
  const d     = ((day - 1) % 30) + 1;
  return { year, month, d };
}
const SEASONS = ['deep winter', 'late winter', 'early spring', 'spring', 'late spring',
  'early summer', 'high summer', 'late summer', 'early autumn', 'autumn', 'late autumn', 'winter'];
function seasonOf(month: number): string { return SEASONS[(month - 1) % 12]; }

function prestigeTier(value: number): string {
  if (value >= 100) return 'Celebrated';
  if (value >= 50)  return 'Renowned';
  if (value >= 20)  return 'a name of regional renown';
  if (value >= 5)   return 'a name of local renown';
  return 'little known';
}

function treasuryState(): 'prosperous' | 'stable' | 'strained' | 'critical' {
  const tier = Game.state.treasuryWarningTier;
  if (tier === 'critical') return 'critical';
  if (tier === 'strained') return 'strained';
  const amt = Game.state.treasury;
  if (amt >= 300) return 'prosperous';
  if (amt >= 150) return 'stable';
  if (amt >= 50)  return 'strained';
  return 'critical';
}

function tierName(): string {
  return Game.state.tier === 1 ? 'Founding Hall' : Game.state.tier === 2 ? 'Academy' : 'University';
}

function stanceLabel(): string {
  const axes = Game.state.ideology?.axes;
  if (!axes) return 'Unwritten';
  let strongest: { axis: 'piety' | 'tradition' | 'populism'; abs: number } | null = null;
  for (const k of ['piety', 'tradition', 'populism'] as const) {
    const abs = Math.abs(axes[k]);
    if (!strongest || abs > strongest.abs) strongest = { axis: k, abs };
  }
  if (!strongest || strongest.abs < 10) return 'Balanced';
  const v = axes[strongest.axis];
  const side = v >= 0
    ? (strongest.axis === 'piety' ? 'Pious' : strongest.axis === 'tradition' ? 'Traditional' : 'Populist')
    : (strongest.axis === 'piety' ? 'Secular' : strongest.axis === 'tradition' ? 'Progressive' : 'Elite');
  const intensity = strongest.abs >= 60 ? 'Strongly ' : strongest.abs >= 30 ? '' : 'Leans ';
  return `${intensity}${side}`;
}

const firstName = (full: string) => full.split(' ')[0];
// Resolve a scholar id to their first name for chronicle prose (events carry
// ids, not names). Falls back to the raw id only if the scholar is gone.
const scholarFirstName = (id: string) => {
  const s = Game.state.scholars.find(x => x.id === id);
  return s ? firstName(s.name) : id;
};

// A finished stage's qualitySlice (0..~0.46) → a one-word verdict.
function stageQualityMark(slice: number): string {
  if (slice >= 0.30) return 'excellent';
  if (slice >= 0.24) return 'strong';
  if (slice >= 0.18) return 'solid';
  if (slice >= 0.12) return 'uneven';
  return 'troubled';
}

// A live read of how the CURRENT stage is going — derived from the same
// factors the quality math uses (lead's topic skill, format synergy, and the
// lead's morale/stress/energy), since the stage's slice isn't fixed until it
// closes. Returns a label, a plain-language reason, and a tone for coloring.
function projectOutlook(p: Project): { label: string; reason: string; tone: Tone } | null {
  const topic = TOPICS.find(t => t.id === p.topicId);
  const stage = p.stages[p.stages.length - 1];
  const lead = stage ? Game.state.scholars.find(s => s.id === stage.leadScholarId) : undefined;
  if (!topic || !stage || !lead) return null;

  const skill = (lead.disciplines[topic.name] ?? 1) / 10;
  const strong = topic.strongFormats.includes(p.formatId);
  const weak = topic.weakFormats.includes(p.formatId);
  const morale = lead.morale ?? 0.5;
  const stress = lead.stress ?? 0;
  const exhaustion = lead.exhaustion ?? 0;

  let score = skill
    + (strong ? 0.12 : weak ? -0.12 : 0)
    + (morale - 0.6) * 0.5
    - Math.max(0, stress - 0.5) * 0.6
    - Math.max(0, exhaustion - 0.5) * 0.6;
  score = Math.max(0, Math.min(1, score));

  const ln = firstName(lead.name);
  const reason =
      stress > 0.6      ? `${ln} is strained by the work`
    : exhaustion > 0.6  ? `${ln} is wearing thin`
    : weak              ? `the format sits awkwardly with ${topic.name}`
    : skill >= 0.7      ? `${ln} knows ${topic.name} deeply`
    : skill < 0.35      ? `${topic.name} lies far from ${ln}'s expertise`
    : strong            ? `the format suits ${topic.name} well`
    : morale >= 0.8     ? `spirits are high`
    :                     `the work proceeds at an even hand`;

  const label = score >= 0.72 ? 'Promising'
              : score >= 0.52 ? 'Steady'
              : score >= 0.34 ? 'Uncertain'
              :                 'Troubled';
  const tone: Tone = score >= 0.72 ? 'gain' : score >= 0.34 ? 'neutral' : 'loss';
  return { label, reason, tone };
}

// Live "the work taking shape" readout for the current stage — the analog to
// Game Dev Tycoon's design/tech bubbles. Each of the stage's three axes
// accumulates points as the stage progresses, scaled by the lead's (and
// assistants') skill and weighted by the player's emphasis allocation.
function stageGauge(p: Project): { stageLabel: string; axes: Array<{ name: string; value: number; pct: number }> } | null {
  const stage = p.stages[p.stages.length - 1];
  if (!stage) return null;
  const topic = TOPICS.find(t => t.id === p.topicId);
  const lead = Game.state.scholars.find(s => s.id === stage.leadScholarId);
  const axes = STAGE_AXES[stage.key];
  const N = STAGE_ORDER.length;

  // Fraction of THIS stage completed (each stage spans 1/N of total progress).
  const stageStart = p.currentStageIndex / N;
  const frac = Math.max(0, Math.min(1, (p.progress - stageStart) * N));

  const leadSkill = lead && topic ? (lead.disciplines[topic.name] ?? 1) / 10 : 0.3;
  let assist = 0;
  const diminish = [0.5, 0.35, 0.25];
  stage.assistantScholarIds.forEach((id, i) => {
    const a = Game.state.scholars.find(x => x.id === id);
    if (a && topic) assist += ((a.disciplines[topic.name] ?? 0) / 10) * (diminish[Math.min(i, 2)] ?? 0.2);
  });

  // Total points this stage would generate at completion, then the live slice.
  const live = (leadSkill * 70 + assist * 30) * frac;
  const weights = normalizeEmphasis(stage.emphasis ?? {}, stage.key);
  // Bars are scaled against a fixed reference (a strong stage), so they visibly
  // fill up over the stage and emphasized axes read as fuller — rather than
  // always maxing relative to each other.
  const GAUGE_FULL = 40;
  const vals = axes.map(a => ({ name: a, value: Math.round(live * (weights[a] ?? 1 / axes.length)) }));
  return {
    stageLabel: STAGE_INFO[stage.key].label,
    axes: vals.map(v => ({ ...v, pct: Math.min(100, Math.round((v.value / GAUGE_FULL) * 100)) })),
  };
}

// ── Scholar wellbeing readout (the right-rail panel) ─────────────────

const FOUNDER_IDS = ['yildiz', 'ossavi', 'meridian', 'vasara', 'harlow'];

function scholarPortraitHTML(s: Scholar): string {
  if (FOUNDER_IDS.includes(s.id)) {
    return `<img src="assets/portraits/portrait_${s.id}.png" alt="${s.name}" class="ms-sch-portrait-img" />`;
  }
  const initial = (s.name[0] ?? '?').toUpperCase();
  const palette = ['#5c3418', '#3d2418', '#4a3018', '#5a3820', '#6e3e1c', '#6a4828'];
  const color = palette[initial.charCodeAt(0) % palette.length];
  return `<div class="ms-sch-portrait-initial" style="background:${color}">${initial}</div>`;
}

const moodTone = (v: number): 'good' | 'mid' | 'low' => (v >= 0.65 ? 'good' : v >= 0.4 ? 'mid' : 'low');
const stressTone = (v: number): 'good' | 'mid' | 'low' => (v <= 0.35 ? 'good' : v <= 0.6 ? 'mid' : 'low');

// A concrete, prioritized suggestion for how to improve this scholar.
function scholarSuggestion(s: Scholar): string {
  const morale = s.morale ?? 0.5;
  const stress = s.stress ?? 0;
  const exhaustion = s.exhaustion ?? 0;
  if (s.isResting)        return 'Resting — recovering their strength.';
  if (exhaustion > 0.6)   return 'Worn down — send them to rest before they break.';
  if (stress > 0.6)       return 'Badly strained — a spell of rest would steady them.';
  if (s.restlessFlagged)  return 'Restless — give them a work to lead, or they may leave.';
  if (morale < 0.4)       return 'Low spirits — fairer pay or a released work would lift them.';
  if (!s.isAvailable)     return 'At work on a project — leave them to it.';
  return 'Content and free — ready for a new undertaking.';
}

export class GameView {
  private el: HTMLElement | null = null;
  private offFns: Array<() => void> = [];

  // Live element refs
  private nameEl!: HTMLElement;
  private tierEl!: HTMLElement;
  private dateEl!: HTMLElement;
  private prestigeEl!: HTMLElement;
  private treasuryEl!: HTMLElement;
  private stanceEl!: HTMLElement;
  private pageEl!: HTMLElement;
  private feedEl!: HTMLElement;
  private scholarsEl!: HTMLElement;
  private pausedHintEl!: HTMLElement;
  private muteEl!: HTMLElement;
  private progressFill: HTMLElement | null = null;
  private progressPct: HTMLElement | null = null;
  private outlookEl: HTMLElement | null = null;
  private gaugeEl: HTMLElement | null = null;

  // Panels & modals (reused unchanged)
  private projectPanel = new ProjectPanel();
  private scholarPanel = new ScholarPanel(Game.recruitment);
  private institutionPanel = new InstitutionPanel(Game.institution);
  private treasuryPanel = new TreasuryPanel(Game.economy, Game.reprints);
  private ideologyPanel = new IdeologyPanel();
  private worldPanel = new WorldPanel();
  private eventModal = new DecisionModal();
  private releaseModal = new ReleaseReportModal();
  private stageGateModal = new StageGateModal();

  private onKey = (e: KeyboardEvent) => this.handleKey(e);

  private readonly root: HTMLElement;
  private readonly opts: { onExit: () => void };

  constructor(root: HTMLElement, opts: { onExit: () => void }) {
    this.root = root;
    this.opts = opts;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────

  mount() {
    Audio.playMusic('music_campus');
    this.scholarPanel.onHireRequest = (idx) => this.showSalaryModal(idx);

    this.el = document.createElement('div');
    this.el.id = 'app-game';
    this.el.style.display = 'contents';
    this.el.innerHTML = this.skeleton();
    this.root.appendChild(this.el);

    this.cacheRefs();
    this.wireControls();
    this.subscribe();

    Game.start();
    // Begin paused so the chronicle can be read; the player presses play.
    Game.time.setSpeed('paused');

    this.renderHeader();
    this.renderPage();
    this.updateClock();
    if (Game.state.activeProject) this.updateProgress(Game.state.activeProject.progress);

    this.appendChronicle('The chronicle opens. Press play to let the days turn.', 'grand');
    window.addEventListener('keydown', this.onKey);
  }

  unmount() {
    Game.time.setSpeed('paused');
    window.removeEventListener('keydown', this.onKey);
    for (const off of this.offFns) off();
    this.offFns = [];
    this.eventModal.hide();
    this.el?.remove();
    this.el = null;
  }

  private skeleton(): string {
    return `
      <header class="ms-header parchment">
        <div class="ms-title-block">
          <div class="ms-institution" id="ms-name"></div>
          <div class="ms-tier" id="ms-tier"></div>
        </div>
        <div class="ms-date" id="ms-date"></div>
        <div class="ms-stats">
          <div class="ms-chip" id="ms-chip-prestige" title="Prestige">
            <span class="ms-chip-label">Renown</span><span class="ms-chip-value" id="ms-prestige">—</span>
          </div>
          <div class="ms-chip" id="ms-chip-treasury" title="Treasury">
            <span class="ms-chip-label">Coffers</span><span class="ms-chip-value" id="ms-treasury">—</span>
          </div>
          <div class="ms-chip" id="ms-chip-stance" title="Stance">
            <span class="ms-chip-label">Stance</span><span class="ms-chip-value" id="ms-stance">—</span>
          </div>
          <button class="ms-icon-btn" id="ms-mute" title="Mute">♪</button>
          <button class="ms-icon-btn" id="ms-quit" title="Return to the title">⟲</button>
        </div>
      </header>

      <main class="ms-main">
        <section class="ms-page parchment" id="ms-page"></section>
        <div class="ms-rail-col">
          <section class="ms-scholars-panel parchment">
            <div class="ms-rail-head">The Scholars</div>
            <div class="ms-scholars" id="ms-scholars"></div>
          </section>
          <aside class="ms-chronicle parchment">
            <div class="ms-chronicle-head">The Chronicle</div>
            <div class="ms-chronicle-feed" id="ms-feed"></div>
          </aside>
        </div>
      </main>

      <footer class="ms-footer parchment">
        <div class="ms-clock">
          <button class="ms-clock-btn" data-speed="paused" title="Pause (Space)">❙❙</button>
          <button class="ms-clock-btn" data-speed="normal" title="Play (1)">▶</button>
          <button class="ms-clock-btn" data-speed="fast" title="Fast (2)">▶▶</button>
          <span class="ms-paused-hint" id="ms-paused-hint">Paused · Space to resume</span>
        </div>
        <div class="ms-actions">
          <button class="ms-btn primary" id="act-newwork">New Work</button>
          <button class="ms-btn" id="act-scholars">Scholars</button>
          <button class="ms-btn" id="act-institution">Institution</button>
          <button class="ms-btn" id="act-treasury">Treasury</button>
          <button class="ms-btn" id="act-world">World</button>
          <button class="ms-btn" id="act-stance">Stance</button>
        </div>
      </footer>

      <div id="ms-toasts"></div>
    `;
  }

  private cacheRefs() {
    const q = (id: string) => this.el!.querySelector<HTMLElement>(id)!;
    this.nameEl = q('#ms-name');
    this.tierEl = q('#ms-tier');
    this.dateEl = q('#ms-date');
    this.prestigeEl = q('#ms-prestige');
    this.treasuryEl = q('#ms-treasury');
    this.stanceEl = q('#ms-stance');
    this.pageEl = q('#ms-page');
    this.feedEl = q('#ms-feed');
    this.scholarsEl = q('#ms-scholars');
    this.pausedHintEl = q('#ms-paused-hint');
    this.muteEl = q('#ms-mute');
  }

  private wireControls() {
    const el = this.el!;
    const click = (id: string, fn: () => void) =>
      el.querySelector<HTMLElement>(id)!.addEventListener('click', () => { Audio.playSfx('ui_click'); fn(); });

    click('#act-newwork', () => this.onNewWork());
    click('#act-scholars', () => this.scholarPanel.show());
    click('#act-institution', () => this.institutionPanel.show());
    click('#act-treasury', () => this.treasuryPanel.show());
    click('#act-world', () => this.worldPanel.show());
    click('#act-stance', () => this.ideologyPanel.show());
    el.querySelector('#ms-chip-treasury')!.addEventListener('click', () => this.treasuryPanel.show());
    el.querySelector('#ms-chip-stance')!.addEventListener('click', () => this.ideologyPanel.show());

    el.querySelectorAll<HTMLElement>('.ms-clock-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        Audio.playSfx('ui_click');
        this.setSpeed(btn.dataset.speed as 'paused' | 'normal' | 'fast');
      });
    });

    this.muteEl.addEventListener('click', () => {
      const muted = Audio.toggleMute();
      this.muteEl.textContent = muted ? '♪̸' : '♪';
    });
    this.muteEl.textContent = Audio.isMuted() ? '♪̸' : '♪';

    el.querySelector('#ms-quit')!.addEventListener('click', () => this.requestQuit());
  }

  // ── Header / page rendering ────────────────────────────────────────

  private renderHeader() {
    this.nameEl.textContent = Game.state.institutionName;
    this.tierEl.textContent = tierName();
    const { year, month, d } = calendar(Game.state.day);
    this.dateEl.innerHTML =
      `Anno ${toRoman(year)} · Month ${month}, Day ${d} · <span class="ms-season">${seasonOf(month)}</span>`;
    this.renderPrestige();
    this.renderTreasury();
    this.renderStance();
  }

  private renderPrestige() {
    this.prestigeEl.textContent = Game.state.prestige <= 0 ? '—' : String(Game.state.prestige);
  }
  private renderTreasury() {
    const st = treasuryState();
    this.treasuryEl.textContent = `${Game.state.treasury}`;
    this.treasuryEl.className = `ms-chip-value s-${st}`;
  }
  private renderStance() { this.stanceEl.textContent = stanceLabel(); }

  // Full prose page rebuild — called on structural changes, not every tick.
  private renderPage() {
    const s = Game.state;
    const { year, month } = calendar(s.day);
    const paras: string[] = [];

    // 1 — the abbey and its people
    const names = s.scholars.slice(0, 3).map(sc => firstName(sc.name));
    const roster = s.scholars.length === 0
      ? 'Its halls stand empty of scholars.'
      : `${s.scholars.length === 1 ? 'A single scholar dwells' : `${s.scholars.length} scholars dwell`} within` +
        (names.length ? ` — among them ${this.andList(names)}.` : '.');
    paras.push(`In the ${seasonOf(month)} of Anno ${toRoman(year)}, ${s.institutionName} keeps its watch upon the heights. ${roster}`);

    // 2 — work underway
    const p = s.activeProject;
    if (p) {
      const topic = TOPICS.find(t => t.id === p.topicId);
      const format = FORMATS.find(f => f.id === p.formatId);
      const stage = p.stages[p.stages.length - 1];
      const lead = stage ? s.scholars.find(sc => sc.id === stage.leadScholarId) : undefined;
      const stageLabel = stage ? STAGE_INFO[stage.key].label.toLowerCase() : '';
      paras.push(
        `${lead ? firstName(lead.name) : 'The scholars'} labour over ${format?.name ?? 'a work'} ` +
        `concerning ${topic?.name ?? 'a subject'}, now in its ${stageLabel} stage.`);
    } else {
      paras.push('No great work is presently underway; the writing-desks stand bare, awaiting a new undertaking.');
    }

    // 3 — fortunes
    const coffers: Record<ReturnType<typeof treasuryState>, string> = {
      prosperous: 'The coffers are full and the hearth well-stocked.',
      stable: 'The accounts are steady — neither rich nor wanting.',
      strained: 'Coin runs short; the cellarer frowns over the ledger.',
      critical: 'The treasury is all but empty — a grave and pressing want.',
    };
    const renown = s.prestige <= 0
      ? 'The wider world has yet to hear of this place.'
      : `Word of its work has spread; it is ${prestigeTier(s.prestige)}.`;
    paras.push(`${coffers[treasuryState()]} ${renown}`);

    // Build the page
    this.pageEl.innerHTML = `
      <div class="ms-page-head">The Abbey, Presently</div>
      <hr class="ms-rule">
      <div class="ms-prose" id="ms-prose"></div>
      <div class="ms-goal" id="ms-goal" hidden>
        <div class="ms-goal-label">The work before you</div>
        <div class="ms-goal-text" id="ms-goal-text"></div>
      </div>
      <div class="ms-project" id="ms-project" hidden></div>
      <div class="ms-ledger" id="ms-ledger"></div>
    `;
    const prose = this.pageEl.querySelector('#ms-prose')!;
    for (const text of paras) {
      const el = document.createElement('p');
      el.textContent = text;
      prose.appendChild(el);
    }

    // Goal
    const goal = this.currentGoal();
    const goalBox = this.pageEl.querySelector<HTMLElement>('#ms-goal')!;
    if (goal) {
      goalBox.hidden = false;
      this.pageEl.querySelector('#ms-goal-text')!.textContent = `${goal.title} — ${goal.detail}`;
    }

    // Active project block
    this.progressFill = null;
    this.progressPct = null;
    if (p) this.renderProjectBlock(p);

    this.renderScholarsRail();
    this.renderLedger();
  }

  // The Ledger: a half-width day-by-day treasury graph beside a monthly
  // reckoning (income / expenses / net / runway). Refreshed each day.
  private renderLedger() {
    const host = this.pageEl?.querySelector<HTMLElement>('#ms-ledger');
    if (!host) return;
    host.innerHTML = `<div class="ms-ledger-row">${this.ledgerGraphHTML()}${this.ledgerSummaryHTML()}</div>`;
  }

  // Left half — the treasury line. Drawn as a stretchy SVG area so it fills
  // its column at any width; shows gold flowing in and the monthly dips.
  private ledgerGraphHTML(): string {
    const hist = Game.state.treasuryHistory ?? [];
    if (hist.length < 2) {
      return `<div class="ms-ledger-col">
        <div class="ms-ledger-head">The Ledger, Day by Day</div>
        <div class="ms-ledger-empty">The ledger has yet to accrue — let the days turn.</div>
      </div>`;
    }
    const N = 120;
    const data = hist.slice(-N);
    const min = Math.min(...data);
    const max = Math.max(...data);
    const span = Math.max(1, max - min);
    const W = 600, H = 140, padX = 4, padY = 10;
    const n = data.length;
    const px = (i: number) => padX + (i / (n - 1)) * (W - padX * 2);
    const py = (v: number) => padY + (1 - (v - min) / span) * (H - padY * 2);
    const line = data.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
    const area = `${padX.toFixed(1)},${(H - padY).toFixed(1)} ${line} ${(W - padX).toFixed(1)},${(H - padY).toFixed(1)}`;
    const cur = data[data.length - 1];
    const dir = cur >= data[0] ? 'up' : 'down';
    return `
      <div class="ms-ledger-col">
        <div class="ms-ledger-head">The Ledger, Day by Day</div>
        <svg class="ms-ledger-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Treasury over time">
          <polygon class="ms-ledger-area ${dir}" points="${area}" />
          <polyline class="ms-ledger-line ${dir}" points="${line}" />
        </svg>
        <div class="ms-ledger-foot">
          <span>last ${data.length} day${data.length === 1 ? '' : 's'}</span>
          <span>low ${min} · high ${max} · now <strong>${cur}</strong> gold</span>
        </div>
      </div>
    `;
  }

  // Right half — this month's flow, the figures behind the curve.
  private ledgerSummaryHTML(): string {
    const ec = Game.economy;
    const stipends = ec.monthlyStipendsIncome();
    const backlist = Math.round(ec.monthlyBacklistIncome());
    const alms = ec.expectedMonthlyDonation();
    const income = stipends + backlist + alms;
    const salaries = ec.monthlySalaries();
    const upkeep = ec.monthlyFacilityUpkeep();
    const ops = ec.monthlyOperationalCost();
    const expenses = salaries + upkeep + ops;
    const net = income - expenses;
    const runway = ec.runwayMonths();
    const runwayLabel = runway === Infinity ? 'indefinite' : `~${runway} mo`;
    const netSign = net >= 0 ? '+' : '−';
    const netCls = net >= 0 ? 'ms-led-pos' : 'ms-led-neg';
    return `
      <div class="ms-ledger-col ms-ledger-summary">
        <div class="ms-ledger-head">Monthly Reckoning</div>
        <div class="ms-led-row"><span>Income</span><span class="ms-led-pos">+${income}</span></div>
        <div class="ms-led-sub">patrons ${stipends} · backlist ${backlist} · alms ${alms}</div>
        <div class="ms-led-row"><span>Expenses</span><span class="ms-led-neg">−${expenses}</span></div>
        <div class="ms-led-sub">salaries ${salaries} · upkeep ${upkeep} · ops ${ops}</div>
        <div class="ms-led-row ms-led-row-total"><span>Net / month</span><span class="${netCls}">${netSign}${Math.abs(net)}</span></div>
        <div class="ms-led-row"><span>Runway</span><span>${runwayLabel}</span></div>
      </div>
    `;
  }

  // The right-rail scholar roster: portrait, satisfaction + stress bars, and a
  // concrete suggestion for improving each one. Clicking opens the full panel.
  private renderScholarsRail() {
    if (!this.scholarsEl) return;
    const scholars = Game.state.scholars;
    if (scholars.length === 0) {
      this.scholarsEl.innerHTML = `<div class="ms-sch-empty">The halls stand empty. Recruit new scholars from the Scholars panel below.</div>`;
      return;
    }
    this.scholarsEl.innerHTML = scholars.map(s => this.scholarRowHTML(s)).join('');
    // Rest/wake buttons act in place; stop the click from opening the panel.
    this.scholarsEl.querySelectorAll<HTMLButtonElement>('.ms-sch-rest').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        Audio.playSfx('ui_click');
        this.toggleRest(btn.dataset.restId!);
      });
    });
    this.scholarsEl.querySelectorAll<HTMLElement>('.ms-sch').forEach(card => {
      card.addEventListener('click', () => { Audio.playSfx('ui_click'); this.scholarPanel.show(); });
    });
  }

  // Send an idle scholar to rest, or wake a resting one — same rules as the
  // Scholars panel, so the two stay consistent.
  private toggleRest(scholarId: string) {
    const sc = Game.state.scholars.find(s => s.id === scholarId);
    if (!sc || (!sc.isAvailable && !sc.isResting)) return;
    if (sc.isResting) {
      sc.isResting = false;
      sc.isAvailable = true;
      Events.emit(GameEvents.SCHOLAR_REST_ENDED, { scholarId });
    } else {
      sc.isResting = true;
      sc.isAvailable = false;
      // A break eases their restlessness right away.
      sc.restlessness = Math.max(0, (sc.restlessness ?? 0) - 3);
      sc.restlessFlagged = false;
      Events.emit(GameEvents.SCHOLAR_REST_STARTED, { scholarId });
    }
    this.renderScholarsRail();
  }

  private scholarRowHTML(s: Scholar): string {
    const morale = s.morale ?? 0.5;
    const stress = s.stress ?? 0;
    const rested = 1 - (s.exhaustion ?? 0);
    const status = s.isResting ? 'Resting' : !s.isAvailable ? 'At work' : s.restlessFlagged ? 'Restless' : 'Idle';
    const statusCls = s.isResting ? 'rest' : !s.isAvailable ? 'work' : s.restlessFlagged ? 'restless' : 'idle';
    // Rest/wake is offered only when the scholar isn't locked on a project.
    const canToggle = s.isAvailable || s.isResting;
    const restBtn = canToggle
      ? `<button class="ms-sch-rest${s.isResting ? ' wake' : ''}" data-rest-id="${s.id}" title="${s.isResting ? 'Wake them' : 'Send to rest'}">${s.isResting ? 'Wake' : 'Rest'}</button>`
      : '';
    const suggestion = scholarSuggestion(s);
    return `
      <div class="ms-sch" data-id="${s.id}" title="Open the Scholars panel">
        <div class="ms-sch-portrait">${scholarPortraitHTML(s)}</div>
        <div class="ms-sch-body">
          <div class="ms-sch-top">
            <span class="ms-sch-name">${firstName(s.name)}</span>
            <span class="ms-sch-status ms-sch-status-${statusCls}">${status}</span>
            ${restBtn}
          </div>
          ${this.statBarHTML('Satisfaction', morale, moodTone(morale))}
          ${this.statBarHTML('Stress', stress, stressTone(stress))}
          ${this.statBarHTML('Rested', rested, moodTone(rested))}
          <div class="ms-sch-suggest" title="${suggestion}">${suggestion}</div>
        </div>
      </div>
    `;
  }

  private statBarHTML(label: string, value: number, tone: 'good' | 'mid' | 'low'): string {
    const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
    return `
      <div class="ms-sch-bar-row">
        <span class="ms-sch-bar-label">${label}</span>
        <div class="ms-sch-bar"><div class="ms-sch-bar-fill tone-${tone}" style="width:${pct}%"></div></div>
      </div>
    `;
  }

  private renderProjectBlock(p: Project) {
    const box = this.pageEl.querySelector<HTMLElement>('#ms-project')!;
    const topic = TOPICS.find(t => t.id === p.topicId);
    const format = FORMATS.find(f => f.id === p.formatId);
    const stage = p.stages[p.stages.length - 1];
    const lead = stage ? Game.state.scholars.find(sc => sc.id === stage.leadScholarId) : undefined;

    let meta = '';
    if (lead && topic && stage) {
      const skill = lead.disciplines[topic.name] ?? 1;
      const synergy = topic.strongFormats.includes(p.formatId) ? 'strong fit'
        : topic.weakFormats.includes(p.formatId) ? 'weak fit' : 'neutral fit';
      const team = stage.assistantScholarIds.length;
      meta = `${firstName(lead.name)}${team > 0 ? ` +${team}` : ''} · ${topic.name} ${skill}/10 · ${synergy}`;
    }
    // Stage pips: finished stages carry a one-word quality verdict, the
    // current stage is highlighted, later stages are dim.
    const pips = STAGE_ORDER.map((k, i) => {
      if (i < p.currentStageIndex) {
        const mark = stageQualityMark(p.stages[i]?.qualitySlice ?? 0);
        return `<span class="ms-pip done">${STAGE_INFO[k].label} · <em>${mark}</em></span>`;
      }
      const cls = i === p.currentStageIndex ? 'active' : '';
      return `<span class="ms-pip ${cls}">${STAGE_INFO[k].label}</span>`;
    }).join('<span class="ms-pip-sep">·</span>');

    box.hidden = false;
    box.innerHTML = `
      <div class="ms-project-title">${format?.name ?? 'Work'} on ${topic?.name ?? '—'}</div>
      <div class="ms-project-meta">${meta} · Stage ${p.currentStageIndex + 1} of ${STAGE_ORDER.length}</div>
      <div class="ms-outlook" id="ms-outlook"></div>
      <div class="ms-progress" title="How far through this work is"><div class="ms-progress-fill" id="ms-pfill"></div><div class="ms-progress-pct" id="ms-ppct">0%</div></div>
      <div class="ms-gauge" id="ms-gauge"></div>
      <div class="ms-project-foot">
        <div class="ms-stage-pips">${pips}</div>
        <button class="ms-link" id="ms-cancel">Abandon this work</button>
      </div>
    `;
    this.progressFill = box.querySelector('#ms-pfill');
    this.progressPct = box.querySelector('#ms-ppct');
    this.outlookEl = box.querySelector('#ms-outlook');
    this.gaugeEl = box.querySelector('#ms-gauge');
    box.querySelector('#ms-cancel')!.addEventListener('click', () => this.requestCancel());
    this.updateProgress(p.progress);
    this.refreshOutlook();
    this.refreshGauge();
  }

  // Redraw the live stage gauge — the work taking shape, axis by axis.
  private refreshGauge() {
    if (!this.gaugeEl) return;
    const p = Game.state.activeProject;
    const g = p ? stageGauge(p) : null;
    if (!g) { this.gaugeEl.innerHTML = ''; return; }
    this.gaugeEl.innerHTML = `
      <div class="ms-gauge-head">${g.stageLabel} — taking shape</div>
      ${g.axes.map(a => `
        <div class="ms-gauge-row" title="${a.name}">
          <span class="ms-gauge-name">${a.name}</span>
          <div class="ms-gauge-bar"><div class="ms-gauge-fill" style="width:${a.pct}%"></div></div>
          <span class="ms-gauge-val">${a.value}</span>
        </div>
      `).join('')}
    `;
  }

  private updateProgress(progress: number) {
    if (this.progressFill) this.progressFill.style.width = `${Math.min(100, progress * 100)}%`;
    if (this.progressPct) this.progressPct.textContent = `${Math.floor(progress * 100)}%`;
  }

  // The live "how is it going" read for the current stage. Refreshed each day
  // since it tracks the lead's shifting morale/stress/energy.
  private refreshOutlook() {
    if (!this.outlookEl) return;
    const p = Game.state.activeProject;
    const o = p ? projectOutlook(p) : null;
    if (!o) { this.outlookEl.textContent = ''; this.outlookEl.className = 'ms-outlook'; return; }
    this.outlookEl.className = `ms-outlook tone-${o.tone}`;
    this.outlookEl.innerHTML = `<span class="ms-outlook-label">Outlook · ${o.label}</span> — ${o.reason}.`;
  }

  private andList(items: string[]): string {
    if (items.length <= 1) return items[0] ?? '';
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
  }

  private currentGoal(): { title: string; detail: string } | null {
    const s = Game.state;
    if (s.completedWorks.length < 1) return { title: 'Release your first work', detail: 'Begin a New Work and guide it through all three stages.' };
    if (s.scholars.length < 3) return { title: 'Grow the roster', detail: 'Recruit from the Scholars panel — candidates take a month to arrive.' };
    if (s.prestige < 50) return { title: 'Reach 50 prestige', detail: `Quality works build renown (now ${s.prestige}). Patrons notice at 50.` };
    if (s.tier < 2) return { title: 'Become an Academy', detail: 'Hold 300 gold and six scholars. New zones will unlock.' };
    if (s.departments.length === 0) return { title: 'Found a department', detail: 'Three scholars sharing a discipline can work under a head.' };
    if (s.tier < 3) return { title: 'Become a University', detail: `Prestige 200 (now ${s.prestige}), 800 gold, twelve scholars.` };
    return null;
  }

  // ── Chronicle & toasts ─────────────────────────────────────────────

  private appendChronicle(text: string, tone: Tone = 'neutral') {
    Audio.playSfx('page_turn', { volume: 0.3 });
    const { year, month, d } = calendar(Game.state.day);
    const entry = document.createElement('div');
    entry.className = `ms-entry tone-${tone}`;
    const date = document.createElement('div');
    date.className = 'ms-entry-date';
    date.textContent = `Anno ${toRoman(year)} · M${month} D${d}`;
    const body = document.createElement('div');
    body.className = 'ms-entry-text';
    body.textContent = text;
    entry.append(date, body);
    this.feedEl.appendChild(entry);
    // Cap history.
    while (this.feedEl.childElementCount > 200) this.feedEl.firstElementChild!.remove();
    this.feedEl.scrollTop = this.feedEl.scrollHeight;
  }

  private showToast(text: string, tone: Tone = 'neutral', dwellMs = 2600) {
    Audio.playSfx('page_turn', { volume: 0.5 });
    const tray = document.getElementById('ms-toasts');
    if (!tray) return;
    const t = document.createElement('div');
    t.className = `ms-toast tone-${tone}`;
    t.textContent = text;
    tray.appendChild(t);
    setTimeout(() => {
      t.classList.add('fade');
      setTimeout(() => t.remove(), 500);
    }, dwellMs);
  }

  private fireMilestone(key: MilestoneKey, text: string) {
    if (!Game.state.milestoneFlags) Game.state.milestoneFlags = {};
    if (Game.state.milestoneFlags[key]) return;
    Game.state.milestoneFlags[key] = true;
    this.appendChronicle(`★ ${text}`, 'grand');
    Audio.playSfx('ui_select', { volume: 0.7 });
  }

  // ── Time controls ──────────────────────────────────────────────────

  private setSpeed(speed: 'paused' | 'normal' | 'fast') {
    Game.time.setSpeed(speed);
    this.updateClock();
  }

  private updateClock() {
    const speed = Game.time.speed;
    this.el?.querySelectorAll<HTMLElement>('.ms-clock-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.speed === speed);
    });
    this.pausedHintEl.style.visibility = speed === 'paused' ? 'visible' : 'hidden';
  }

  private isBlocked(): boolean {
    // A panel or modal is open if anything is mounted in the overlay layer.
    return (document.getElementById('ui-layer')?.childElementCount ?? 0) > 0;
  }

  private handleKey(e: KeyboardEvent) {
    const tag = (document.activeElement?.tagName ?? '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    if (this.isBlocked()) return;
    if (e.code === 'Space') { e.preventDefault(); this.setSpeed(Game.time.speed === 'paused' ? 'normal' : 'paused'); }
    else if (e.key === '1') this.setSpeed('normal');
    else if (e.key === '2') this.setSpeed('fast');
  }

  // ── Project flow ───────────────────────────────────────────────────

  private canStartProject(): boolean {
    return !Game.state.activeProject && Game.state.scholars.some(s => s.isAvailable);
  }

  private onNewWork() {
    if (!this.canStartProject()) {
      this.showToast(Game.state.activeProject ? 'A work is already underway.' : 'No scholars are free to begin a work.', 'loss');
      return;
    }
    const prevSpeed = Game.time.speed;
    this.setSpeed('paused');
    this.projectPanel.show();
    // Resume previous speed if the panel closes without a project starting.
    const poll = setInterval(() => {
      if (this.projectPanel.isOpen()) return;
      clearInterval(poll);
      if (!Game.state.activeProject) this.setSpeed(prevSpeed);
    }, 120);
  }

  private requestCancel() {
    const project = Game.state.activeProject;
    if (!project || this.eventModal.isOpen()) return;
    const prevSpeed = Game.time.speed;
    this.setSpeed('paused');
    const lead = Game.state.scholars.find(s => s.id === project.leadScholarId);
    const pct = Math.round(project.progress * 100);
    this.eventModal.confirm({
      heading: 'Abandon this work?',
      text: `${lead ? firstName(lead.name) : 'The scholar'} is ${pct}% of the way through. All progress will be lost.`,
      confirmLabel: 'Abandon',
      cancelLabel: 'Keep working',
      onConfirm: () => {
        const involved = new Set<string>([project.leadScholarId, ...project.assistantScholarIds]);
        for (const st of project.stages) {
          involved.add(st.leadScholarId);
          for (const aid of st.assistantScholarIds) involved.add(aid);
        }
        for (const id of involved) {
          const sch = Game.state.scholars.find(x => x.id === id);
          if (sch) sch.isAvailable = true;
        }
        Game.state.activeProject = undefined;
        Events.emit(GameEvents.PROJECT_CANCELLED, { project, refund: 0 });
        this.renderPage();
        this.setSpeed(prevSpeed);
      },
      onCancel: () => this.setSpeed(prevSpeed),
    });
  }

  private showSalaryModal(candidateIdx: number) {
    const candidate = Game.state.currentCandidates[candidateIdx];
    if (!candidate) return;
    const asking = candidate.salary;
    const above = Math.ceil(asking * 1.10);
    const below = Math.max(1, Math.floor(asking * 0.90));
    this.eventModal.choice<'asking' | 'above' | 'below'>({
      heading: `Negotiate with ${candidate.name}`,
      text: `${firstName(candidate.name)} asks ${asking} gold per month. How will you pay them?`,
      options: [
        { label: `Pay above asking · ${above}/mo`, value: 'above', blurb: 'They arrive grateful. Higher morale, lower restlessness.' },
        { label: `Pay the asking salary · ${asking}/mo`, value: 'asking', blurb: 'A fair deal. They arrive on neutral terms.' },
        { label: `Pay below asking · ${below}/mo`, value: 'below', blurb: 'They take less, but resent it. Lower morale, faster restlessness.' },
      ],
      onPick: (deal) => {
        if (!this.scholarPanel.completeHire(candidateIdx, deal)) {
          this.scholarPanel.hide(); this.scholarPanel.show();
        }
      },
    });
  }

  // ── Modal builders (ported from CampusScene) ───────────────────────

  private showMidEvent(scholarName: string, text: string, choice?: MidEventChoice) {
    this.setSpeed('paused');
    if (choice) {
      this.eventModal.choice<'push' | 'rest' | 'ignore'>({
        heading: scholarName, text,
        options: choice.options.map(o => ({ label: o.label, value: o.effect })),
        onPick: (effect) => { Game.project.applyMidEventChoice(effect); this.setSpeed('normal'); },
      });
    } else {
      this.eventModal.show(scholarName, text, () => this.setSpeed('normal'));
    }
  }

  private showStageGate(project: Project, nextStageKey: StageKey) {
    this.setSpeed('paused');
    this.stageGateModal.show(project, nextStageKey, (scholarId, framing, emphasis) => {
      Game.project.beginNextStage(scholarId, framing, emphasis);
    });
  }

  private onProjectCompleted(work: Work) {
    this.updateProgress(1);
    this.setSpeed('paused');
    Audio.playSfx('project_complete');
    this.releaseModal.show(work, () => {
      Events.emit(GameEvents.WORK_RELEASED, { work });
      const pre = work.salesState?.preorder ?? 0;
      this.appendChronicle(
        work.salesState
          ? `"${work.title}" is released — ${work.qualityDescriptor}. Preorders bring +${pre} gold; it now sells over the season.`
          : `"${work.title}" is delivered — ${work.qualityDescriptor}. +${work.revenue} gold.`,
        'gain');
      this.renderPrestige();
      this.renderPage();
    });
    this.fireMilestone('firstWorkReleased',
      'Your first work is released. It sells over 90 days, critics weigh in, and your renown begins to build.');
  }

  private showPoachAttempt(p: EventPayloads[typeof GameEvents.POACH_ATTEMPT]) {
    this.setSpeed('paused');
    const canAfford = Game.state.treasury >= p.counterOfferCost;
    this.eventModal.choice<'counter' | 'persuade' | 'release'>({
      heading: `${p.rivalName} has approached ${p.scholarName}`,
      text: `${p.rivalName} has made ${p.scholarName} an offer. They are weighing it. How does the institution respond?`,
      options: [
        { label: `Match the offer · ${p.counterOfferCost} gold`, value: 'counter',
          blurb: canAfford ? 'A bonus and a raise. They stay; morale rises.' : 'Insufficient treasury — they will leave if you choose this.' },
        { label: 'Speak to them, persuade them to stay', value: 'persuade', blurb: 'No cost; success depends on their morale.' },
        { label: 'Let them go', value: 'release', blurb: `They join ${p.rivalName}.` },
      ],
      onPick: (choice) => {
        if (choice === 'counter') Game.world.applyCounterOffer(p.rivalId, p.scholarId, p.counterOfferCost);
        else if (choice === 'persuade') {
          if (Game.world.applyPersuade(p.rivalId, p.scholarId)) this.showToast(`${firstName(p.scholarName)} agrees to stay`, 'gain');
        } else Game.world.applyLetGo(p.rivalId, p.scholarId);
      },
    });
  }

  private showDepartmentProposal(p: EventPayloads[typeof GameEvents.DEPARTMENT_PROJECT_PROPOSED]) {
    this.setSpeed('paused');
    this.eventModal.confirm({
      heading: `${p.departmentName} proposes a new work`,
      text: `${p.headName} proposes a ${p.formatName} on ${p.topicName}. They and a small team will see it through — unavailable for your own projects until it is done.`,
      confirmLabel: 'Approve the work', cancelLabel: 'Decline this proposal',
      onConfirm: () => Game.departments.acceptProposal(p.proposalId),
      onCancel: () => Game.departments.declineProposal(p.proposalId),
    });
  }

  private showDepartmentEscalation(p: EventPayloads[typeof GameEvents.DEPARTMENT_PROJECT_ESCALATED]) {
    this.setSpeed('paused');
    const cost = p.kind === 'missing_source' ? 60 : p.kind === 'controversy' ? 80 : 40;
    this.eventModal.choice<'pay' | 'ignore'>({
      heading: `Trouble in ${p.departmentName}`, text: p.flavor,
      options: [
        { label: `Intervene · ${cost} gold`, value: 'pay', blurb: 'The institution steps in. The project resumes immediately.' },
        { label: 'Let them resolve it themselves', value: 'ignore', blurb: 'The project pauses up to 30 days; morale and progress suffer.' },
      ],
      onPick: (choice) => Game.departments.resolveEscalation(p.projectId, choice === 'pay'),
    });
  }

  private showFounderSuccession(p: EventPayloads[typeof GameEvents.FOUNDER_SUCCESSION]) {
    this.setSpeed('paused');
    if (!p.departmentId) {
      this.eventModal.show(`${p.founderName} departs`,
        'One of the founding scholars has chosen to step away from active work. Their hand shaped the institution; their absence will be felt. (+5 prestige)',
        () => {});
      return;
    }
    const dept = Game.state.departments.find(d => d.id === p.departmentId);
    if (!dept) return;
    const candidates = Game.state.scholars.filter(s => s.id !== p.founderId && s.primaryDiscipline === dept.discipline);
    if (candidates.length === 0) {
      this.eventModal.confirm({
        heading: `${p.founderName} departs`,
        text: `${p.founderName} has retired. ${dept.name} has no remaining members of the right discipline to lead. The department will be disbanded.`,
        confirmLabel: 'Disband', cancelLabel: 'Keep open (no head)',
        onConfirm: () => Game.institution.disbandDepartment(dept.id, 'No successor could be found.'),
        onCancel: () => {},
      });
      return;
    }
    this.eventModal.choice<string>({
      heading: `${p.founderName} departs — name a successor`,
      text: `${p.founderName} has retired. ${dept.name} needs a new head. Choose a scholar to carry their work forward, or close the department.`,
      options: [
        ...candidates.map(c => ({ label: c.name, value: c.id, blurb: `${dept.discipline} ${c.disciplines[dept.discipline] ?? 0}/10 · ${c.archetype}` })),
        { label: 'Disband the department', value: '__disband__', blurb: 'Their work was theirs alone.' },
      ],
      onPick: (choice) => {
        if (choice === '__disband__') {
          Game.institution.disbandDepartment(dept.id, `Following ${p.founderName}'s retirement, no successor was named.`);
        } else {
          dept.headScholarId = choice;
          dept.morale = Math.max(0.4, dept.morale - 0.1);
          this.appendChronicle(`${Game.state.scholars.find(s => s.id === choice)?.name ?? 'A new head'} now leads ${dept.name}.`);
        }
      },
    });
  }

  private showFactionPatronageOffer(p: EventPayloads[typeof GameEvents.FACTION_PATRONAGE_OFFERED]) {
    this.setSpeed('paused');
    this.eventModal.confirm({
      heading: `${p.factionName} extends patronage`,
      text: `${p.flavor}\n\nMonthly stipend: ${p.stipend} gold.`,
      confirmLabel: 'Accept their patronage', cancelLabel: 'Decline politely',
      onConfirm: () => {
        const patron = new IdeologySystem().buildFactionPatron(p.factionId);
        Game.state.majorPatrons.push(patron);
        Events.emit(GameEvents.MAJOR_PATRON_ACCEPTED, { patronId: patron.id, patronName: patron.name });
      },
      onCancel: () => {
        const f = Game.state.ideology.factions[p.factionId];
        Game.state.ideology.factions[p.factionId] = Math.max(0, f - 20);
      },
    });
  }

  private showPatronOfferModal(patron: EventPayloads[typeof GameEvents.MAJOR_PATRON_OFFERED]['patron'], arrivalFlavor: string) {
    this.setSpeed('paused');
    const expects = patron.expectsDiscipline ? `\n\nThey expect periodic works in ${patron.expectsDiscipline}.` : '';
    this.eventModal.confirm({
      heading: `${patron.name} extends an offer`,
      text: `${arrivalFlavor}\n\nMonthly stipend: ${patron.stipend} gold.${expects}`,
      confirmLabel: 'Accept their patronage', cancelLabel: 'Decline politely',
      onConfirm: () => Game.economy.acceptMajorPatron(patron),
      onCancel: () => Game.economy.declineMajorPatron(patron),
    });
  }

  private showCommissionOfferModal(commission: EventPayloads[typeof GameEvents.MINOR_COMMISSION_OFFERED]['commission']) {
    this.setSpeed('paused');
    const topic = TOPICS.find(t => t.id === commission.topicId);
    const format = FORMATS.find(f => f.id === commission.formatId);
    this.eventModal.confirm({
      heading: `A commission from ${commission.patronName}`,
      text: `${commission.patronName} ${commission.flavor}: a ${format?.name ?? 'work'} on ${topic?.name ?? 'a subject'}. They offer ${commission.payment} gold on delivery.`,
      confirmLabel: 'Accept commission', cancelLabel: 'Decline',
      onConfirm: () => Game.economy.acceptMinorCommission(),
      onCancel: () => Game.economy.declineMinorCommission(),
    });
  }

  private showGameOver(state: EventPayloads[typeof GameEvents.GAME_OVER]) {
    this.setSpeed('paused');
    const reasonLine = state.reason === 'bankruptcy'
      ? 'The treasury is empty. The institution can no longer pay its way.'
      : 'No scholars remain. The institution has emptied of those who made it.';
    const years = Math.floor((state.day - 1) / 360) + 1;
    const summary =
      `${reasonLine}\n\n${state.institutionName} stood for ${years} year${years === 1 ? '' : 's'}.\n` +
      `Prestige at its end: ${state.finalPrestige}.\nWorks released: ${state.worksReleased}.\n` +
      `Scholars who passed through its halls: ${state.scholarsPassedThrough}.\n\nWhat you built remains in the records.`;
    this.eventModal.show('The End of an Era', summary, () => {
      Game.reset();
      this.opts.onExit();
    });
  }

  private requestQuit() {
    if (this.eventModal.isOpen()) return;
    const prevSpeed = Game.time.speed;
    this.setSpeed('paused');
    this.eventModal.confirm({
      heading: 'Set down the chronicle?',
      text: 'Return to the title screen. Your progress is saved.',
      confirmLabel: 'Return to title', cancelLabel: 'Keep playing',
      onConfirm: () => this.opts.onExit(),
      onCancel: () => this.setSpeed(prevSpeed),
    });
  }

  // ── Event wiring ───────────────────────────────────────────────────

  private on<E extends keyof EventPayloads>(event: E, cb: (p: EventPayloads[E]) => void) {
    Events.on(event, cb);
    this.offFns.push(() => Events.off(event, cb));
  }

  private subscribe() {
    const G = GameEvents;
    this.on(G.DAY_PASSED, () => { this.renderHeader(); this.renderScholarsRail(); this.renderLedger(); });
    this.on(G.TREASURY_CHANGED, () => this.renderTreasury());
    this.on(G.IDEOLOGY_DRIFT, () => this.renderStance());

    this.on(G.MONTH_LEDGER, (l) => {
      const income = l.backlist + l.stipends + l.donations;
      const breakdown: string[] = [];
      if (l.stipends > 0) breakdown.push(`${l.stipends} from patrons`);
      if (l.donations > 0) breakdown.push(`${l.donations} from gifts`);
      const sign = l.net >= 0 ? '+' : '−';
      this.appendChronicle(
        `The ledger for month ${l.month}: income ${income} gold` +
        (breakdown.length ? ` (${breakdown.join(', ')})` : '') +
        `, expenses ${l.salaries + l.upkeep + l.ops} gold. Net ${sign}${Math.abs(l.net)} — ${l.treasury} gold remains.`,
        l.net >= 0 ? 'gain' : 'loss');
      this.renderPage();
    });

    // Project lifecycle
    this.on(G.PROJECT_STARTED, () => {
      Audio.playSfx('project_start');
      this.fireMilestone('firstProjectStarted',
        'Your first work begins. Each stage — Research, Drafting, Refinement — lets you pick a new lead and emphasis.');
      this.renderPage();
      this.setSpeed('normal');
    });
    this.on(G.PROJECT_PROGRESS, ({ progress }) => { this.updateProgress(progress); this.refreshOutlook(); this.refreshGauge(); });
    this.on(G.MID_PROJECT_EVENT, ({ scholarName, text, choice }) => this.showMidEvent(scholarName, text, choice));
    this.on(G.PROJECT_STAGE_GATE, ({ project, nextStageKey }) => this.showStageGate(project, nextStageKey));
    this.on(G.PROJECT_STAGE_STARTED, () => { this.renderPage(); this.setSpeed('normal'); });
    this.on(G.PROJECT_COMPLETED, ({ work }) => this.onProjectCompleted(work));
    this.on(G.PROJECT_CANCELLED, () => this.renderPage());

    // Scholars
    this.on(G.SCHOLAR_SKILL_UP, ({ scholarId, topic, newLevel }) => {
      const sc = Game.state.scholars.find(s => s.id === scholarId);
      if (sc) this.showToast(`${firstName(sc.name)} · ${topic} improved to ${newLevel}`, 'gain');
    });
    this.on(G.SCHOLAR_HIRED, () => {
      Audio.playSfx('coin_gain');
      this.fireMilestone('firstHire', 'A new scholar joins the institution. Assign them to a work and watch their discipline strengthen.');
      this.renderPage();
    });
    this.on(G.SCHOLAR_TRAIT_REVEALED, ({ flavor }) => this.appendChronicle(flavor));
    this.on(G.SCHOLAR_TALENT_REVEALED, ({ flavor }) => this.appendChronicle(flavor));
    this.on(G.SCHOLAR_RESTLESS, ({ scholarId, reason }) => {
      const sc = Game.state.scholars.find(s => s.id === scholarId);
      if (sc) this.showToast(`${firstName(sc.name)} grows restless · ${reason}`, 'loss', 3600);
      this.renderScholarsRail();
    });
    this.on(G.SCHOLAR_REST_STARTED, () => this.renderScholarsRail());
    this.on(G.SCHOLAR_REST_ENDED, () => this.renderScholarsRail());
    this.on(G.SCHOLAR_LEFT, ({ scholarName, reason }) => {
      this.setSpeed('paused');
      this.eventModal.show('A scholar departs', `${scholarName} has left the institution. ${reason}`, () => this.renderPage());
    });
    this.on(G.SCHOLAR_AMBITION_FULFILLED, ({ scholarName, ambition }) => this.appendChronicle(`${scholarName}'s ambition is fulfilled — ${ambition}.`, 'grand'));
    this.on(G.SCHOLAR_FEAR_TRIGGERED, ({ scholarName, fear }) => this.appendChronicle(`${scholarName} confronts a quiet dread: ${fear}.`));
    this.on(G.SCHOLAR_RETIRED, ({ scholarName, age }) => { this.appendChronicle(`${scholarName} has retired from active scholarship, at age ${age}. Their works remain.`); this.renderPage(); });
    this.on(G.SCHOLAR_POACHED, ({ scholarName }) => { this.appendChronicle(`${scholarName} has been lured away to a rival.`, 'loss'); this.renderPage(); });
    this.on(G.POACH_ATTEMPT, (p) => this.showPoachAttempt(p));

    // Institution
    this.on(G.TIER_PROMOTED, ({ tierName: tn }) => { this.appendChronicle(`Word has spread. The institution is now known as a${tn === 'Academy' ? 'n' : ''} ${tn}.`, 'grand'); this.renderHeader(); this.renderPage(); });
    this.on(G.ZONE_UNLOCKED, ({ zoneName }) => { this.showToast(`Zone unlocked: ${zoneName}`, 'gain'); this.fireMilestone('firstZoneUnlocked', 'A new zone opens. Build facilities there from the Institution panel — each gives a small permanent bonus.'); });
    this.on(G.DEPARTMENT_FOUNDED, ({ name, headScholarName }) => this.appendChronicle(`${name} is founded under ${headScholarName}. Their work begins.`, 'grand'));
    this.on(G.DEPARTMENT_DISBANDED, ({ name, reason }) => this.appendChronicle(`${name} disbands. ${reason}`, 'loss'));
    this.on(G.DEPARTMENT_PROJECT_PROPOSED, (p) => this.showDepartmentProposal(p));
    this.on(G.DEPARTMENT_PROJECT_ESCALATED, (p) => this.showDepartmentEscalation(p));
    this.on(G.DEPARTMENT_PROJECT_COMPLETED, ({ departmentName, work }) => this.appendChronicle(`${departmentName} completes its work: "${work.title}".`, 'gain'));
    this.on(G.FOUNDER_SUCCESSION, (p) => this.showFounderSuccession(p));

    // Economy
    this.on(G.TREASURY_LOW, ({ tier }) => this.showToast(tier === 'critical'
      ? 'The coffers are nearly empty. Next month\'s salaries may not be paid.'
      : 'The treasury is running thin. Consider releasing a work or trimming costs.', 'loss', 3600));
    this.on(G.BANKRUPTCY, ({ amount, monthsNegative }) => {
      this.setSpeed('paused');
      this.eventModal.show('The Institution Falters',
        `For ${monthsNegative} months the treasury has held no coin (${amount} gold). The scholars whisper. Patrons withdraw. The work continues — on borrowed time.`, () => {});
    });
    this.on(G.PATRON_GRANTED, ({ amount, flavor }) => { this.setSpeed('paused'); this.eventModal.show('A Patron Arrives', `${flavor}\n\n+ ${amount} gold to the treasury.`, () => {}); });
    this.on(G.MAJOR_PATRON_OFFERED, ({ patron, arrivalFlavor }) => this.showPatronOfferModal(patron, arrivalFlavor));
    this.on(G.MAJOR_PATRON_ACCEPTED, ({ patronName }) => this.appendChronicle(`${patronName} is now a patron of the institution. Their monthly stipend has begun.`, 'gain'));
    this.on(G.MAJOR_PATRON_WITHDREW, ({ patronName, reason }) => this.appendChronicle(`${patronName} has withdrawn their patronage. ${reason}`, 'loss'));
    this.on(G.MINOR_COMMISSION_OFFERED, ({ commission }) => this.showCommissionOfferModal(commission));
    this.on(G.MINOR_COMMISSION_ACCEPTED, ({ patronName }) => this.appendChronicle(`A commission from ${patronName} is accepted. Deliver a matching work to be paid.`));
    this.on(G.MINOR_COMMISSION_COMPLETED, ({ patronName, payment }) => this.showToast(`Commission delivered to ${patronName} · +${payment} gold`, 'gain', 3200));
    this.on(G.GRANT_CLAIMED, ({ amount, flavor }) => this.appendChronicle(`${flavor}\n\n+${amount} gold to the treasury.`, 'gain'));
    this.on(G.DONATION_RECEIVED, ({ amount, flavor }) => this.appendChronicle(`${flavor}\n\n+${amount} gold to the treasury.`, 'gain'));
    this.on(G.WORK_RIGHTS_SOLD, ({ workTitle, amount }) => this.showToast(`Rights to "${workTitle}" sold · +${amount} gold`, 'gain', 3200));
    this.on(G.PATRON_APPEAL_USED, ({ amount }) => this.appendChronicle(`The patrons answer an emergency appeal. +${amount} gold. Their patience, however, is thinner now.`));
    this.on(G.FACTION_PATRONAGE_OFFERED, (p) => this.showFactionPatronageOffer(p));

    // Ideology & factions
    this.on(G.FACTION_FAVOR_OFFERED, ({ factionName }) => this.appendChronicle(`${factionName} has begun to favor the institution. Their support may follow.`));
    this.on(G.FACTION_DENOUNCED, ({ factionName }) => this.appendChronicle(`${factionName} has denounced the institution. Their hostility is now open.`, 'loss'));
    this.on(G.WORK_SUPPRESSED, ({ workTitle, factionName, revenueLost }) => this.appendChronicle(`${factionName} has moved against "${workTitle}". Some ${revenueLost} gold of sales is lost to suppression.`, 'loss'));

    // World
    this.on(G.RIVAL_RELEASED, ({ rivalName, topicName, formatName }) => this.appendChronicle(`${rivalName} releases a ${formatName} on ${topicName}.`));
    this.on(G.WORLD_EVENT_STARTED, ({ eventName, flavor }) => this.appendChronicle(`${eventName}. ${flavor}`));
    this.on(G.WORLD_EVENT_ENDED, ({ eventName }) => this.showToast(`${eventName} has passed.`));
    this.on(G.REPRINT_STARTED, ({ workTitle, projectedRevenue }) => this.showToast(`A reprint of "${workTitle}" begins · ~${projectedRevenue} gold projected`));
    this.on(G.REPRINT_COMPLETED, ({ workTitle, revenue }) => this.showToast(`Reprint of "${workTitle}" complete · +${revenue} gold`, 'gain'));
    this.on(G.WORK_SALE_TICK, () => this.fireMilestone('firstSaleEarned', 'Your first work begins to sell. Coin trickles in over its sales window.'));
    this.on(G.WORK_SALES_FINISHED, ({ workTitle, earnedTotal, projectedTotal }) => {
      const ratio = projectedTotal > 0 ? earnedTotal / projectedTotal : 1;
      const verdict = ratio >= 1.05 ? 'outperforming expectations' : ratio >= 0.85 ? 'meeting expectations' : 'falling short of expectations';
      this.appendChronicle(`"${workTitle}" finishes its sales: ${earnedTotal} gold earned, ${verdict}.`, ratio >= 0.85 ? 'gain' : 'loss');
    });
    this.on(G.CHEMISTRY_BAND_CHANGED, ({ scholarA, scholarB, nextBand, direction }) => {
      this.appendChronicle(`The working bond between ${scholarFirstName(scholarA)} and ${scholarFirstName(scholarB)} ${direction === 'up' ? 'deepens' : 'frays'} — now ${nextBand}.`, direction === 'up' ? 'gain' : 'loss');
    });

    this.on(G.GAME_OVER, (state) => this.showGameOver(state));
  }
}
