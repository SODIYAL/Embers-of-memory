import './ideology-panel.css';
import { Game } from '../../game/GameManager';
import { AXIS_INFO, FACTION_INFO } from '../../models/Ideology';
import type { IdeologyAxis, IdeologyVector, FactionId } from '../../models/Ideology';
import { TOPICS } from '../../data/topics';
import { FORMATS } from '../../data/formats';
import type { Work } from '../../models/Work';

export class IdeologyPanel {
  private el: HTMLElement | null = null;

  show() {
    if (this.el) return;
    this.el = document.createElement('div');
    this.el.className = 'ideology-panel-backdrop';
    this.el.innerHTML = this.buildHTML();
    document.getElementById('ui-layer')!.appendChild(this.el);
    this.bindEvents();
  }

  hide() {
    this.el?.remove();
    this.el = null;
  }

  isOpen() { return this.el !== null; }

  private bindEvents() {
    const el = this.el!;
    el.querySelector('#ip-close')!.addEventListener('click', () => this.hide());
    el.addEventListener('click', e => { if (e.target === el) this.hide(); });
  }

  private buildHTML(): string {
    const ideology = Game.state.ideology;

    const axisRows = (Object.keys(AXIS_INFO) as IdeologyAxis[])
      .map(k => this.axisRowHTML(k, ideology.axes[k]))
      .join('');

    const factionRows = (Object.keys(FACTION_INFO) as FactionId[])
      .map(k => this.factionRowHTML(k, ideology.factions[k]))
      .join('');

    const recent = [...Game.state.completedWorks]
      .filter(w => w.ideologyImprint)
      .slice(-5)
      .reverse();
    const imprintRows = recent.length === 0
      ? `<div class="ip-empty">No works published yet — the institution has no stance to speak of.</div>`
      : recent.map(w => this.imprintRowHTML(w)).join('');

    return `
      <div class="ideology-panel">
        <div class="ip-header">
          <h2 class="ip-title">The Institution's Stance</h2>
          <button class="ip-close" id="ip-close">✕</button>
        </div>

        <div class="ip-section">
          <div class="ip-section-heading">Ideological axes</div>
          <div class="ip-axes">${axisRows}</div>
        </div>

        <div class="ip-section">
          <div class="ip-section-heading">Faction standings</div>
          <div class="ip-factions">${factionRows}</div>
        </div>

        <div class="ip-section">
          <div class="ip-section-heading">Recent imprints</div>
          <div class="ip-imprints">${imprintRows}</div>
        </div>
      </div>
    `;
  }

  private axisRowHTML(axis: IdeologyAxis, value: number): string {
    const info = AXIS_INFO[axis];
    // Convert -100..+100 to a 0..100 percentage for the marker position
    const pct = ((value + 100) / 200) * 100;
    const stanceLabel = this.stanceLabel(axis, value);
    return `
      <div class="ip-axis">
        <div class="ip-axis-header">
          <span class="ip-axis-neg">${info.negativeLabel}</span>
          <span class="ip-axis-name">${info.shortLabel}</span>
          <span class="ip-axis-pos">${info.positiveLabel}</span>
        </div>
        <div class="ip-axis-bar">
          <div class="ip-axis-track"></div>
          <div class="ip-axis-center"></div>
          <div class="ip-axis-marker" style="left: ${pct}%"></div>
        </div>
        <div class="ip-axis-stance">${stanceLabel} <span class="ip-axis-value">(${value >= 0 ? '+' : ''}${Math.round(value)})</span></div>
      </div>
    `;
  }

  private stanceLabel(axis: IdeologyAxis, value: number): string {
    const info = AXIS_INFO[axis];
    const abs = Math.abs(value);
    const side = value >= 0 ? info.positiveLabel : info.negativeLabel;
    if (abs < 10) return 'Balanced';
    if (abs < 30) return `Leans ${side}`;
    if (abs < 60) return side;
    return `Strongly ${side}`;
  }

  private factionRowHTML(factionId: FactionId, standing: number): string {
    const info = FACTION_INFO[factionId];
    const tone = standing >= 50  ? 'allied'
              : standing >= 20  ? 'friendly'
              : standing > -20  ? 'neutral'
              : standing > -50  ? 'unfriendly'
              :                   'hostile';
    const toneLabel = tone.charAt(0).toUpperCase() + tone.slice(1);
    return `
      <div class="ip-faction ip-faction-${tone}">
        <div class="ip-faction-head">
          <span class="ip-faction-name">${info.name}</span>
          <span class="ip-faction-tone">${toneLabel} (${standing >= 0 ? '+' : ''}${Math.round(standing)})</span>
        </div>
        <div class="ip-faction-flavor">${info.flavor}</div>
      </div>
    `;
  }

  private imprintRowHTML(work: Work): string {
    const topic  = TOPICS.find(t => t.id === work.topicId);
    const format = FORMATS.find(f => f.id === work.formatId);
    const imprint = work.ideologyImprint ?? {};
    return `
      <div class="ip-imprint">
        <div class="ip-imprint-title">${format?.name ?? ''} on ${topic?.name ?? ''}</div>
        <div class="ip-imprint-axes">${this.formatImprint(imprint)}</div>
      </div>
    `;
  }

  private formatImprint(imprint: IdeologyVector): string {
    const parts: string[] = [];
    for (const k of Object.keys(AXIS_INFO) as IdeologyAxis[]) {
      const v = imprint[k] ?? 0;
      if (Math.abs(v) < 1) continue;
      const info = AXIS_INFO[k];
      const dir = v > 0 ? info.positiveLabel : info.negativeLabel;
      parts.push(`<span class="ip-imp-chip ${v > 0 ? 'pos' : 'neg'}">${dir} ${v >= 0 ? '+' : ''}${v.toFixed(0)}</span>`);
    }
    return parts.length === 0 ? '<span class="ip-imp-neutral">No strong stance</span>' : parts.join(' ');
  }
}
