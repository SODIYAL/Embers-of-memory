import './scholar-panel.css';
import { Game } from '../../game/GameManager';
import { Events, GameEvents } from '../../game/EventBus';
import { TOPICS } from '../../data/topics';
import { FORMATS } from '../../data/formats';
import { RecruitmentSystem, RECRUITMENT_COST, RECRUITMENT_DELAY_DAYS } from '../../systems/RecruitmentSystem';
import { getBand, getScore, getShared, BAND_LABELS } from '../../game/Chemistry';
import type { Scholar } from '../../models/Scholar';

const JOINING_FEE_MULTIPLIER = 3;

export type SalaryDeal = 'asking' | 'above' | 'below';

export class ScholarPanel {
  private el: HTMLElement | null = null;
  private recruitment: RecruitmentSystem;
  // Set by CampusScene — called when the player clicks Hire on a candidate.
  // CampusScene shows a salary-negotiation modal, then calls completeHire().
  onHireRequest: ((candidateIdx: number) => void) | null = null;

  constructor(recruitment: RecruitmentSystem) {
    this.recruitment = recruitment;
  }

  show() {
    if (this.el) return;
    this.el = document.createElement('div');
    this.el.className = 'scholar-panel-backdrop';
    this.el.innerHTML = this.buildHTML();
    document.getElementById('ui-layer')!.appendChild(this.el);
    this.bindEvents();
  }

  hide() {
    this.el?.remove();
    this.el = null;
  }

  isOpen() { return this.el !== null; }

  // ── HTML ────────────────────────────────────────────────────────

  private buildHTML(): string {
    const scholars = Game.state.scholars;

    return `
      <div class="scholar-panel">
        <div class="sp-header">
          <h2 class="sp-title">Your Scholars</h2>
          <button class="sp-close" id="sp-close">✕</button>
        </div>
        <div class="sp-body">
          <h3 class="sp-section-heading">Roster (${scholars.length})</h3>
          <div class="sp-scholar-list">
            ${scholars.map(s => this.scholarCardHTML(s)).join('')}
          </div>

          <hr class="sp-hire-divider">
          <h3 class="sp-section-heading">Recruitment</h3>
          ${this.recruitmentSectionHTML()}
        </div>
      </div>
    `;
  }

  private recruitmentSectionHTML(): string {
    const daysOut = this.recruitment.daysUntilArrival();

    if (daysOut > 0) {
      return `
        <p class="sp-hire-message">
          Messengers are abroad. Candidates expected in <strong>${daysOut} day${daysOut === 1 ? '' : 's'}</strong>.
        </p>
      `;
    }

    const candidates = Game.state.currentCandidates;
    const canRequest = this.recruitment.canRequest();
    const cost = RECRUITMENT_COST;
    const delay = RECRUITMENT_DELAY_DAYS;

    const requestBtn = `
      <button class="sp-request-btn" id="sp-request-btn" ${canRequest ? '' : 'disabled'}>
        ${candidates.length > 0 ? 'Send for new candidates' : 'Send for candidates'}
        <span class="sp-request-cost">· ${cost} gold · ${delay} days</span>
      </button>
    `;

    if (candidates.length === 0) {
      return `
        <p class="sp-hire-message">
          No one is at the gate. Dispatch a messenger to spread word of your institution.
        </p>
        ${requestBtn}
      `;
    }

    return `
      <div class="sp-candidate-list">
        ${candidates.map((c, i) => this.candidateCardHTML(c, i)).join('')}
      </div>
      ${requestBtn}
    `;
  }

  private candidateCardHTML(s: Scholar, idx: number): string {
    const joiningFee = s.salary * JOINING_FEE_MULTIPLIER;
    const canAfford = Game.state.treasury >= joiningFee;
    const score = s.disciplines[s.primaryDiscipline] ?? 0;

    return `
      <div class="sp-hire-card">
        <div class="sp-hire-info">
          <div class="sp-hire-name">${s.name}</div>
          <div class="sp-hire-archetype">${s.archetype} · age ${s.age}</div>
          <div class="sp-hire-discipline">${s.primaryDiscipline} ${this.dotsHTML(score)}</div>
          <div class="sp-hire-traits">
            ${s.visibleTraits.map(t => `<span class="sp-trait-chip">${t}</span>`).join('')}
            ${s.hiddenTraits.length > 0
              ? `<span class="sp-trait-chip sp-trait-chip-hidden" title="${s.hiddenTraits.length} hidden trait${s.hiddenTraits.length === 1 ? '' : 's'} — revealed over time">? × ${s.hiddenTraits.length}</span>`
              : ''}
            ${s.hiddenTalent && !s.hiddenTalent.revealed
              ? `<span class="sp-trait-chip sp-trait-chip-talent" title="A hidden talent waiting to surface">★ ?</span>`
              : ''}
          </div>
        </div>
        <div class="sp-hire-action">
          <span class="sp-hire-cost">Joining fee: ${joiningFee} gold</span>
          <button class="sp-hire-btn" data-candidate-idx="${idx}" ${canAfford ? '' : 'disabled'}>
            ${canAfford ? 'Hire' : 'Insufficient funds'}
          </button>
        </div>
      </div>
    `;
  }

  private scholarCardHTML(s: Scholar): string {
    const status = this.getStatus(s);
    const sortedDisciplines = Object.entries(s.disciplines)
      .sort((a, b) => b[1] - a[1]);
    return `
      <div class="sp-scholar-card ${s.restlessFlagged ? 'sp-restless' : ''}">
        <div class="sp-name-row">
          <span class="sp-name">${s.name}</span>
          <span class="sp-age">age ${s.age}</span>
        </div>
        <div class="sp-archetype">${s.archetype}</div>
        <div class="sp-disciplines">
          ${sortedDisciplines.map(([name, score]) => `
            <div class="sp-discipline-row ${name === s.primaryDiscipline ? 'primary' : ''}">
              <span class="sp-discipline-name">${name}</span>
              ${this.dotsHTML(score)}
            </div>
          `).join('')}
        </div>
        <div class="sp-wellbeing">
          <span class="sp-wellbeing-item morale-${this.moraleTier(s)}">
            Mood: ${this.moraleLabel(s)}
          </span>
          <span class="sp-wellbeing-item stress-${this.stressTier(s.stress ?? 0)}">
            Stress: ${this.stressLabel(s.stress ?? 0)}
          </span>
          <span class="sp-wellbeing-item exhaustion-${this.exhaustionTier(s.exhaustion ?? 0)}">
            Rest: ${this.exhaustionLabel(s.exhaustion ?? 0)}
          </span>
        </div>
        <div class="sp-traits">
          ${s.visibleTraits.map(t => `<span class="sp-trait-chip">${t}</span>`).join('')}
          ${s.hiddenTraits.map(() => `<span class="sp-trait-chip sp-trait-chip-hidden" title="Unknown — reveals as you work together">?</span>`).join('')}
          ${s.hiddenTalent && !s.hiddenTalent.revealed
            ? `<span class="sp-trait-chip sp-trait-chip-talent" title="A hidden talent — reveals when given the right project">★ ?</span>`
            : ''}
          ${s.hiddenTalent && s.hiddenTalent.revealed
            ? `<span class="sp-trait-chip sp-trait-chip-talent" title="Revealed talent">★ ${s.hiddenTalent.discipline}</span>`
            : ''}
        </div>
        ${this.chemistryRowHTML(s)}
        <div class="sp-card-aside">
          <span class="sp-salary">${s.salary} gold / mo</span>
          <span class="sp-status ${this.statusClass(s)}">${status}</span>
          ${this.restButtonHTML(s)}
        </div>
      </div>
    `;
  }

  private statusClass(s: Scholar): string {
    if (s.isResting) return 'resting';
    return s.isAvailable ? 'available' : 'working';
  }

  // Show a Rest / Wake button when the scholar is not locked on a project.
  // Working scholars (isAvailable=false AND isResting=false) get no button.
  private restButtonHTML(s: Scholar): string {
    const canToggle = s.isAvailable || s.isResting;
    if (!canToggle) return '';
    const label = s.isResting ? 'Wake' : 'Send to rest';
    const cls   = s.isResting ? 'sp-rest-btn sp-rest-btn-wake' : 'sp-rest-btn';
    return `<button class="${cls}" data-rest-id="${s.id}">${label}</button>`;
  }

  private stressTier(v: number): string {
    return v >= 0.6 ? 'high' : v >= 0.3 ? 'mid' : 'low';
  }
  private exhaustionTier(v: number): string {
    return v >= 0.6 ? 'high' : v >= 0.3 ? 'mid' : 'low';
  }
  private stressLabel(v: number): string {
    if (v >= 0.8) return 'Overwhelmed';
    if (v >= 0.6) return 'Strained';
    if (v >= 0.3) return 'Moderate';
    return 'Calm';
  }
  private exhaustionLabel(v: number): string {
    if (v >= 0.8) return 'Exhausted';
    if (v >= 0.6) return 'Fatigued';
    if (v >= 0.3) return 'Weary';
    return 'Rested';
  }

  // Morale is descriptive, derived from existing fields rather than a separate value.
  private moraleTier(s: Scholar): string {
    if (s.restlessFlagged) return 'low';
    const stress = s.stress ?? 0;
    const exhaustion = s.exhaustion ?? 0;
    if (stress >= 0.6 || exhaustion >= 0.7) return 'low';
    if (stress >= 0.3 || exhaustion >= 0.4) return 'mid';
    return 'high';
  }

  private moraleLabel(s: Scholar): string {
    if (s.restlessFlagged) return 'Restless';
    const tier = this.moraleTier(s);
    return tier === 'high' ? 'Contented' : tier === 'mid' ? 'Settled' : 'Strained';
  }

  private chemistryRowHTML(s: Scholar): string {
    // Find every other scholar with shared history.
    const entries = Game.state.scholars
      .filter(o => o.id !== s.id && getShared(s.id, o.id) > 0)
      .map(o => ({
        name: o.name.split(' ')[0],
        band: getBand(getScore(s.id, o.id)),
      }));
    if (entries.length === 0) return '';
    const chips = entries.map(e => `<span class="sp-chem-chip sp-chem-${e.band}">${e.name}: ${BAND_LABELS[e.band]}</span>`).join('');
    return `<div class="sp-chemistry">${chips}</div>`;
  }

  private dotsHTML(score: number): string {
    return `<span class="sp-dots">${
      Array.from({ length: 10 }, (_, i) => {
        const cls = i < score ? (score >= 8 ? 'filled high' : 'filled') : '';
        return `<span class="sp-dot ${cls}"></span>`;
      }).join('')
    }</span>`;
  }

  private getStatus(s: Scholar): string {
    if (s.isResting) return 'Resting';
    if (s.isAvailable) return 'Available';
    const project = Game.state.activeProject;
    if (project) {
      const topic  = TOPICS.find(t => t.id === project.topicId);
      const format = FORMATS.find(f => f.id === project.formatId);
      const summary = `${format?.name ?? 'Work'} on ${topic?.name ?? '…'}`;
      if (project.leadScholarId === s.id) return summary;
      if (project.assistantScholarIds.includes(s.id)) return `Assisting: ${summary}`;
    }
    return 'Unavailable';
  }

  // ── Events ──────────────────────────────────────────────────────

  private bindEvents() {
    const el = this.el!;

    el.querySelector('#sp-close')!.addEventListener('click', () => this.hide());
    el.addEventListener('click', e => { if (e.target === el) this.hide(); });

    el.querySelector('#sp-request-btn')?.addEventListener('click', () => this.requestCandidates());

    el.querySelectorAll<HTMLButtonElement>('.sp-hire-btn[data-candidate-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.candidateIdx);
        this.hireCandidate(idx);
      });
    });

    el.querySelectorAll<HTMLButtonElement>('.sp-rest-btn[data-rest-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.restId!;
        this.toggleRest(id);
      });
    });
  }

  // Toggle a scholar's rest state from the panel. Same mechanics as the
  // in-scene portrait click: resting flips them out of the project pool
  // and triples recovery rate. Auto-ends when fully recovered.
  private toggleRest(scholarId: string) {
    const scholar = Game.state.scholars.find(s => s.id === scholarId);
    if (!scholar) return;
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
    this.rebuild();
  }

  private requestCandidates() {
    if (this.recruitment.request()) {
      this.rebuild();
    }
  }

  private hireCandidate(idx: number) {
    const candidate = Game.state.currentCandidates[idx];
    if (!candidate) return;
    const joiningFee = candidate.salary * JOINING_FEE_MULTIPLIER;
    if (Game.state.treasury < joiningFee) return;

    if (this.onHireRequest) {
      // CampusScene handles the salary negotiation modal, then calls completeHire().
      this.onHireRequest(idx);
    } else {
      // Fallback: hire at asking salary if no negotiation flow is wired.
      this.completeHire(idx, 'asking');
    }
  }

  // Called by CampusScene after the salary deal is chosen.
  completeHire(idx: number, deal: SalaryDeal): boolean {
    const candidate = Game.state.currentCandidates[idx];
    if (!candidate) return false;

    // Salary tweak + initial restlessness/morale based on the deal.
    if (deal === 'above') {
      candidate.salary = Math.ceil(candidate.salary * 1.10);
      candidate.morale = Math.min(1, candidate.morale + 0.20);
      candidate.restlessness = Math.max(0, candidate.restlessness - 1);
    } else if (deal === 'below') {
      candidate.salary = Math.max(1, Math.floor(candidate.salary * 0.90));
      candidate.morale = Math.max(0, candidate.morale - 0.15);
      candidate.restlessness += 1;
    }

    const joiningFee = candidate.salary * JOINING_FEE_MULTIPLIER;
    if (Game.state.treasury < joiningFee) return false;

    Game.state.treasury -= joiningFee;
    Game.state.scholars.push(candidate);
    Game.state.currentCandidates.splice(idx, 1);

    Events.emit(GameEvents.TREASURY_CHANGED, { amount: Game.state.treasury });
    Events.emit(GameEvents.SCHOLAR_HIRED, { scholar: candidate });

    this.rebuild();
    return true;
  }

  private rebuild() {
    this.hide();
    this.show();
  }
}
