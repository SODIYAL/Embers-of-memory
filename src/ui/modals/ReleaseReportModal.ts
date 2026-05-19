import './modals.css';
import type { Work, QualityBreakdown } from '../../models/Work';
import { workParticipantIds, workRoleLabel } from '../../models/Work';
import { Game } from '../../game/GameManager';
import { getBand, BAND_LABELS, getScore, pairs } from '../../game/Chemistry';
import { AXIS_INFO } from '../../models/Ideology';
import type { IdeologyVector, IdeologyAxis } from '../../models/Ideology';
import { STAGE_INFO } from '../../models/Project';
import { STAGE_AXES, matchLabel } from '../../data/stageEmphasis';
import { computeFactionReactions } from '../../data/factionReactions';
import type { FactionReaction } from '../../data/factionReactions';

export class ReleaseReportModal {
  private el: HTMLElement | null = null;

  show(work: Work, onCollect: () => void) {
    if (this.el) return;

    const reactions = computeFactionReactions(work);

    this.el = document.createElement('div');
    this.el.className = 'modal-backdrop';
    this.el.innerHTML = `
      <div class="modal-card release-modal-card-v2">
        <div class="release-hero">
          <div class="release-eyebrow">Work Complete</div>
          <div class="release-title-v2">${work.title}</div>
          <div class="release-ornament">— ✦ —</div>
          <div class="release-quality-v2">${work.qualityDescriptor}</div>
          <div class="release-revenue-chip">+${work.revenue} gold</div>
        </div>

        ${this.criticsHTML(reactions)}
        ${this.stageApproachHTML(work)}
        ${work.breakdown ? this.breakdownHTML(work.breakdown, work) : ''}
        ${work.ideologyImprint ? this.imprintHTML(work.ideologyImprint) : ''}

        <div class="release-flavor-v2">${work.flavorReaction}</div>
        <button class="modal-btn release-collect-btn" id="release-collect">Collect</button>
      </div>
    `;
    document.getElementById('ui-layer')!.appendChild(this.el);

    this.el.querySelector('#release-collect')!.addEventListener('click', () => {
      this.hide();
      onCollect();
    });
  }

  hide() {
    this.el?.remove();
    this.el = null;
  }

  // ── Critics panel ───────────────────────────────────────────────────

  private criticsHTML(reactions: FactionReaction[]): string {
    const cards = reactions.map(r => `
      <div class="critic-card critic-band-${r.band}">
        <div class="critic-card-top">
          <span class="critic-faction">${r.factionName}</span>
          <span class="critic-rating">${this.nibsHTML(r.rating)}</span>
        </div>
        <div class="critic-quote">"${r.quote}"</div>
        <div class="critic-byline">— ${r.critic}, <span class="critic-outlet">${r.outlet}</span></div>
      </div>
    `).join('');
    return `
      <div class="release-section">
        <div class="release-section-heading">Critical Reception</div>
        <div class="critic-grid">${cards}</div>
      </div>
    `;
  }

  private nibsHTML(rating: number): string {
    const full = '◆';
    const empty = '◇';
    const out: string[] = [];
    for (let i = 0; i < 5; i++) out.push(i < rating ? full : empty);
    return `<span class="rating-nibs">${out.join('')}</span>`;
  }

  // ── Stage approach ──────────────────────────────────────────────────

  private stageApproachHTML(work: Work): string {
    if (!work.stages || work.stages.length === 0) return '';
    const rows: string[] = [];
    for (const stage of work.stages) {
      if (!stage.emphasis || stage.emphasisMatch === undefined) continue;
      const info = STAGE_INFO[stage.key];
      const axes = STAGE_AXES[stage.key];
      const mixChips = axes
        .filter(a => (stage.emphasis![a] ?? 0) > 0)
        .map(a => `<span class="release-stage-chip">${a} <em>${stage.emphasis![a]}</em></span>`)
        .join('');
      const m = matchLabel(stage.emphasisMatch);
      rows.push(`
        <div class="release-stage-row-v2">
          <div class="release-stage-name-v2">${info.label}</div>
          <div class="release-stage-mix-v2">${mixChips || '<span class="release-stage-chip neutral">Even split</span>'}</div>
          <div class="release-stage-match-v2 release-stage-match-${m.tone}">${m.label}</div>
        </div>
      `);
    }
    if (rows.length === 0) return '';
    return `
      <div class="release-section">
        <div class="release-section-heading">Stage Approach</div>
        ${rows.join('')}
      </div>
    `;
  }

  // ── Imprint chips ───────────────────────────────────────────────────

  private imprintHTML(imprint: IdeologyVector): string {
    const chips: string[] = [];
    for (const k of Object.keys(AXIS_INFO) as IdeologyAxis[]) {
      const v = imprint[k] ?? 0;
      if (Math.abs(v) < 1) continue;
      const info = AXIS_INFO[k];
      const side = v >= 0 ? info.positiveLabel : info.negativeLabel;
      chips.push(`<span class="release-imprint-chip ${v >= 0 ? 'pos' : 'neg'}">${side} ${v >= 0 ? '+' : ''}${v.toFixed(0)}</span>`);
    }
    if (chips.length === 0) return '';
    return `
      <div class="release-section release-section-tight">
        <div class="release-section-heading">Ideological Imprint</div>
        <div class="release-imprint-chips">${chips.join(' ')}</div>
      </div>
    `;
  }

  // ── Quality breakdown ───────────────────────────────────────────────

  private breakdownHTML(b: QualityBreakdown, work: Work): string {
    const rows = [
      this.row('Skill',         b.skill),
      this.row('Synergy',       b.synergy,       b.synergyLabel),
      this.row('Priorities',    b.priorities),
      this.row('Wellbeing',     b.wellbeing,     b.wellbeing < 0 ? 'penalty' : ''),
      b.collaboration > 0 ? this.row('Collaboration', b.collaboration) : '',
      Math.abs(b.chemistry) >= 0.01 ? this.row('Chemistry', b.chemistry) : '',
      b.institution > 0 ? this.row('Institution', b.institution) : '',
      this.row('Variance',      b.variance),
    ].filter(Boolean).join('');

    return `
      <div class="release-section release-section-collapsible">
        <details class="release-details">
          <summary class="release-section-heading release-details-summary">Quality Breakdown <span class="release-details-arrow">▾</span></summary>
          <div class="release-details-body">
            ${rows}
            ${this.chemistryRowsHTML(work)}
            ${this.xpRowsHTML(work)}
          </div>
        </details>
      </div>
    `;
  }

  private chemistryRowsHTML(work: Work): string {
    const teamIds = workParticipantIds(work);
    if (teamIds.length < 2) return '';

    const firstName = (id: string) =>
      Game.state.scholars.find(s => s.id === id)?.name.split(' ')[0] ?? id;

    return pairs(teamIds).map(([a, b]) => {
      const band = getBand(getScore(a, b));
      return `
        <div class="release-breakdown-row release-breakdown-chem">
          <span class="release-breakdown-label">${firstName(a)} & ${firstName(b)}</span>
          <span class="release-breakdown-value">${BAND_LABELS[band]}</span>
        </div>
      `;
    }).join('');
  }

  private xpRowsHTML(work: Work): string {
    if (work.xpByScholar && Object.keys(work.xpByScholar).length > 0) {
      const rows = Object.entries(work.xpByScholar).map(([id, xp]) => {
        const scholar = Game.state.scholars.find(s => s.id === id);
        if (!scholar) return '';
        const firstName = scholar.name.split(' ')[0];
        const role = workRoleLabel(work, id);
        return `
          <div class="release-breakdown-row release-breakdown-xp">
            <span class="release-breakdown-label">${firstName} <span class="release-breakdown-note">(${role})</span></span>
            <span class="release-breakdown-value">+${xp} XP</span>
          </div>
        `;
      }).filter(Boolean).join('');
      return rows;
    }
    if (work.xpGained != null) {
      return `
        <div class="release-breakdown-row release-breakdown-xp">
          <span class="release-breakdown-label">Scholar XP earned</span>
          <span class="release-breakdown-value">+${work.xpGained}</span>
        </div>
      `;
    }
    return '';
  }

  private row(label: string, value: number, note: string = ''): string {
    const sign = value > 0 ? '+' : value < 0 ? '−' : '';
    const abs  = Math.abs(value);
    const fmt  = abs < 0.01 ? '0.00' : abs.toFixed(2);
    const cls  = value > 0 ? 'pos' : value < 0 ? 'neg' : 'zero';
    return `
      <div class="release-breakdown-row">
        <span class="release-breakdown-label">${label}${note ? ` <span class="release-breakdown-note">(${note})</span>` : ''}</span>
        <span class="release-breakdown-value ${cls}">${sign}${fmt}</span>
      </div>
    `;
  }
}
