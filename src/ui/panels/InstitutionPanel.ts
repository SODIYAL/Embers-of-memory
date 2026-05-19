import './institution-panel.css';
import { Game } from '../../game/GameManager';
import { InstitutionSystem } from '../../systems/InstitutionSystem';
import { zoneById, facilityById } from '../../data/institution';
import { TOPICS } from '../../data/topics';
import { FORMATS } from '../../data/formats';

function escalationLabel(kind: 'controversy' | 'dispute' | 'missing_source'): string {
  return kind === 'controversy'     ? 'Controversy'
       : kind === 'dispute'         ? 'Dispute'
       :                              'Missing source';
}

const TIER_NAMES: Record<1 | 2 | 3, string> = {
  1: 'Founding Hall',
  2: 'Academy',
  3: 'University',
};

type Tab = 'campus' | 'departments';

export class InstitutionPanel {
  private el: HTMLElement | null = null;
  private institution: InstitutionSystem;
  private activeTab: Tab = 'campus';

  // Department-founding form state
  private foundingDiscipline: string | null = null;
  private foundingHeadId: string | null = null;
  private foundingName = '';
  private foundingMandate = '';

  constructor(institution: InstitutionSystem) {
    this.institution = institution;
  }

  show() {
    if (this.el) return;
    this.el = document.createElement('div');
    this.el.className = 'institution-panel-backdrop';
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

  // ── HTML ─────────────────────────────────────────────────────────

  private buildHTML(): string {
    return `
      <div class="institution-panel">
        <div class="ip-header">
          <h2 class="ip-title">${Game.state.institutionName} <span class="ip-tier">· ${TIER_NAMES[Game.state.tier]}</span></h2>
          <button class="ip-close" id="ip-close">✕</button>
        </div>
        <div class="ip-tabs">
          <button class="ip-tab ${this.activeTab === 'campus' ? 'active' : ''}" data-tab="campus">Campus</button>
          <button class="ip-tab ${this.activeTab === 'departments' ? 'active' : ''}" data-tab="departments">Departments</button>
        </div>
        <div class="ip-body">
          ${this.activeTab === 'campus' ? this.campusHTML() : this.departmentsHTML()}
        </div>
      </div>
    `;
  }

  // ── Campus tab ──────────────────────────────────────────────────

  private campusHTML(): string {
    const zones = this.institution.listZones();
    return `
      <p class="ip-tier-summary">Treasury ${Game.state.treasury} gold · Prestige ${Game.state.prestige} · ${Game.state.scholars.length} scholars</p>
      <div class="ip-zones">
        ${zones.map(z => this.zoneCardHTML(z.id)).join('')}
      </div>
    `;
  }

  private zoneCardHTML(zoneId: string): string {
    const zone = zoneById(zoneId)!;
    const unlocked = this.institution.zoneUnlocked(zoneId);
    const facilities = this.institution.listFacilitiesInZone(zoneId);

    if (!unlocked) {
      const check = this.institution.canUnlockZone(zoneId);
      const reason = check.ok ? '' : check.reason ?? '';
      return `
        <div class="ip-zone ip-zone-locked">
          <div class="ip-zone-head">
            <span class="ip-zone-name">${zone.name}</span>
            <span class="ip-zone-cost">${zone.unlockCost} gold</span>
          </div>
          <p class="ip-zone-thematic">${zone.thematicLine}</p>
          <button class="ip-zone-unlock" data-zone="${zoneId}" ${check.ok ? '' : 'disabled'}>
            ${check.ok ? 'Unlock zone' : reason}
          </button>
        </div>
      `;
    }

    return `
      <div class="ip-zone">
        <div class="ip-zone-head">
          <span class="ip-zone-name">${zone.name}</span>
          <span class="ip-zone-built">Unlocked</span>
        </div>
        <p class="ip-zone-thematic">${zone.thematicLine}</p>
        <div class="ip-facilities">
          ${facilities.length > 0
            ? facilities.map(f => this.facilityRowHTML(f.id)).join('')
            : '<p class="ip-empty">No facilities defined for this zone.</p>'}
        </div>
      </div>
    `;
  }

  private facilityRowHTML(facilityId: string): string {
    const fac = facilityById(facilityId)!;
    const tier = this.institution.facilityTier(facilityId);
    const buildCheck   = this.institution.canBuildFacility(facilityId);
    const upgradeCheck = this.institution.canUpgradeFacility(facilityId);

    let actionHTML: string;
    if (tier === 0) {
      actionHTML = `<button class="ip-fac-btn" data-action="build" data-fac="${facilityId}" ${buildCheck.ok ? '' : 'disabled'}>
        ${buildCheck.ok ? `Build · ${fac.buildCost} gold` : (buildCheck.reason ?? 'cannot build')}
      </button>`;
    } else if (tier >= fac.maxTier) {
      actionHTML = `<span class="ip-fac-maxed">Tier ${tier} (max)</span>`;
    } else {
      actionHTML = `<button class="ip-fac-btn" data-action="upgrade" data-fac="${facilityId}" ${upgradeCheck.ok ? '' : 'disabled'}>
        ${upgradeCheck.ok ? `Upgrade to tier ${tier + 1} · ${fac.upgradeCost} gold` : (upgradeCheck.reason ?? 'cannot upgrade')}
      </button>`;
    }

    return `
      <div class="ip-facility ${tier > 0 ? 'ip-facility-built' : ''}">
        <div class="ip-fac-name">${fac.name}${tier > 0 ? ` · tier ${tier}/${fac.maxTier}` : ''}</div>
        <p class="ip-fac-blurb">${fac.blurb}</p>
        ${actionHTML}
      </div>
    `;
  }

  // ── Departments tab ─────────────────────────────────────────────

  private departmentsHTML(): string {
    const existing = Game.state.departments;
    const eligible = this.institution.eligibleDepartmentDisciplines();

    return `
      <div class="ip-dept-section">
        <h3 class="ip-section-heading">Active Departments (${existing.length})</h3>
        ${existing.length > 0
          ? `<div class="ip-dept-list">${existing.map(d => this.departmentCardHTML(d.id)).join('')}</div>`
          : '<p class="ip-empty">No departments yet.</p>'}
      </div>
      <hr class="ip-divider">
      <div class="ip-dept-section">
        <h3 class="ip-section-heading">Found a New Department</h3>
        ${eligible.length === 0
          ? '<p class="ip-empty">A department requires at least 3 scholars of the same primary discipline. None qualify yet.</p>'
          : this.foundFormHTML(eligible)}
      </div>
    `;
  }

  private departmentCardHTML(deptId: string): string {
    const dept = Game.state.departments.find(d => d.id === deptId)!;
    const head = Game.state.scholars.find(s => s.id === dept.headScholarId);
    const members = Game.state.scholars.filter(s => s.primaryDiscipline === dept.discipline).length;

    // Active project status
    const proj = dept.activeProjectId
      ? Game.state.departmentProjects.find(p => p.id === dept.activeProjectId)
      : undefined;
    const projHTML = proj ? this.departmentProjectHTML(proj) : '<div class="ip-dept-idle">Awaiting their next proposal…</div>';

    const moralePct = Math.round((dept.morale ?? 0.7) * 100);
    const moraleTone = moralePct >= 70 ? 'good' : moralePct >= 40 ? 'mid' : 'low';

    return `
      <div class="ip-dept-card">
        <div class="ip-dept-head-row">
          <span class="ip-dept-name">${dept.name}</span>
          <button class="ip-dept-disband" data-dept="${dept.id}">Disband</button>
        </div>
        <div class="ip-dept-meta">${dept.discipline} · ${members} scholar${members === 1 ? '' : 's'} · Head: ${head?.name ?? '—'}</div>
        <p class="ip-dept-mandate">${dept.mandate}</p>
        <div class="ip-dept-morale">
          <span class="ip-dept-morale-label">Morale</span>
          <div class="ip-dept-morale-bar"><div class="ip-dept-morale-fill ${moraleTone}" style="width: ${moralePct}%"></div></div>
        </div>
        ${projHTML}
      </div>
    `;
  }

  private departmentProjectHTML(proj: import('../../models/GameState').DepartmentProject): string {
    const topic = TOPICS.find(t => t.id === proj.topicId);
    const format = FORMATS.find(f => f.id === proj.formatId);
    const pct = Math.round(proj.progress * 100);
    const status = proj.escalation
      ? `<span class="ip-dept-escalated">⚠ ${escalationLabel(proj.escalation.kind)} — paused</span>`
      : `<span class="ip-dept-progress-pct">${pct}%</span>`;
    return `
      <div class="ip-dept-project">
        <div class="ip-dept-project-title">${format?.name ?? ''} on ${topic?.name ?? ''}</div>
        <div class="ip-dept-project-bar">
          <div class="ip-dept-project-fill" style="width: ${pct}%"></div>
        </div>
        <div class="ip-dept-project-status">${status}</div>
      </div>
    `;
  }

  private foundFormHTML(eligible: string[]): string {
    const disc  = this.foundingDiscipline ?? eligible[0];
    if (!this.foundingDiscipline) this.foundingDiscipline = disc;
    const heads = this.institution.eligibleHeadsFor(disc);
    if (heads.length > 0 && !this.foundingHeadId) this.foundingHeadId = heads[0];

    const disabled = !this.foundingDiscipline || !this.foundingHeadId || !this.foundingName.trim();

    return `
      <div class="ip-found-form">
        <div class="ip-form-row">
          <label>Discipline</label>
          <select id="ip-discipline">
            ${eligible.map(d => `<option value="${d}" ${d === disc ? 'selected' : ''}>${d}</option>`).join('')}
          </select>
        </div>
        <div class="ip-form-row">
          <label>Head</label>
          <select id="ip-head">
            ${heads.map(id => {
              const s = Game.state.scholars.find(sc => sc.id === id)!;
              return `<option value="${id}" ${id === this.foundingHeadId ? 'selected' : ''}>${s.name} · skill ${s.disciplines[disc] ?? 0}/10</option>`;
            }).join('')}
          </select>
        </div>
        <div class="ip-form-row">
          <label>Department name</label>
          <input id="ip-dept-name" type="text" maxlength="40" placeholder="e.g. The College of Stars" value="${this.foundingName.replace(/"/g, '&quot;')}">
        </div>
        <div class="ip-form-row">
          <label>Mandate</label>
          <textarea id="ip-dept-mandate" maxlength="160" placeholder="A short statement of purpose">${this.foundingMandate}</textarea>
        </div>
        <button class="ip-found-btn" id="ip-found-btn" ${disabled ? 'disabled' : ''}>
          Found department
        </button>
        <p class="ip-form-note">Department head adds a +${(0.02).toFixed(2)} quality bonus to all projects in this discipline.</p>
      </div>
    `;
  }

  // ── Events ───────────────────────────────────────────────────────

  private bindEvents() {
    const el = this.el!;
    el.querySelector('#ip-close')!.addEventListener('click', () => this.hide());
    el.addEventListener('click', e => { if (e.target === el) this.hide(); });

    el.querySelectorAll<HTMLButtonElement>('.ip-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeTab = (btn.dataset.tab as Tab);
        this.rebuild();
      });
    });

    el.querySelectorAll<HTMLButtonElement>('.ip-zone-unlock').forEach(btn => {
      btn.addEventListener('click', () => {
        const zoneId = btn.dataset.zone!;
        if (this.institution.unlockZone(zoneId)) this.rebuild();
      });
    });

    el.querySelectorAll<HTMLButtonElement>('.ip-fac-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const facId = btn.dataset.fac!;
        const action = btn.dataset.action!;
        const ok = action === 'build'
          ? this.institution.buildFacility(facId)
          : this.institution.upgradeFacility(facId);
        if (ok) this.rebuild();
      });
    });

    el.querySelectorAll<HTMLButtonElement>('.ip-dept-disband').forEach(btn => {
      btn.addEventListener('click', () => {
        const deptId = btn.dataset.dept!;
        if (this.institution.disbandDepartment(deptId, 'Disbanded by the founder.')) {
          this.rebuild();
        }
      });
    });

    const discSel = el.querySelector<HTMLSelectElement>('#ip-discipline');
    discSel?.addEventListener('change', () => {
      this.foundingDiscipline = discSel.value;
      this.foundingHeadId = null;
      this.rebuild();
    });

    const headSel = el.querySelector<HTMLSelectElement>('#ip-head');
    headSel?.addEventListener('change', () => {
      this.foundingHeadId = headSel.value;
    });

    const nameInput = el.querySelector<HTMLInputElement>('#ip-dept-name');
    nameInput?.addEventListener('input', () => {
      this.foundingName = nameInput.value;
      const btn = el.querySelector<HTMLButtonElement>('#ip-found-btn');
      if (btn) btn.disabled = !this.foundingName.trim() || !this.foundingDiscipline || !this.foundingHeadId;
    });

    const mandate = el.querySelector<HTMLTextAreaElement>('#ip-dept-mandate');
    mandate?.addEventListener('input', () => {
      this.foundingMandate = mandate.value;
    });

    el.querySelector<HTMLButtonElement>('#ip-found-btn')?.addEventListener('click', () => {
      if (!this.foundingDiscipline || !this.foundingHeadId || !this.foundingName.trim()) return;
      const ok = this.institution.foundDepartment({
        discipline:   this.foundingDiscipline,
        headScholarId: this.foundingHeadId,
        name:         this.foundingName.trim(),
        mandate:      this.foundingMandate.trim() || 'No mandate stated.',
      });
      if (ok) {
        this.foundingName = '';
        this.foundingMandate = '';
        this.foundingDiscipline = null;
        this.foundingHeadId = null;
        this.rebuild();
      }
    });
  }
}

