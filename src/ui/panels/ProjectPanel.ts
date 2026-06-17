import './project-panel.css';
import { TOPICS } from '../../data/topics';
import { FORMATS } from '../../data/formats';
import { Game } from '../../game/GameManager';
import { Events, GameEvents } from '../../game/EventBus';
import { STAGE_ORDER, PRIORITY_POOL } from '../../models/Project';
import type { Scholar } from '../../models/Scholar';
import type { StageRecord } from '../../models/Project';
import { STAGE_AXES, AXIS_HINTS, EMPHASIS_POINTS } from '../../data/stageEmphasis';

// Grouped by the production stage each priority lifts (see STAGE_INFO in
// Project.ts) so the pip cards read top-to-bottom in stage order.
const PRIORITY_KEYS = [
  'Accuracy', 'Innovation', 'Preservation', // Research
  'Beauty', 'Accessibility', 'Spirituality', // Drafting
  'Propaganda',                              // Refinement
] as const;

// Per-priority flavor shown on each pip card: which stage's quality it lifts
// and the ideological lean each point imparts. Kept in sync with STAGE_INFO
// (Project.ts) and PRIORITY_IMPRINT (data/ideologyContributions.ts).
const PRIORITY_HINTS: Record<string, { stage: string; lean: string }> = {
  Accuracy:      { stage: 'Research',   lean: 'empirical' },
  Innovation:    { stage: 'Research',   lean: 'progressive' },
  Preservation:  { stage: 'Research',   lean: 'guards the old ways' },
  Beauty:        { stage: 'Drafting',   lean: 'classical' },
  Accessibility: { stage: 'Drafting',   lean: 'for the people' },
  Spirituality:  { stage: 'Drafting',   lean: 'devout' },
  Propaganda:    { stage: 'Refinement', lean: 'serves the order' },
};

const POOL = PRIORITY_POOL;
const PRIORITY_MAX = 5; // most points allowed on a single priority
// Stage 1 auto-assigns every other available scholar as an assistant, so
// this cap is only a defensive guard for the data model.
export const MAX_ASSISTANTS = 7;

// Step 0 (mode pick) only shows when a commission is available; otherwise
// the flow starts at step 1 (topic). The three essential picks (topic, format,
// lead) come first so a work can be started in three choices; step 4 folds the
// two optional point-spends (priorities + research approach) into one screen
// that can be skipped entirely via "Begin Work" on the lead step.
type Step = 0 | 1 | 2 | 3 | 4;
const TOTAL_STEPS = 4;

const STEP_TITLES: Record<1 | 2 | 3 | 4, string> = {
  1: 'Choose a topic',
  2: 'Choose a format',
  3: 'Pick the lead',
  4: 'Refine · optional',
};

type WorkMode = 'original' | 'commission';

export class ProjectPanel {
  private el: HTMLElement | null = null;
  private step: Step = 1;
  private mode: WorkMode = 'original';
  private selectedScholarId: string | null = null;
  private selectedTopicId: string | null = null;
  private selectedFormatId: string | null = null;
  private priorities: Record<string, number> = {};
  // Per-stage emphasis for the FIRST stage (Research). Subsequent stages
  // get their own emphasis pick at the stage gate.
  private researchEmphasis: Record<string, number> = {};

  show() {
    if (this.el) return;
    // If an active commission exists, present the mode-pick prologue first.
    this.step = Game.state.activeCommission ? 0 : 1;
    this.mode = 'original';
    this.selectedScholarId = null;
    this.selectedTopicId = null;
    this.selectedFormatId = null;
    this.priorities = Object.fromEntries(PRIORITY_KEYS.map(k => [k, 0]));
    this.researchEmphasis = Object.fromEntries(STAGE_AXES.research.map(a => [a, 0]));

    this.el = document.createElement('div');
    this.el.className = 'project-panel-backdrop';
    this.el.innerHTML = this.shellHTML();
    document.getElementById('ui-layer')!.appendChild(this.el);

    this.bindShellEvents();
    this.renderStep();
  }

  hide() {
    this.el?.remove();
    this.el = null;
  }

  isOpen() { return this.el !== null; }

  // ── Shell ───────────────────────────────────────────────────────

  private shellHTML(): string {
    return `
      <div class="project-panel project-panel-stepped">
        <div class="panel-header">
          <h2 class="panel-title">Commission a New Work</h2>
          <button class="panel-close" id="pp-close" title="Close">✕</button>
        </div>
        <div class="pp-stepper" id="pp-stepper"></div>
        <div class="pp-step-body" id="pp-step-body"></div>
        <div class="pp-step-footer" id="pp-step-footer"></div>
      </div>
    `;
  }

  private bindShellEvents() {
    const el = this.el!;
    el.querySelector('#pp-close')!.addEventListener('click', () => this.hide());
    el.addEventListener('click', e => {
      if (e.target === el) this.hide();
    });
  }

  // ── Step rendering ──────────────────────────────────────────────

  private renderStep() {
    const el = this.el!;
    const stepper = el.querySelector<HTMLElement>('#pp-stepper')!;
    const body    = el.querySelector<HTMLElement>('#pp-step-body')!;
    const footer  = el.querySelector<HTMLElement>('#pp-step-footer')!;

    stepper.innerHTML = this.stepperHTML();
    body.innerHTML    = this.stepBodyHTML();
    footer.innerHTML  = this.stepFooterHTML();

    this.bindStepEvents();
  }

  private stepperHTML(): string {
    // Step 0 (mode pick) is a prologue; no dot for it. The numbered dots
    // always show 1..4 of the work-creation flow.
    if (this.step === 0) {
      return `<div class="pp-step-prologue-label">Choose how this work begins</div>`;
    }
    const dots: string[] = [];
    for (let i = 1; i <= TOTAL_STEPS; i++) {
      const s = i as 1 | 2 | 3 | 4;
      const isCurrent = s === this.step;
      const isDone = s < this.step;
      const cls = isCurrent ? 'current' : isDone ? 'done' : 'pending';
      dots.push(`
        <div class="pp-step-dot ${cls}">
          <span class="pp-step-num">${i}</span>
          <span class="pp-step-label">${STEP_TITLES[s]}</span>
        </div>
      `);
    }
    return dots.join('<div class="pp-step-sep"></div>');
  }

  private stepBodyHTML(): string {
    switch (this.step) {
      case 0: return this.modeStepHTML();
      case 1: return this.topicStepHTML();
      case 2: return this.formatStepHTML();
      case 3: return this.leadStepHTML();
      case 4: return this.approachStepHTML();
    }
  }

  // ── Step 0: Original vs Commission ──────────────────────────────

  private modeStepHTML(): string {
    const commission = Game.state.activeCommission;
    if (!commission) return this.topicStepHTML(); // safety net

    const topic = TOPICS.find(t => t.id === commission.topicId);
    const format = FORMATS.find(f => f.id === commission.formatId);

    return `
      <div class="pp-step pp-step-mode">
        <p class="pp-step-hint">${commission.patronName} is waiting on a commissioned work. Take it on for a guaranteed payment, or pursue something of your own.</p>
        <div class="pp-mode-grid">
          <button class="pp-mode-card${this.mode === 'commission' ? ' selected' : ''}" data-mode="commission">
            <div class="pp-mode-title">Commission Work</div>
            <div class="pp-mode-flavor">${commission.patronName} has requested this work specifically.</div>
            <div class="pp-mode-spec">
              <div><span class="pp-mode-spec-label">Topic</span> <span class="pp-mode-spec-val">${topic?.name ?? '—'}</span></div>
              <div><span class="pp-mode-spec-label">Format</span> <span class="pp-mode-spec-val">${format?.name ?? '—'}</span></div>
              <div><span class="pp-mode-spec-label">Payment</span> <span class="pp-mode-spec-val pp-mode-payment">${commission.payment} gold guaranteed</span></div>
            </div>
            <div class="pp-mode-note">No public sales — the patron keeps the work. A small release bonus may still apply.</div>
          </button>
          <button class="pp-mode-card${this.mode === 'original' ? ' selected' : ''}" data-mode="original">
            <div class="pp-mode-title">Original Work</div>
            <div class="pp-mode-flavor">Free to choose your topic, format, and priorities.</div>
            <div class="pp-mode-spec">
              <div><span class="pp-mode-spec-label">Revenue</span> <span class="pp-mode-spec-val">Sells over 90 days</span></div>
              <div><span class="pp-mode-spec-label">Ceiling</span> <span class="pp-mode-spec-val">Higher, but uncertain</span></div>
            </div>
            <div class="pp-mode-note">Total earnings depend on the work's quality, synergy, and market conditions.</div>
          </button>
        </div>
      </div>
    `;
  }

  private stepFooterHTML(): string {
    const canNext = this.canAdvance();
    const backDisabled = this.previousStep() === null;
    const back = `<button class="pp-step-back" id="pp-back" ${backDisabled ? 'disabled' : ''}>Back</button>`;

    // On the lead step the work is fully specified — you can begin straight
    // away, or step into the optional Refine screen.
    if (this.step === 3) {
      return `
        ${back}
        <div class="pp-footer-actions">
          <button class="pp-step-refine" id="pp-refine" ${canNext ? '' : 'disabled'}>Refine ›</button>
          <button class="pp-step-next" id="pp-next" ${canNext ? '' : 'disabled'}>Begin Work</button>
        </div>
      `;
    }

    const primaryLabel = this.step === TOTAL_STEPS ? 'Begin Work' : 'Next';
    return `
      ${back}
      <button class="pp-step-next" id="pp-next" ${canNext ? '' : 'disabled'}>${primaryLabel}</button>
    `;
  }

  // ── Step 1: Topic ───────────────────────────────────────────────

  private topicStepHTML(): string {
    const suggestions = this.topicSuggestions();
    return `
      <div class="pp-step pp-step-topic">
        <p class="pp-step-hint">Every work begins with its subject. Choose the topic the institution will explore. <span class="pp-suggest-hint">★ Suggested topics match your current roster's strengths.</span></p>
        <div class="pp-tile-grid">
          ${TOPICS.map(t => {
            const sel = this.selectedTopicId === t.id ? ' selected' : '';
            const sug = suggestions.get(t.id);
            const badge = sug ? `<div class="pp-tile-badge pp-tile-badge-${sug.tier}">★ ${sug.label}</div>` : '';
            return `
              <button class="pp-tile${sel}" data-topic="${t.id}">
                ${badge}
                <div class="pp-tile-title">${t.name}</div>
                <div class="pp-tile-meta">${t.culturalWeight ? `${t.culturalWeight.replace('_', ' ')} cultural weight` : ''}</div>
                ${sug ? `<div class="pp-tile-suggest-detail">Best: ${sug.scholarName} · ${sug.score}/10</div>` : ''}
              </button>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  // Score each topic by the best available scholar's discipline rating for
  // it. Topics with at least a "Capable" lead (score >= 4) earn a badge.
  // Returns a map of topicId -> suggestion descriptor.
  private topicSuggestions(): Map<string, { tier: 'expert' | 'strong' | 'capable'; label: string; scholarName: string; score: number }> {
    const map = new Map<string, { tier: 'expert' | 'strong' | 'capable'; label: string; scholarName: string; score: number }>();
    const scholars = Game.state.scholars.filter(s => s.isAvailable);
    if (scholars.length === 0) return map;

    for (const t of TOPICS) {
      let bestScore = 0;
      let bestName = '';
      for (const s of scholars) {
        const score = s.disciplines[t.name] ?? 0;
        if (score > bestScore) { bestScore = score; bestName = s.name; }
      }
      if (bestScore >= 8)      map.set(t.id, { tier: 'expert',  label: 'Suggested', scholarName: bestName, score: bestScore });
      else if (bestScore >= 6) map.set(t.id, { tier: 'strong',  label: 'Suggested', scholarName: bestName, score: bestScore });
      else if (bestScore >= 4) map.set(t.id, { tier: 'capable', label: 'Capable',   scholarName: bestName, score: bestScore });
    }
    return map;
  }

  // ── Step 2: Format ──────────────────────────────────────────────

  private formatStepHTML(): string {
    const topic = this.selectedTopicId ? TOPICS.find(t => t.id === this.selectedTopicId) : null;
    return `
      <div class="pp-step pp-step-format">
        <p class="pp-step-hint">${topic ? `For a work on <strong>${topic.name}</strong>, choose the form it will take.` : 'Choose a format.'}</p>
        <div class="pp-tile-grid">
          ${FORMATS.map(f => {
            const sel = this.selectedFormatId === f.id ? ' selected' : '';
            const synergy = topic
              ? topic.strongFormats.includes(f.id) ? 'strong'
              : topic.weakFormats.includes(f.id)   ? 'weak'
              : 'neutral'
              : 'neutral';
            const synergyLabel = synergy === 'strong' ? '✓ strong pairing'
                              : synergy === 'weak'   ? '✗ weak pairing'
                              :                         '— neutral pairing';
            return `
              <button class="pp-tile${sel} pp-tile-synergy-${synergy}" data-format="${f.id}">
                <div class="pp-tile-title">${f.name}</div>
                <div class="pp-tile-meta">${f.primaryAudience}</div>
                <div class="pp-tile-synergy">${synergyLabel}</div>
              </button>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  // ── Step 4: Refine (priorities + research approach, both optional) ──

  private approachStepHTML(): string {
    const remaining = this.poolRemaining();
    const spent = STAGE_AXES.research.reduce((s, a) => s + (this.researchEmphasis[a] ?? 0), 0);
    const emphRemaining = EMPHASIS_POINTS - spent;
    const topic  = this.selectedTopicId  ? TOPICS.find(t => t.id === this.selectedTopicId)?.name : '';
    const format = this.selectedFormatId ? FORMATS.find(f => f.id === this.selectedFormatId)?.name : '';
    return `
      <div class="pp-step pp-step-approach">
        <p class="pp-step-hint pp-approach-intro">Optional — shape the <strong>${format ?? 'work'}</strong> on <strong>${topic ?? '—'}</strong>, or simply <strong>Begin Work</strong> with a balanced approach.</p>

        <div class="pp-approach-section">
          <div class="pp-priorities-head">
            <p class="pp-step-hint">Spend ${POOL} points to set the work's <strong>priorities</strong>. Each point lifts that quality — and nudges your institution's character.</p>
            <div class="pp-pool-indicator">
              <span class="pp-pool-num" id="pp-pool-num">${remaining}</span>
              <span class="pp-pool-label">point${remaining === 1 ? '' : 's'} left</span>
            </div>
          </div>
          <div class="pp-pips">${PRIORITY_KEYS.map(k => this.priorityCardHTML(k)).join('')}</div>
        </div>

        <div class="pp-approach-section">
          <div class="pp-priorities-head">
            <p class="pp-step-hint">Spend ${EMPHASIS_POINTS} points on the <strong>research approach</strong> for stage one.</p>
            <div class="pp-pool-indicator">
              <span class="pp-pool-num" id="pp-emph-num">${emphRemaining}</span>
              <span class="pp-pool-label">point${emphRemaining === 1 ? '' : 's'} left</span>
            </div>
          </div>
          <div class="pp-pips">${STAGE_AXES.research.map(axis => this.emphasisCardHTML(axis)).join('')}</div>
        </div>
      </div>
    `;
  }

  private priorityCardHTML(key: string): string {
    const val = this.priorities[key] ?? 0;
    const hint = PRIORITY_HINTS[key];
    const canAdd = this.poolRemaining() > 0 && val < PRIORITY_MAX;
    const pips = Array.from({ length: PRIORITY_MAX }, (_, i) =>
      `<span class="pp-pip${i < val ? ' on' : ''}" data-key="${key}" data-i="${i + 1}"></span>`
    ).join('');
    return `
      <div class="pp-pip-card${val > 0 ? ' active' : ''}" data-key="${key}">
        <div class="pp-pip-info">
          <span class="pp-pip-name">${key}</span>
          <span class="pp-pip-hint">${hint ? `${hint.stage} · ${hint.lean}` : ''}</span>
        </div>
        <button class="pp-pip-btn pp-pip-minus" data-key="${key}" ${val <= 0 ? 'disabled' : ''} aria-label="Less ${key}">−</button>
        <div class="pp-pip-track">${pips}</div>
        <button class="pp-pip-btn pp-pip-plus" data-key="${key}" ${canAdd ? '' : 'disabled'} aria-label="More ${key}">+</button>
      </div>
    `;
  }

  // ── Step 3: Lead ────────────────────────────────────────────────

  private leadStepHTML(): string {
    const scholars = Game.state.scholars;
    const topicName = this.selectedTopicId ? TOPICS.find(t => t.id === this.selectedTopicId)?.name ?? '' : '';

    // The available scholar with the highest topic-fit gets a "Recommended" badge.
    let recommendedId: string | null = null;
    if (topicName) {
      let bestScore = -1;
      for (const s of scholars) {
        if (!s.isAvailable) continue;
        const score = s.disciplines[topicName] ?? 0;
        if (score > bestScore) { bestScore = score; recommendedId = s.id; }
      }
      // Only highlight if it's actually a non-trivial match
      if (bestScore < 3) recommendedId = null;
    }

    // Default the lead to the strongest available scholar so the player can
    // just press Begin Work; they can still pick anyone else.
    if (this.selectedScholarId === null) {
      let bestId: string | null = null, best = -1;
      for (const s of scholars) {
        if (!s.isAvailable) continue;
        const score = topicName ? (s.disciplines[topicName] ?? 0) : 0;
        if (score > best) { best = score; bestId = s.id; }
      }
      this.selectedScholarId = bestId;
    }

    return `
      <div class="pp-step pp-step-lead">
        <p class="pp-step-hint">Pick the lead scholar for stage one (Research)${topicName ? ` on <strong>${topicName}</strong>` : ''}. Every other available scholar will assist on this stage; you'll pick a new lead at each stage gate.</p>
        <div class="pp-scholar-grid">
          ${scholars.map(s => this.scholarCardHTML(s, topicName, recommendedId === s.id)).join('')}
        </div>
      </div>
    `;
  }

  private scholarCardHTML(s: Scholar, topicName: string, recommended: boolean): string {
    const unavailable = !s.isAvailable ? ' unavailable' : '';
    const selected = this.selectedScholarId === s.id ? ' selected' : '';
    const willAssist = this.selectedScholarId && this.selectedScholarId !== s.id && s.isAvailable ? ' is-assistant' : '';
    const roleTag = this.selectedScholarId === s.id ? 'Lead'
                  : this.selectedScholarId && s.isAvailable ? 'Will assist'
                  : '';

    const portrait = this.scholarPortraitHTML(s);

    // Topic-fit badge — only render when a topic is chosen.
    const topicScore = topicName ? (s.disciplines[topicName] ?? 0) : null;
    const topicFitTier = topicScore === null ? null
                       : topicScore >= 8 ? { label: 'Expert',   cls: 'expert' }
                       : topicScore >= 6 ? { label: 'Strong',   cls: 'strong' }
                       : topicScore >= 4 ? { label: 'Capable',  cls: 'capable' }
                       : topicScore >= 2 ? { label: 'Modest',   cls: 'modest' }
                       :                   { label: 'Untested', cls: 'untested' };

    // Primary discipline score (separate from topic score)
    const primaryScore = s.disciplines[s.primaryDiscipline] ?? 0;

    // Mood — Morale/Stress/Exhaustion as 0..1 bars.
    const morale = s.morale ?? 0.5;
    const stress = s.stress ?? 0;
    const exhaust = s.exhaustion ?? 0;
    const moodTone = (val: number, inverted: boolean) => {
      const v = inverted ? 1 - val : val;
      return v >= 0.65 ? 'good' : v >= 0.35 ? 'mid' : 'low';
    };

    return `
      <div class="pp-scholar-card${unavailable}${selected}${willAssist}" data-id="${s.id}">
        ${recommended && !selected ? '<div class="pp-rec-badge">★ Best fit</div>' : ''}
        <div class="pp-sc-portrait">${portrait}</div>
        <div class="pp-sc-body">
          <div class="pp-sc-top">
            <div class="pp-sc-name">${s.name.split(' ')[0]}</div>
            <div class="pp-sc-name-tail">${s.name.split(' ').slice(1).join(' ')}</div>
          </div>
          <div class="pp-sc-archetype">${s.archetype}${s.restlessFlagged ? '  ·  <span class="pp-sc-restless">restless</span>' : ''}</div>

          <div class="pp-sc-disciplines">
            <div class="pp-sc-disc-row">
              <span class="pp-sc-disc-name">${s.primaryDiscipline}</span>
              <span class="pp-sc-disc-score">${primaryScore}/10</span>
            </div>
            ${topicName && topicName !== s.primaryDiscipline ? `
              <div class="pp-sc-disc-row pp-sc-disc-topic">
                <span class="pp-sc-disc-name">${topicName}</span>
                <span class="pp-sc-disc-score">${topicScore}/10</span>
              </div>
            ` : ''}
          </div>

          ${topicFitTier ? `<div class="pp-sc-fit pp-sc-fit-${topicFitTier.cls}">${topicFitTier.label} in ${topicName}</div>` : ''}

          ${s.visibleTraits.length > 0 ? `
            <div class="pp-sc-traits">
              ${s.visibleTraits.map(t => `<span class="pp-sc-trait">${t}</span>`).join('')}
            </div>
          ` : ''}

          <div class="pp-sc-mood">
            ${this.moodBarHTML('Morale',   morale,  moodTone(morale,  false))}
            ${this.moodBarHTML('Stress',   stress,  moodTone(stress,  true))}
            ${this.moodBarHTML('Energy',   1 - exhaust, moodTone(1 - exhaust, false))}
          </div>

          <div class="pp-sc-footer">
            <span class="pp-sc-salary">${s.salary} gold / month</span>
            <span class="pp-sc-role-tag">${roleTag}</span>
          </div>
        </div>
      </div>
    `;
  }

  // ── Research emphasis pip card (rendered inside the Refine step) ───

  private emphasisCardHTML(axis: string): string {
    const val = this.researchEmphasis[axis] ?? 0;
    const spent = STAGE_AXES.research.reduce((s, a) => s + (this.researchEmphasis[a] ?? 0), 0);
    const canAdd = spent < EMPHASIS_POINTS && val < EMPHASIS_POINTS;
    const pips = Array.from({ length: EMPHASIS_POINTS }, (_, i) =>
      `<span class="pp-pip${i < val ? ' on' : ''}" data-axis="${axis}" data-i="${i + 1}"></span>`
    ).join('');
    return `
      <div class="pp-pip-card${val > 0 ? ' active' : ''}" data-axis="${axis}">
        <div class="pp-pip-info">
          <span class="pp-pip-name">${axis}</span>
          <span class="pp-pip-hint">${AXIS_HINTS[axis] ?? ''}</span>
        </div>
        <button class="pp-pip-btn pp-pip-minus" data-axis="${axis}" ${val <= 0 ? 'disabled' : ''} aria-label="Less ${axis}">−</button>
        <div class="pp-pip-track">${pips}</div>
        <button class="pp-pip-btn pp-pip-plus" data-axis="${axis}" ${canAdd ? '' : 'disabled'} aria-label="More ${axis}">+</button>
      </div>
    `;
  }

  // Set one research-emphasis axis, clamped to the EMPHASIS_POINTS pool, then
  // re-render the step.
  private setEmphasis(axis: string, value: number) {
    const otherTotal = STAGE_AXES.research
      .filter(a => a !== axis)
      .reduce((s, a) => s + (this.researchEmphasis[a] ?? 0), 0);
    const maxAllowed = Math.min(EMPHASIS_POINTS, EMPHASIS_POINTS - otherTotal);
    const accepted = Math.max(0, Math.min(value, maxAllowed));
    if (accepted === (this.researchEmphasis[axis] ?? 0)) return;
    this.researchEmphasis[axis] = accepted;
    this.renderStep();
  }

  // Portrait: PNG for the 5 founders, initial-letter circle for procedural hires.
  private scholarPortraitHTML(s: Scholar): string {
    const isFounder = ['yildiz', 'ossavi', 'meridian', 'vasara', 'harlow'].includes(s.id);
    if (isFounder) {
      return `<img src="assets/portraits/portrait_${s.id}.png" alt="${s.name}" class="pp-sc-portrait-img" />`;
    }
    const initial = (s.name[0] ?? '?').toUpperCase();
    // Stable color from initial
    const palette = ['#5c3418', '#3d2418', '#4a3018', '#5a3820', '#6e3e1c', '#6a4828'];
    const color = palette[initial.charCodeAt(0) % palette.length];
    return `<div class="pp-sc-portrait-initial" style="background:${color}">${initial}</div>`;
  }

  private moodBarHTML(label: string, value: number, tone: string): string {
    const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
    return `
      <div class="pp-sc-mood-row">
        <span class="pp-sc-mood-label">${label}</span>
        <div class="pp-sc-mood-bar"><div class="pp-sc-mood-fill ${tone}" style="width:${pct}%"></div></div>
      </div>
    `;
  }

  // ── Step event binding ──────────────────────────────────────────

  private bindStepEvents() {
    const el = this.el!;

    // Footer: Back / Next / Begin
    el.querySelector<HTMLButtonElement>('#pp-back')!.addEventListener('click', () => {
      const target = this.previousStep();
      if (target !== null) {
        this.step = target;
        this.renderStep();
      }
    });
    el.querySelector<HTMLButtonElement>('#pp-next')!.addEventListener('click', () => {
      if (!this.canAdvance()) return;
      // "Begin Work" is the primary action on the lead step (3) and the
      // optional refine step (4); earlier steps just advance.
      if (this.step === 3 || this.step === TOTAL_STEPS) {
        this.beginWork();
      } else {
        const target = this.nextStep();
        if (target === null) {
          this.beginWork();
        } else {
          this.step = target;
          this.renderStep();
        }
      }
    });

    // Optional "Refine ›" link on the lead step → the (skippable) refine step.
    el.querySelector<HTMLButtonElement>('#pp-refine')?.addEventListener('click', () => {
      if (!this.canAdvance()) return;
      this.step = 4;
      this.renderStep();
    });

    // Step-specific bindings
    switch (this.step) {
      case 0:
        el.querySelectorAll<HTMLButtonElement>('.pp-mode-card').forEach(card => {
          card.addEventListener('click', () => {
            const mode = card.dataset.mode as WorkMode;
            this.mode = mode;
            // Pre-fill / clear topic & format based on mode
            const commission = Game.state.activeCommission;
            if (mode === 'commission' && commission) {
              this.selectedTopicId = commission.topicId;
              this.selectedFormatId = commission.formatId;
            } else {
              this.selectedTopicId = null;
              this.selectedFormatId = null;
            }
            this.renderStep();
          });
        });
        break;
      case 1:
        el.querySelectorAll<HTMLButtonElement>('.pp-tile[data-topic]').forEach(tile => {
          tile.addEventListener('click', () => {
            const id = tile.dataset.topic!;
            // If switching topic, clear format because synergy changes.
            if (this.selectedTopicId !== id) this.selectedFormatId = null;
            this.selectedTopicId = id;
            this.renderStep();
          });
        });
        break;
      case 2:
        el.querySelectorAll<HTMLButtonElement>('.pp-tile[data-format]').forEach(tile => {
          tile.addEventListener('click', () => {
            this.selectedFormatId = tile.dataset.format!;
            this.renderStep();
          });
        });
        break;
      case 3:
        el.querySelectorAll<HTMLElement>('.pp-scholar-card').forEach(card => {
          card.addEventListener('click', () => {
            if (card.classList.contains('unavailable')) return;
            const id = card.dataset.id!;
            this.selectedScholarId = this.selectedScholarId === id ? null : id;
            this.renderStep();
          });
        });
        break;
      case 4: {
        // Two pip pools on one screen: priorities (data-key) and research
        // approach (data-axis). Bind each by its distinguishing attribute.
        const bumpP = (key: string, delta: number) =>
          this.setPriority(key, (this.priorities[key] ?? 0) + delta);
        el.querySelectorAll<HTMLButtonElement>('.pp-pip-plus[data-key]').forEach(btn =>
          btn.addEventListener('click', () => bumpP(btn.dataset.key!, +1)));
        el.querySelectorAll<HTMLButtonElement>('.pp-pip-minus[data-key]').forEach(btn =>
          btn.addEventListener('click', () => bumpP(btn.dataset.key!, -1)));
        el.querySelectorAll<HTMLElement>('.pp-pip[data-key]').forEach(pip =>
          pip.addEventListener('click', () => {
            const key = pip.dataset.key!;
            const i = Number(pip.dataset.i);
            const current = this.priorities[key] ?? 0;
            this.setPriority(key, i === current ? i - 1 : i);
          }));

        const bumpE = (axis: string, delta: number) =>
          this.setEmphasis(axis, (this.researchEmphasis[axis] ?? 0) + delta);
        el.querySelectorAll<HTMLButtonElement>('.pp-pip-plus[data-axis]').forEach(btn =>
          btn.addEventListener('click', () => bumpE(btn.dataset.axis!, +1)));
        el.querySelectorAll<HTMLButtonElement>('.pp-pip-minus[data-axis]').forEach(btn =>
          btn.addEventListener('click', () => bumpE(btn.dataset.axis!, -1)));
        el.querySelectorAll<HTMLElement>('.pp-pip[data-axis]').forEach(pip =>
          pip.addEventListener('click', () => {
            const axis = pip.dataset.axis!;
            const i = Number(pip.dataset.i);
            const current = this.researchEmphasis[axis] ?? 0;
            this.setEmphasis(axis, i === current ? i - 1 : i);
          }));
        break;
      }
    }
  }

  // Set one priority to `value`, clamped to [0, PRIORITY_MAX] and to whatever
  // the shared point pool still allows, then re-render the step.
  private setPriority(key: string, value: number) {
    const otherTotal = Object.entries(this.priorities)
      .filter(([k]) => k !== key)
      .reduce((sum, [, v]) => sum + v, 0);
    const maxAllowed = Math.min(PRIORITY_MAX, POOL - otherTotal);
    const accepted = Math.max(0, Math.min(value, maxAllowed));
    if (accepted === (this.priorities[key] ?? 0)) return;
    this.priorities[key] = accepted;
    this.renderStep();
  }

  private poolRemaining(): number {
    return POOL - Object.values(this.priorities).reduce((a, b) => a + b, 0);
  }

  // Per-step "are you ready to move on?"
  private canAdvance(): boolean {
    switch (this.step) {
      case 0: return true; // mode is always pre-set to 'original'; commission card can be clicked
      case 1: return !!this.selectedTopicId;
      case 2: return !!this.selectedFormatId;
      case 3: return !!this.selectedScholarId; // lead required — then you may begin or refine
      case 4: return true; // refine is optional; zero spend == neutral
    }
  }

  // In commission mode, topic + format steps are skipped (locked from the commission).
  // Returns null when there's no further step (i.e., we should begin work).
  private nextStep(): Step | null {
    let next = (this.step + 1) as Step;
    if (this.mode === 'commission') {
      // Skip topic (1) and format (2) — they were locked in by the commission;
      // jump straight to the lead pick (3).
      if (next === 1 || next === 2) next = 3;
    }
    if (next > TOTAL_STEPS) return null;
    return next;
  }

  private previousStep(): Step | null {
    let prev = (this.step - 1) as Step;
    const hasModeStep = !!Game.state.activeCommission;
    const floorStep: Step = hasModeStep ? 0 : 1;
    if (prev < floorStep) return null;
    if (this.mode === 'commission') {
      if (prev === 2 || prev === 1) prev = 0;
    }
    return prev;
  }

  // ── Begin work ──────────────────────────────────────────────────

  private beginWork() {
    if (!this.selectedScholarId || !this.selectedTopicId || !this.selectedFormatId) return;

    const lead = Game.state.scholars.find(s => s.id === this.selectedScholarId)!;

    // Auto-assign every other available scholar as stage 1 assistants
    const assistantIds = Game.state.scholars
      .filter(s => s.id !== lead.id && s.isAvailable)
      .map(s => s.id);

    lead.isAvailable = false;
    for (const aid of assistantIds) {
      const a = Game.state.scholars.find(s => s.id === aid);
      if (a) a.isAvailable = false;
    }

    const stageRecord: StageRecord = {
      key: STAGE_ORDER[0],
      leadScholarId: lead.id,
      assistantScholarIds: [...assistantIds],
      qualitySlice: 0,
      startDay: Game.state.day,
      emphasis: { ...this.researchEmphasis },
    };

    const project = {
      id: `proj_${Date.now()}`,
      topicId:              this.selectedTopicId,
      formatId:             this.selectedFormatId,
      leadScholarId:        this.selectedScholarId,
      assistantScholarIds:  [...assistantIds],
      priorities:           { ...this.priorities },
      state:                'in_development' as const,
      progress:             0,
      qualityScore:         0,
      startDay:             Game.state.day,
      currentStageIndex:    0,
      stages:               [stageRecord],
      isCommission:         this.mode === 'commission',
    };

    Game.state.activeProject = project;
    Events.emit(GameEvents.PROJECT_STARTED, { project });
    this.hide();
  }
}
