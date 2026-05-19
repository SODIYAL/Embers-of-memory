import './world-panel.css';
import { Game } from '../../game/GameManager';
import { RIVALS } from '../../data/rivals';
import { WORLD_EVENTS } from '../../data/worldEvents';

export class WorldPanel {
  private el: HTMLElement | null = null;

  show() {
    if (this.el) return;
    this.el = document.createElement('div');
    this.el.className = 'world-panel-backdrop';
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
    el.querySelector('#wp-close')!.addEventListener('click', () => this.hide());
    el.addEventListener('click', e => { if (e.target === el) this.hide(); });
  }

  private buildHTML(): string {
    const rivals = Game.state.world.rivals
      .map(state => {
        const def = RIVALS.find(r => r.id === state.rivalId);
        if (!def) return '';
        const daysToNext = Math.max(0, state.nextReleaseDay - Game.state.day);
        return `
          <div class="wp-rival">
            <div class="wp-rival-head">
              <span class="wp-rival-name">${def.name}</span>
              <span class="wp-rival-prestige">Prestige ${state.prestige}</span>
            </div>
            <div class="wp-rival-flavor">${def.flavor}</div>
            <div class="wp-rival-stats">
              <span>Focus: ${def.focusDisciplines.join(', ')}</span>
              <span>Works: ${state.worksReleased}</span>
              <span>Next release: ~${daysToNext}d</span>
            </div>
          </div>
        `;
      })
      .join('');

    const active = Game.state.world.activeWorldEvents.map(a => {
      const def = WORLD_EVENTS.find(e => e.id === a.eventId);
      if (!def) return '';
      const daysLeft = Math.max(0, a.endDay - Game.state.day);
      return `
        <div class="wp-event">
          <div class="wp-event-name">${def.name} <span class="wp-event-days">${daysLeft}d left</span></div>
          <div class="wp-event-flavor">${def.flavor}</div>
          ${this.demandModHTML(def)}
        </div>
      `;
    }).join('');
    const activeHTML = active || `<div class="wp-empty">The world is quiet — for now.</div>`;

    const releases = [...Game.state.world.recentReleases].slice(-8).reverse().map(r => `
      <div class="wp-release">
        <span class="wp-release-author">${r.rivalName}</span>
        <span class="wp-release-title">${r.formatName} on ${r.topicName}</span>
        <span class="wp-release-day">Day ${r.releaseDay}</span>
      </div>
    `).join('');
    const releasesHTML = releases || `<div class="wp-empty">No rival works have crossed the institution's notice yet.</div>`;

    return `
      <div class="world-panel">
        <div class="wp-header">
          <h2 class="wp-title">The Wider World</h2>
          <button class="wp-close" id="wp-close">✕</button>
        </div>

        <div class="wp-section">
          <div class="wp-section-heading">Rival institutions</div>
          ${rivals}
        </div>

        <div class="wp-section">
          <div class="wp-section-heading">Active world events</div>
          ${activeHTML}
        </div>

        <div class="wp-section">
          <div class="wp-section-heading">Recent rival releases</div>
          ${releasesHTML}
        </div>
      </div>
    `;
  }

  private demandModHTML(def: typeof WORLD_EVENTS[number]): string {
    if (!def.topicDemandMod) return '';
    const chips = Object.entries(def.topicDemandMod).map(([topic, mult]) => {
      const pct = Math.round((mult - 1) * 100);
      const tone = pct > 0 ? 'pos' : 'neg';
      return `<span class="wp-demand-chip ${tone}">${topic} ${pct >= 0 ? '+' : ''}${pct}%</span>`;
    }).join(' ');
    return `<div class="wp-event-demand">${chips}</div>`;
  }
}
