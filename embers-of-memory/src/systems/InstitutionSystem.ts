import { Events, GameEvents } from '../game/EventBus';
import { Game } from '../game/GameManager';
import { ZONES, FACILITIES, zoneById, facilityById, facilitiesInZone } from '../data/institution';
import type { ZoneDef, FacilityDef, FacilityEffect } from '../data/institution';
import type { Department } from '../models/GameState';

export const DEPARTMENT_QUALITY_BONUS = 0.02;
const MIN_SCHOLARS_FOR_DEPARTMENT = 3;

export class InstitutionSystem {
  private readonly onMonthPassed = () => this.autoDisbandIfUndersized();
  private readonly onScholarLeft = ({ scholarId }: { scholarId: string }) => this.handleScholarDeparture(scholarId);
  private readonly onScholarRetired = ({ scholarId }: { scholarId: string }) => this.handleScholarDeparture(scholarId);
  private initialized = false;

  init() {
    if (this.initialized) return;
    this.initialized = true;
    Events.on(GameEvents.MONTH_PASSED, this.onMonthPassed);
    Events.on(GameEvents.SCHOLAR_LEFT, this.onScholarLeft);
    Events.on(GameEvents.SCHOLAR_RETIRED, this.onScholarRetired);
  }

  destroy() {
    if (!this.initialized) return;
    Events.off(GameEvents.MONTH_PASSED, this.onMonthPassed);
    Events.off(GameEvents.SCHOLAR_LEFT, this.onScholarLeft);
    Events.off(GameEvents.SCHOLAR_RETIRED, this.onScholarRetired);
    this.initialized = false;
  }

  // ── Queries ───────────────────────────────────────────────────────

  zoneUnlocked(zoneId: string): boolean {
    return Game.state.unlockedZones.includes(zoneId);
  }

  canUnlockZone(zoneId: string): { ok: boolean; reason?: string } {
    const zone = zoneById(zoneId);
    if (!zone) return { ok: false, reason: 'unknown zone' };
    if (this.zoneUnlocked(zoneId)) return { ok: false, reason: 'already unlocked' };
    if (Game.state.tier < zone.unlockTier) return { ok: false, reason: `Requires institution tier ${zone.unlockTier}` };
    if (zone.prerequisitePrestige && Game.state.prestige < zone.prerequisitePrestige) {
      return { ok: false, reason: `Requires prestige ${zone.prerequisitePrestige}` };
    }
    if (zone.prerequisiteDiscipline) {
      const has = Game.state.scholars.some(s => s.primaryDiscipline === zone.prerequisiteDiscipline);
      if (!has) return { ok: false, reason: `Requires a scholar of ${zone.prerequisiteDiscipline}` };
    }
    if (Game.state.treasury < zone.unlockCost) {
      return { ok: false, reason: `Costs ${zone.unlockCost} gold` };
    }
    return { ok: true };
  }

  unlockZone(zoneId: string): boolean {
    const check = this.canUnlockZone(zoneId);
    if (!check.ok) return false;
    const zone = zoneById(zoneId)!;
    Game.state.treasury -= zone.unlockCost;
    Game.state.unlockedZones.push(zoneId);
    Events.emit(GameEvents.TREASURY_CHANGED, { amount: Game.state.treasury });
    Events.emit(GameEvents.ZONE_UNLOCKED, { zoneId, zoneName: zone.name });
    Game.save.save(Game.state);
    return true;
  }

  facilityTier(facilityId: string): number {
    return Game.state.facilities[facilityId] ?? 0;
  }

  canBuildFacility(facilityId: string): { ok: boolean; reason?: string } {
    const fac = facilityById(facilityId);
    if (!fac) return { ok: false, reason: 'unknown facility' };
    if (this.facilityTier(facilityId) > 0) return { ok: false, reason: 'already built' };
    if (!this.zoneUnlocked(fac.zoneId)) return { ok: false, reason: 'zone not unlocked' };
    if (Game.state.treasury < fac.buildCost) return { ok: false, reason: `Costs ${fac.buildCost} gold` };
    return { ok: true };
  }

  buildFacility(facilityId: string): boolean {
    const check = this.canBuildFacility(facilityId);
    if (!check.ok) return false;
    const fac = facilityById(facilityId)!;
    Game.state.treasury -= fac.buildCost;
    Game.state.facilities[facilityId] = 1;
    Events.emit(GameEvents.TREASURY_CHANGED, { amount: Game.state.treasury });
    Events.emit(GameEvents.FACILITY_BUILT, { facilityId, facilityName: fac.name, zoneId: fac.zoneId });
    Game.save.save(Game.state);
    return true;
  }

  canUpgradeFacility(facilityId: string): { ok: boolean; reason?: string } {
    const fac = facilityById(facilityId);
    if (!fac) return { ok: false, reason: 'unknown facility' };
    const tier = this.facilityTier(facilityId);
    if (tier === 0) return { ok: false, reason: 'not built yet' };
    if (tier >= fac.maxTier) return { ok: false, reason: 'already at max' };
    if (Game.state.treasury < fac.upgradeCost) return { ok: false, reason: `Costs ${fac.upgradeCost} gold` };
    return { ok: true };
  }

  upgradeFacility(facilityId: string): boolean {
    const check = this.canUpgradeFacility(facilityId);
    if (!check.ok) return false;
    const fac = facilityById(facilityId)!;
    Game.state.treasury -= fac.upgradeCost;
    Game.state.facilities[facilityId] = (Game.state.facilities[facilityId] ?? 0) + 1;
    Events.emit(GameEvents.TREASURY_CHANGED, { amount: Game.state.treasury });
    Events.emit(GameEvents.FACILITY_UPGRADED, {
      facilityId, facilityName: fac.name, newTier: Game.state.facilities[facilityId],
    });
    Game.save.save(Game.state);
    return true;
  }

  // ── Effects (read-only queries used by ProjectSystem) ────────────

  // Sum of effects of a given kind across all built facilities, scaled by tier.
  // For topic_quality: only effects matching the given topicName are summed.
  effectMagnitude(kind: FacilityEffect['kind'], topicName?: string): number {
    let total = 0;
    for (const fac of FACILITIES) {
      const tier = this.facilityTier(fac.id);
      if (tier === 0) continue;
      const eff = fac.effect;
      if (eff.kind !== kind) continue;
      if (eff.kind === 'topic_quality') {
        if (!topicName || eff.topic !== topicName) continue;
        total += eff.magnitude * tier;
      } else if (eff.kind === 'unlock_format') {
        // Not summed — see isFormatUnlocked
      } else {
        total += eff.magnitude * tier;
      }
    }
    return total;
  }

  // A format is unlocked if no built facility specifies it as a gate, OR
  // some built facility specifies it. We default-unlock all current formats
  // by not having any 'unlock_format' facilities defined — gating is opt-in.
  isFormatUnlocked(_formatId: string): boolean {
    // Currently no formats are gated. Keeping this as a hook for Phase 7b.
    return true;
  }

  // Convenience for the UI.
  listZones(): ZoneDef[] { return ZONES; }
  listFacilitiesInZone(zoneId: string): FacilityDef[] { return facilitiesInZone(zoneId); }

  // ── Departments ───────────────────────────────────────────────────

  // Disciplines that currently have enough scholars to form a department,
  // excluding ones already used by an existing department.
  eligibleDepartmentDisciplines(): string[] {
    const used = new Set(Game.state.departments.map(d => d.discipline));
    const counts: Record<string, number> = {};
    for (const s of Game.state.scholars) {
      counts[s.primaryDiscipline] = (counts[s.primaryDiscipline] ?? 0) + 1;
    }
    return Object.entries(counts)
      .filter(([disc, n]) => n >= MIN_SCHOLARS_FOR_DEPARTMENT && !used.has(disc))
      .map(([disc]) => disc);
  }

  // Scholars eligible to lead a new department for the given discipline.
  eligibleHeadsFor(discipline: string): string[] {
    const usedAsHead = new Set(Game.state.departments.map(d => d.headScholarId));
    return Game.state.scholars
      .filter(s => s.primaryDiscipline === discipline && !usedAsHead.has(s.id))
      .map(s => s.id);
  }

  foundDepartment(opts: { discipline: string; headScholarId: string; name: string; mandate: string }): boolean {
    if (!this.eligibleDepartmentDisciplines().includes(opts.discipline)) return false;
    if (!this.eligibleHeadsFor(opts.discipline).includes(opts.headScholarId)) return false;
    const head = Game.state.scholars.find(s => s.id === opts.headScholarId);
    if (!head) return false;

    const dept: Department = {
      id: `dept_${Date.now()}`,
      name: opts.name,
      discipline: opts.discipline,
      headScholarId: opts.headScholarId,
      mandate: opts.mandate,
      foundedDay: Game.state.day,
      morale: 0.7,
    };
    Game.state.departments.push(dept);
    Events.emit(GameEvents.DEPARTMENT_FOUNDED, {
      departmentId: dept.id,
      name: dept.name,
      headScholarName: head.name,
    });
    Game.save.save(Game.state);
    return true;
  }

  disbandDepartment(departmentId: string, reason: string): boolean {
    const idx = Game.state.departments.findIndex(d => d.id === departmentId);
    if (idx < 0) return false;
    const dept = Game.state.departments[idx];
    Game.state.departments.splice(idx, 1);
    Events.emit(GameEvents.DEPARTMENT_DISBANDED, {
      departmentId: dept.id,
      name: dept.name,
      reason,
    });
    Game.save.save(Game.state);
    return true;
  }

  // Quality bonus contributed by departments matching the project's topic discipline.
  departmentQualityBonus(topicName: string): number {
    return Game.state.departments.some(d => d.discipline === topicName)
      ? DEPARTMENT_QUALITY_BONUS
      : 0;
  }

  // Auto-disband when the discipline drops below the minimum scholar count.
  private autoDisbandIfUndersized() {
    const snapshot = [...Game.state.departments];
    for (const dept of snapshot) {
      const count = Game.state.scholars.filter(s => s.primaryDiscipline === dept.discipline).length;
      if (count < MIN_SCHOLARS_FOR_DEPARTMENT) {
        this.disbandDepartment(dept.id, `Too few scholars of ${dept.discipline} remain.`);
      }
    }
  }

  // If a department head leaves or retires, the department disbands.
  private handleScholarDeparture(scholarId: string) {
    const dept = Game.state.departments.find(d => d.headScholarId === scholarId);
    if (dept) {
      this.disbandDepartment(dept.id, `Its head has gone. The department disperses.`);
    }
  }
}
