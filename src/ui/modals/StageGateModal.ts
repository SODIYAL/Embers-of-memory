import './modals.css';
import { TOPICS } from '../../data/topics';
import { STAGE_INFO } from '../../models/Project';
import type { Project, StageKey } from '../../models/Project';
import { Game } from '../../game/GameManager';
import type { IdeologyVector } from '../../models/Ideology';
import { STAGE_AXES, AXIS_HINTS, EMPHASIS_POINTS } from '../../data/stageEmphasis';

// Framings the player can attach to the next stage. Each is a small per-axis
// nudge bundled with the stage's eventual imprint contribution.
export const STAGE_FRAMINGS: Record<string, { label: string; flavor: string; vector: IdeologyVector }> = {
  none:     { label: 'No framing',
              flavor: 'Let the work speak for itself.',
              vector: {} },
  devout:   { label: 'A devout framing',
              flavor: 'The lead frames the stage in reverent terms — quoting the old texts, honoring the established order.',
              vector: { piety: +4, tradition: +2 } },
  reformist:{ label: 'A reformist framing',
              flavor: 'The lead pushes for new ideas, new methods — old certainties questioned.',
              vector: { piety: -2, tradition: -4 } },
  popular:  { label: 'A populist framing',
              flavor: 'The lead aims the work outward — written for the common reader, not just the institution.',
              vector: { populism: +4 } },
};

export class StageGateModal {
  private el: HTMLElement | null = null;
  private selectedFramingKey: string = 'none';
  private selectedScholarId: string | null = null;
  private emphasis: Record<string, number> = {};

  show(
    project: Project,
    nextStageKey: StageKey,
    onPick: (scholarId: string, framing?: IdeologyVector, emphasis?: Record<string, number>) => void,
  ) {
    if (this.el) return;
    this.selectedFramingKey = 'none';
    this.selectedScholarId = null;
    this.emphasis = Object.fromEntries(STAGE_AXES[nextStageKey].map(a => [a, 0]));

    const topic = TOPICS.find(t => t.id === project.topicId);
    const topicName = topic?.name ?? '';
    const nextInfo = STAGE_INFO[nextStageKey];

    // Per-stage rundown of what's been done
    const completedRows = project.stages.map(s => {
      const info = STAGE_INFO[s.key];
      const leadScholar = Game.state.scholars.find(sch => sch.id === s.leadScholarId);
      const leadName = leadScholar?.name ?? 'unknown';
      const tier = sliceLabel(s.qualitySlice);
      return `
        <div class="stage-row">
          <div class="stage-row-label">${info.label}</div>
          <div class="stage-row-lead">led by ${leadName}</div>
          <div class="stage-row-slice ${tier.cls}">${tier.label}</div>
        </div>
      `;
    }).join('');

    // Gap hint: which axes feel under-served. Compare each stage's slice
    // to the median — the lowest gets called out.
    const gapHint = this.gapHint(project);

    // Available scholars to lead the next stage
    const candidates = Game.state.scholars.filter(s => s.isAvailable);
    // Plus: the previous stage's lead is now idle again (released by ProjectSystem
    // before openStageGate), so they appear in the list naturally.

    const optionsHTML = candidates.map(s => {
      const skill = s.disciplines[topicName] ?? 0;
      const tag = skill >= 7 ? 'strong'
                : skill >= 4 ? 'capable'
                : skill >= 2 ? 'modest'
                : 'untested';
      return `
        <button class="modal-btn modal-btn-choice stage-lead-btn" data-id="${s.id}">
          <span class="modal-btn-label">${s.name}</span>
          <span class="modal-btn-blurb">${topicName} ${skill}/10 · ${tag} · primary: ${s.primaryDiscipline}</span>
        </button>
      `;
    }).join('');

    const framingChipsHTML = Object.entries(STAGE_FRAMINGS).map(([key, f]) => `
      <button class="stage-framing-chip${key === 'none' ? ' selected' : ''}" data-framing="${key}" title="${f.flavor}">
        ${f.label}
      </button>
    `).join('');

    this.el = document.createElement('div');
    this.el.className = 'modal-backdrop';
    this.el.innerHTML = `
      <div class="modal-card stage-gate-card">
        <div class="stage-gate-heading">${nextInfo.label} begins</div>
        <div class="stage-gate-flavor">${nextInfo.flavor}</div>

        <div class="stage-gate-section">
          <div class="stage-gate-section-heading">So far</div>
          ${completedRows}
          ${gapHint ? `<div class="stage-gate-hint">${gapHint}</div>` : ''}
        </div>

        <div class="stage-gate-section">
          <div class="stage-gate-section-heading">Choose a lead for ${nextInfo.label.toLowerCase()}</div>
          <div class="stage-gate-sub">All other available scholars will assist.</div>
          <div class="modal-btn-column">${optionsHTML}</div>
        </div>

        <div class="stage-gate-section">
          <div class="stage-gate-section-heading">Approach for ${nextInfo.label.toLowerCase()}</div>
          <div class="stage-gate-sub">Spend ${EMPHASIS_POINTS} points across the three approaches. The right mix depends on topic + format — discover it through experiment.</div>
          <div class="stage-gate-emphasis" id="stage-gate-emphasis">
            ${STAGE_AXES[nextStageKey].map(axis => `
              <div class="stage-emph-card" data-axis="${axis}">
                <div class="stage-emph-head">
                  <span class="stage-emph-name">${axis}</span>
                  <span class="stage-emph-val" id="stage-emph-val-${axis}">0</span>
                </div>
                <div class="stage-emph-hint">${AXIS_HINTS[axis] ?? ''}</div>
                <input type="range" min="0" max="${EMPHASIS_POINTS}" step="1" value="0" class="stage-emph-slider" data-axis="${axis}" />
              </div>
            `).join('')}
          </div>
          <div class="stage-emph-pool">
            <span id="stage-emph-remaining">${EMPHASIS_POINTS}</span> point<span id="stage-emph-plural">s</span> left
          </div>
        </div>

        <div class="stage-gate-section">
          <div class="stage-gate-section-heading">Optional framing</div>
          <div class="stage-gate-sub">Add a small ideological nudge to this stage's imprint.</div>
          <div class="stage-framing-chips">${framingChipsHTML}</div>
          <div class="stage-framing-flavor" id="stage-framing-flavor">${STAGE_FRAMINGS.none.flavor}</div>
        </div>

        <div class="stage-gate-footer">
          <button class="modal-btn" id="stage-gate-confirm" disabled>Begin ${nextInfo.label.toLowerCase()}</button>
        </div>
      </div>
    `;
    document.getElementById('ui-layer')!.appendChild(this.el);

    const confirmBtn = this.el.querySelector<HTMLButtonElement>('#stage-gate-confirm')!;
    const flavorEl   = this.el.querySelector<HTMLElement>('#stage-framing-flavor')!;

    this.el.querySelectorAll<HTMLButtonElement>('.stage-lead-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedScholarId = btn.dataset.id!;
        // Visual selection
        this.el!.querySelectorAll('.stage-lead-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        confirmBtn.disabled = false;
      });
    });

    this.el.querySelectorAll<HTMLButtonElement>('.stage-framing-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const key = chip.dataset.framing!;
        this.selectedFramingKey = key;
        this.el!.querySelectorAll('.stage-framing-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        flavorEl.textContent = STAGE_FRAMINGS[key].flavor;
      });
    });

    // Emphasis sliders — shared 5-point pool across the stage's 3 axes
    const axes = STAGE_AXES[nextStageKey];
    const remainingEl = this.el.querySelector<HTMLElement>('#stage-emph-remaining')!;
    const pluralEl    = this.el.querySelector<HTMLElement>('#stage-emph-plural')!;
    const refreshPool = () => {
      const spent = axes.reduce((s, a) => s + (this.emphasis[a] ?? 0), 0);
      const remaining = EMPHASIS_POINTS - spent;
      remainingEl.textContent = String(remaining);
      pluralEl.textContent = remaining === 1 ? '' : 's';
    };
    const paintFill = (slider: HTMLInputElement) => {
      const pct = (Number(slider.value) / EMPHASIS_POINTS) * 100;
      slider.style.setProperty('--fill', `${pct}%`);
    };
    this.el.querySelectorAll<HTMLInputElement>('.stage-emph-slider').forEach(slider => {
      paintFill(slider);
      slider.addEventListener('input', () => {
        const axis = slider.dataset.axis!;
        const requested = Number(slider.value);
        const otherTotal = axes
          .filter(a => a !== axis)
          .reduce((s, a) => s + (this.emphasis[a] ?? 0), 0);
        const maxAllowed = Math.min(EMPHASIS_POINTS, EMPHASIS_POINTS - otherTotal);
        const accepted = Math.min(requested, Math.max(0, maxAllowed));
        this.emphasis[axis] = accepted;
        slider.value = String(accepted);
        paintFill(slider);
        const valEl = this.el!.querySelector(`#stage-emph-val-${axis}`);
        if (valEl) valEl.textContent = String(accepted);
        refreshPool();
      });
    });

    confirmBtn.addEventListener('click', () => {
      if (!this.selectedScholarId) return;
      const framing = STAGE_FRAMINGS[this.selectedFramingKey].vector;
      const id = this.selectedScholarId;
      const emphasisCopy = { ...this.emphasis };
      this.hide();
      // Only pass a framing if non-empty so saves stay clean.
      onPick(
        id,
        Object.keys(framing).length > 0 ? { ...framing } : undefined,
        emphasisCopy,
      );
    });
  }

  hide() {
    this.el?.remove();
    this.el = null;
  }

  isOpen() { return this.el !== null; }

  // Surface the weakest finished stage as a hint to the player about what
  // the next stage's lead pick should compensate for.
  private gapHint(project: Project): string {
    if (project.stages.length === 0) return '';
    let weakest = project.stages[0];
    for (const s of project.stages) {
      if (s.qualitySlice < weakest.qualitySlice) weakest = s;
    }
    if (weakest.qualitySlice >= 0.20) return '';
    const info = STAGE_INFO[weakest.key];
    const emphasis = info.emphasizes.slice(0, 2).join(' and ');
    return `${info.label} came in light. A lead strong in ${emphasis} could lift the work.`;
  }
}

function sliceLabel(slice: number): { label: string; cls: string } {
  if (slice >= 0.30) return { label: 'Strong',   cls: 'tier-strong' };
  if (slice >= 0.22) return { label: 'Solid',    cls: 'tier-solid' };
  if (slice >= 0.14) return { label: 'Adequate', cls: 'tier-adequate' };
  if (slice >= 0.07) return { label: 'Thin',     cls: 'tier-thin' };
  return { label: 'Weak', cls: 'tier-weak' };
}
