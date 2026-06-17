import './treasury-panel.css';
import { Game } from '../../game/GameManager';
import { EconomySystem } from '../../systems/EconomySystem';
import { ReprintSystem, REPRINT_DURATION_DAYS, REPRINT_REVENUE_FRACTION } from '../../systems/ReprintSystem';
import type { Work } from '../../models/Work';

export class TreasuryPanel {
  private el: HTMLElement | null = null;
  private economy: EconomySystem;
  private reprints: ReprintSystem;

  constructor(economy: EconomySystem, reprints: ReprintSystem) {
    this.economy = economy;
    this.reprints = reprints;
  }

  show() {
    if (this.el) return;
    this.el = document.createElement('div');
    this.el.className = 'treasury-panel-backdrop';
    this.el.innerHTML = this.buildHTML();
    document.getElementById('ui-layer')!.appendChild(this.el);
    this.bindEvents();
  }

  hide() {
    this.el?.remove();
    this.el = null;
  }

  isOpen() { return this.el !== null; }

  private rebuild() { this.hide(); this.show(); }

  // ── HTML ────────────────────────────────────────────────────────

  private buildHTML(): string {
    const treasury  = Game.state.treasury;
    const salaries  = this.economy.monthlySalaries();
    const upkeep    = this.economy.monthlyFacilityUpkeep();
    const ops       = this.economy.monthlyOperationalCost();
    const stipends  = this.economy.monthlyStipendsIncome();
    const backlist  = Math.round(this.economy.monthlyBacklistIncome());
    const donations = this.economy.expectedMonthlyDonation();
    const expense   = salaries + upkeep + ops;
    const income    = Math.round(stipends + backlist + donations);
    const net       = income - expense;
    const runway    = this.economy.runwayMonths();
    const runwayLabel = runway === Infinity ? 'indefinite' : `~${runway} month${runway === 1 ? '' : 's'}`;

    const tier = Game.state.treasuryWarningTier;
    const state: 'prosperous' | 'stable' | 'strained' | 'critical' =
      tier === 'critical' ? 'critical' :
      tier === 'strained' ? 'strained' :
      treasury >= 300     ? 'prosperous' :
                            'stable';
    const stateLabel = state.charAt(0).toUpperCase() + state.slice(1);

    return `
      <div class="treasury-panel">
        <div class="tp-header">
          <h2 class="tp-title">Treasury Ledger</h2>
          <button class="tp-close" id="tp-close">✕</button>
        </div>
        <div class="tp-body">
          <div class="tp-summary tp-summary-${state}">
            <div class="tp-balance">${treasury} gold</div>
            <div class="tp-state">${stateLabel}</div>
            <div class="tp-runway">Runway at current burn: ${runwayLabel}</div>
          </div>

          <div class="tp-columns">
            <div class="tp-col">
              <h3 class="tp-col-heading">Monthly income</h3>
              <div class="tp-row"><span>Patron stipends</span><span class="tp-pos">+${stipends}</span></div>
              <div class="tp-row"><span>Backlist trickle</span><span class="tp-pos">+${backlist}</span></div>
              <div class="tp-row"><span>Alms &amp; gifts <em class="tp-variable">(varies)</em></span><span class="tp-pos">~+${donations}</span></div>
              <div class="tp-row tp-row-total"><span>Total</span><span class="tp-pos">+${income}</span></div>
            </div>
            <div class="tp-col">
              <h3 class="tp-col-heading">Monthly expenses</h3>
              <div class="tp-row"><span>Scholar salaries</span><span class="tp-neg">−${salaries}</span></div>
              <div class="tp-row"><span>Facility upkeep</span><span class="tp-neg">−${upkeep}</span></div>
              <div class="tp-row"><span>Operational costs</span><span class="tp-neg">−${ops}</span></div>
              <div class="tp-row tp-row-total"><span>Total</span><span class="tp-neg">−${expense}</span></div>
            </div>
          </div>

          <div class="tp-net">
            Net per month: <span class="${net >= 0 ? 'tp-pos' : 'tp-neg'}">${net >= 0 ? '+' : ''}${net}</span>
          </div>

          ${this.patronsSectionHTML()}
          ${this.commissionSectionHTML()}
          ${this.recentReleasesSectionHTML()}
          ${this.reprintsSectionHTML()}
          ${this.emergencySectionHTML()}
        </div>
      </div>
    `;
  }

  private patronsSectionHTML(): string {
    const patrons = Game.state.majorPatrons;
    if (patrons.length === 0) return '';
    return `
      <hr class="tp-divider">
      <h3 class="tp-section-heading">Major Patrons</h3>
      <div class="tp-patrons">
        ${patrons.map(p => `
          <div class="tp-patron">
            <div class="tp-patron-row">
              <span class="tp-patron-name">${p.name}</span>
              <span class="tp-patron-stipend">+${p.stipend} / mo</span>
            </div>
            <div class="tp-patron-meta">
              ${p.expectsDiscipline ? `Expects work in ${p.expectsDiscipline} · ` : ''}Patience: ${p.patience}/12
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  private commissionSectionHTML(): string {
    const active = Game.state.activeCommission;
    if (!active) return '';
    return `
      <hr class="tp-divider">
      <h3 class="tp-section-heading">Active Commission</h3>
      <div class="tp-commission">
        <strong>${active.patronName}</strong> awaits a work on the agreed terms — ${active.payment} gold on delivery.
      </div>
    `;
  }

  private emergencySectionHTML(): string {
    const critical = Game.state.treasuryWarningTier === 'critical';
    if (!critical) return '';

    const canAppeal = this.economy.canPatronAppeal();
    const sellableWorks = Game.state.completedWorks.filter(
      w => !Game.state.workRightsSold.includes(w.id),
    );

    return `
      <hr class="tp-divider">
      <h3 class="tp-section-heading">Emergency Measures</h3>
      <p class="tp-emergency-blurb">Times are dire. Levers exist, but each one carries a cost.</p>
      <button class="tp-emergency-btn" id="tp-patron-appeal" ${canAppeal ? '' : 'disabled'}>
        ${Game.state.patronAppealUsed
          ? 'Patron appeal already spent'
          : canAppeal
            ? 'Appeal to your patrons · +200 gold, patience drops sharply'
            : 'Patron appeal requires at least one active patron'}
      </button>
      ${sellableWorks.length > 0 ? `
        <div class="tp-sell-section">
          <p class="tp-sell-heading">Or license a work's copying rights for a lump sum:</p>
          <div class="tp-sell-list">
            ${sellableWorks.map(w => this.sellWorkRowHTML(w)).join('')}
          </div>
        </div>
      ` : ''}
    `;
  }

  private sellWorkRowHTML(work: Work): string {
    return `
      <div class="tp-sell-row">
        <span class="tp-sell-title">${work.title}</span>
        <button class="tp-sell-btn" data-work="${work.id}">Sell rights</button>
      </div>
    `;
  }

  private recentReleasesSectionHTML(): string {
    // Works currently selling (window not yet complete)
    const selling = Game.state.completedWorks.filter(w => w.salesState && !w.salesState.complete);
    // Recently-completed sales (last 3 with completed windows, for context)
    const recentlyFinished = Game.state.completedWorks
      .filter(w => w.salesState?.complete)
      .slice(-3)
      .reverse();

    if (selling.length === 0 && recentlyFinished.length === 0) return '';

    const sellingHTML = selling.map(w => {
      const s = w.salesState!;
      const pct = Math.round((s.daysActive / Math.max(1, s.daysActive + (s.endDay - Game.state.day))) * 100);
      const earnedPct = s.projectedTotal > 0
        ? Math.round((s.earnedTotal / s.projectedTotal) * 100)
        : 0;
      const reception = receptionLabel(earnedPct, s.daysActive);
      const daysLeft = Math.max(0, s.endDay - Game.state.day);
      return `
        <div class="tp-release-row">
          <div class="tp-release-head">
            <span class="tp-release-title">${w.title}</span>
            <span class="tp-release-reception ${reception.cls}">${reception.label}</span>
          </div>
          <div class="tp-release-meta">
            <span>Day ${s.daysActive} / ${s.daysActive + daysLeft}</span>
            <span>·</span>
            <span>${s.earnedTotal} of ~${s.projectedTotal} gold</span>
            <span>·</span>
            <span>${daysLeft}d left</span>
          </div>
          <div class="tp-release-bar">
            <div class="tp-release-fill" style="width: ${Math.min(100, earnedPct)}%"></div>
            <div class="tp-release-time" style="left: ${Math.min(100, pct)}%"></div>
          </div>
        </div>
      `;
    }).join('');

    const finishedHTML = recentlyFinished.map(w => {
      const s = w.salesState!;
      const ratio = s.projectedTotal > 0 ? s.earnedTotal / s.projectedTotal : 1;
      const tone = ratio >= 1.05 ? 'beat'
                : ratio >= 0.85 ? 'met'
                :                 'missed';
      const toneLabel = tone === 'beat'   ? 'Outperformed'
                     : tone === 'met'    ? 'Met expectations'
                     :                     'Underperformed';
      return `
        <div class="tp-release-row tp-release-row-done">
          <div class="tp-release-head">
            <span class="tp-release-title">${w.title}</span>
            <span class="tp-release-reception tier-${tone}">${toneLabel}</span>
          </div>
          <div class="tp-release-meta">
            <span>${s.earnedTotal} of ~${s.projectedTotal} gold over ${s.endDay - s.startDay}d</span>
          </div>
        </div>
      `;
    }).join('');

    return `
      <hr class="tp-divider">
      <h3 class="tp-section-heading">Recent Releases</h3>
      ${selling.length > 0 ? `<div class="tp-release-list">${sellingHTML}</div>` : ''}
      ${recentlyFinished.length > 0 ? `<div class="tp-release-list tp-release-list-done">${finishedHTML}</div>` : ''}
    `;
  }

  private reprintsSectionHTML(): string {
    // Eligible: any completed celebrated/landmark work that passes canReprint.
    const candidates = Game.state.completedWorks.filter(w => this.reprints.canReprint(w).ok);
    const inFlight = Game.state.activeReprints;

    if (candidates.length === 0 && inFlight.length === 0) return '';

    const inFlightHTML = inFlight.length === 0 ? '' : `
      <div class="tp-reprint-active-list">
        ${inFlight.map(r => {
          const work = Game.state.completedWorks.find(w => w.id === r.workId);
          const daysLeft = Math.max(0, r.finishDay - Game.state.day);
          return `
            <div class="tp-reprint-row tp-reprint-row-active">
              <span class="tp-reprint-title">${work?.title ?? r.workId}</span>
              <span class="tp-reprint-status">~${daysLeft}d · +${r.projectedRevenue} on completion</span>
            </div>
          `;
        }).join('')}
      </div>
    `;

    const eligibleHTML = candidates.length === 0 ? '' : `
      <p class="tp-reprint-blurb">Renowned works can be reprinted to bring in fresh revenue (${REPRINT_DURATION_DAYS} days; ~${Math.round(REPRINT_REVENUE_FRACTION * 100)}% of the work's original earnings).</p>
      <div class="tp-reprint-list">
        ${candidates.map(w => `
          <div class="tp-reprint-row">
            <span class="tp-reprint-title">${w.title}</span>
            <span class="tp-reprint-payout">+${Math.round(w.revenue * REPRINT_REVENUE_FRACTION)}</span>
            <button class="tp-reprint-btn" data-work="${w.id}">Reprint</button>
          </div>
        `).join('')}
      </div>
    `;

    return `
      <hr class="tp-divider">
      <h3 class="tp-section-heading">Reprints</h3>
      ${inFlightHTML}
      ${eligibleHTML}
    `;
  }

  // ── Events ───────────────────────────────────────────────────────

  private bindEvents() {
    const el = this.el!;
    el.querySelector('#tp-close')!.addEventListener('click', () => this.hide());
    el.addEventListener('click', e => { if (e.target === el) this.hide(); });

    el.querySelector<HTMLButtonElement>('#tp-patron-appeal')?.addEventListener('click', () => {
      if (this.economy.patronAppeal()) this.rebuild();
    });

    el.querySelectorAll<HTMLButtonElement>('.tp-sell-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const workId = btn.dataset.work!;
        if (this.economy.sellWorkRights(workId)) this.rebuild();
      });
    });

    el.querySelectorAll<HTMLButtonElement>('.tp-reprint-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const workId = btn.dataset.work!;
        this.reprints.startReprint(workId);
        this.rebuild();
      });
    });
  }
}

// Reception label for an in-flight sales window. Compares earned-pct to
// expected pct based on how far through the window we are. The exponential
// curve front-loads, so e.g. by day 15 of 90 we expect ~50% of total.
function receptionLabel(earnedPct: number, daysActive: number): { label: string; cls: string } {
  // Expected fraction by now under the exp-decay curve (rough approximation).
  // We use 1 - exp(-t/τ) with τ ≈ 22d, matching SalesSystem's curve.
  const expected = (1 - Math.exp(-daysActive / 22)) * 100;
  const delta = earnedPct - expected;
  if (delta >=  15) return { label: 'On fire',     cls: 'tier-on-fire' };
  if (delta >=   5) return { label: 'Selling well', cls: 'tier-good' };
  if (delta >= -10) return { label: 'Steady',       cls: 'tier-steady' };
  if (delta >= -25) return { label: 'Slow',         cls: 'tier-slow' };
  return { label: 'Quiet', cls: 'tier-quiet' };
}
