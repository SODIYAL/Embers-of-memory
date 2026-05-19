import { Events, GameEvents } from '../game/EventBus';
import { Game } from '../game/GameManager';
import {
  TOPIC_IMPRINT, FORMAT_IMPRINT, PRIORITY_IMPRINT,
  beliefImprint, combineImprints,
} from '../data/ideologyContributions';
import {
  FACTION_INFO, AXIS_INFO,
  FACTION_FAVOR_THRESHOLD, FACTION_DENOUNCE_THRESHOLD,
  FACTION_PATRONAGE_THRESHOLD, SUPPRESSION_OPPOSITION_THRESHOLD,
} from '../models/Ideology';
import type { IdeologyVector, IdeologyAxis, FactionId } from '../models/Ideology';
import type { Project } from '../models/Project';
import type { Work } from '../models/Work';
import type { MajorPatron, PatronType } from '../models/Economy';

// Hard caps on per-axis stance so values don't run away.
const AXIS_MIN = -100;
const AXIS_MAX = 100;

// Each release nudges the institution toward the work's imprint, scaled
// so a few works move the needle without one work redefining everything.
const AXIS_DRIFT_RATE = 0.6;

// Faction standing drift per release — alignment dot product, scaled.
const FACTION_DRIFT_SCALE = 1.4;

// Per-faction stipend and patron-type when they convert to a major patron.
const FACTION_STIPEND: Record<FactionId, number> = {
  church:    50,
  crown:     65,
  reformers: 35,
};

const FACTION_PATRON_TYPE: Record<FactionId, PatronType> = {
  church:    'religious_order',
  crown:     'ruling_family',
  reformers: 'scholarly_benefactor',
};

const FACTION_PATRONAGE_FLAVOR: Record<FactionId, string> = {
  church:    'The Church has watched your works and finds them in keeping with the old faith. They offer formal patronage — a stipend, in exchange for continued alignment.',
  crown:     'A herald from the Crown arrives bearing a sealed parchment. The court would consider it an honor to fund the institution\'s continued work — provided your direction does not stray.',
  reformers: 'The Reformers extend their hand: not a coffer of nobility but a coalition of guildsmen and dissenting scholars who together can match a stipend, if you continue to speak for them.',
};

export class IdeologySystem {
  // Compute the ideological imprint a project will leave on release.
  // Combines topic, format, priorities, and each stage lead's beliefs.
  computeImprint(project: Project): IdeologyVector {
    const sources: IdeologyVector[] = [];

    // Topic & format are direct lookups
    if (TOPIC_IMPRINT[project.topicId])  sources.push(TOPIC_IMPRINT[project.topicId]);
    if (FORMAT_IMPRINT[project.formatId]) sources.push(FORMAT_IMPRINT[project.formatId]);

    // Priorities: each point spent multiplies that priority's imprint
    for (const [key, pts] of Object.entries(project.priorities)) {
      const base = PRIORITY_IMPRINT[key];
      if (!base || pts <= 0) continue;
      sources.push(scaleVector(base, pts));
    }

    // Each stage's lead contributes their beliefs (once per stage led).
    // The player's optional framing per stage adds an extra nudge.
    for (const stage of project.stages) {
      const lead = Game.state.scholars.find(s => s.id === stage.leadScholarId);
      if (lead) sources.push(beliefImprint(lead.beliefs));
      if (stage.framing) sources.push(stage.framing);
    }

    return combineImprints(...sources);
  }

  // Apply a finished work's imprint: shift the institution's axes,
  // re-derive faction standings, fire threshold events.
  applyImprint(imprint: IdeologyVector) {
    const ideology = Game.state.ideology;

    // Drift the institution's axes by a fraction of the imprint.
    for (const k of Object.keys(imprint) as IdeologyAxis[]) {
      const delta = (imprint[k] ?? 0) * AXIS_DRIFT_RATE;
      ideology.axes[k] = clamp(ideology.axes[k] + delta, AXIS_MIN, AXIS_MAX);
    }
    ideology.lastImprint = { ...imprint };

    // Faction drift: each faction's preferences vs the institution's current
    // stance produces an alignment dot product; positive nudges them toward
    // the institution, negative away.
    for (const factionId of Object.keys(FACTION_INFO) as FactionId[]) {
      const prefs = FACTION_INFO[factionId].preferences;
      // Score how the LATEST work (its imprint) aligns with the faction's
      // preferences — recent works move the needle, not the institution's
      // cumulative state.
      let alignment = 0;
      for (const k of Object.keys(prefs) as IdeologyAxis[]) {
        const sign = (prefs[k] ?? 0);
        const value = imprint[k] ?? 0;
        alignment += sign * value;
      }
      const drift = alignment * FACTION_DRIFT_SCALE;
      ideology.factions[factionId] = clamp(
        ideology.factions[factionId] + drift, AXIS_MIN, AXIS_MAX,
      );

      this.checkFactionThreshold(factionId);
    }

    Events.emit(GameEvents.IDEOLOGY_DRIFT, {
      imprint,
      axes: { ...ideology.axes },
      factions: { ...ideology.factions },
    });
  }

  private checkFactionThreshold(factionId: FactionId) {
    const ideology = Game.state.ideology;
    const standing = ideology.factions[factionId];
    const flag = ideology.factionFlags[factionId];
    const info = FACTION_INFO[factionId];

    if (standing >= FACTION_FAVOR_THRESHOLD && !flag.favorOffered) {
      flag.favorOffered = true;
      flag.denounced = false; // re-arm the negative side
      Events.emit(GameEvents.FACTION_FAVOR_OFFERED, {
        factionId, factionName: info.name, standing,
      });
    } else if (standing <= FACTION_DENOUNCE_THRESHOLD && !flag.denounced) {
      flag.denounced = true;
      flag.favorOffered = false;
      Events.emit(GameEvents.FACTION_DENOUNCED, {
        factionId, factionName: info.name, standing,
      });
    }
  }

  // After a work's imprint has been applied, evaluate whether any faction
  // suppresses it (revenue loss) or offers patronage. Returns the work's
  // final revenue (possibly reduced by suppression).
  evaluateRelease(work: Work): number {
    let revenue = work.revenue;
    const imprint = work.ideologyImprint ?? {};

    revenue = this.checkSuppression(work, imprint, revenue);
    this.checkPatronageOffers();

    return revenue;
  }

  // Suppression: a friendly+ faction may suppress a work whose imprint
  // pulls hard AGAINST their preferences. Only the most offended faction
  // suppresses (so the player loses revenue once, not three times).
  private checkSuppression(work: Work, imprint: IdeologyVector, revenue: number): number {
    let worst: { factionId: FactionId; opposition: number } | null = null;
    for (const factionId of Object.keys(FACTION_INFO) as FactionId[]) {
      const standing = Game.state.ideology.factions[factionId];
      if (standing < 20) continue; // not friendly enough to care
      const prefs = FACTION_INFO[factionId].preferences;
      // Opposition: sum of imprint magnitudes pulling AGAINST the faction.
      let opposition = 0;
      for (const k of Object.keys(prefs) as IdeologyAxis[]) {
        const pref = prefs[k] ?? 0;
        const v = imprint[k] ?? 0;
        if (pref > 0 && v < 0) opposition += -v;
        if (pref < 0 && v > 0) opposition += v;
      }
      if (opposition < SUPPRESSION_OPPOSITION_THRESHOLD) continue;
      if (!worst || opposition > worst.opposition) {
        worst = { factionId, opposition };
      }
    }

    if (!worst) return revenue;

    const info = FACTION_INFO[worst.factionId];
    const penaltyFraction = Math.min(0.6, 0.3 + (worst.opposition - SUPPRESSION_OPPOSITION_THRESHOLD) * 0.04);
    const lost = Math.round(revenue * penaltyFraction);
    const newRevenue = revenue - lost;

    Game.state.ideology.factions[worst.factionId] = clamp(
      Game.state.ideology.factions[worst.factionId] - 15, AXIS_MIN, AXIS_MAX,
    );

    Events.emit(GameEvents.WORK_SUPPRESSED, {
      workId:      work.id,
      workTitle:   work.title,
      factionId:   worst.factionId,
      factionName: info.name,
      revenueLost: lost,
    });

    return newRevenue;
  }

  // Patronage offer: once per game per faction, when standing crosses the
  // patronage threshold. CampusScene shows an accept/decline modal.
  private checkPatronageOffers() {
    for (const factionId of Object.keys(FACTION_INFO) as FactionId[]) {
      const standing = Game.state.ideology.factions[factionId];
      const flag = Game.state.ideology.factionFlags[factionId];
      if (flag.patronageOffered) continue;
      if (standing < FACTION_PATRONAGE_THRESHOLD) continue;

      const info = FACTION_INFO[factionId];
      flag.patronageOffered = true;
      Events.emit(GameEvents.FACTION_PATRONAGE_OFFERED, {
        factionId,
        factionName: info.name,
        stipend: FACTION_STIPEND[factionId],
        flavor: FACTION_PATRONAGE_FLAVOR[factionId],
      });
    }
  }

  // Build a MajorPatron from a faction when the player accepts patronage.
  buildFactionPatron(factionId: FactionId): MajorPatron {
    const info = FACTION_INFO[factionId];
    return {
      id: `patron_faction_${factionId}_${Date.now()}`,
      archetypeKey: `faction_${factionId}`,
      name: info.name,
      type: FACTION_PATRON_TYPE[factionId],
      stipend: FACTION_STIPEND[factionId],
      joinedDay: Game.state.day,
      patience: 12,
      alignment: { ...info.preferences },
    };
  }

  // Human-readable description of a single axis, with the dominant side.
  describeAxis(axis: IdeologyAxis): string {
    const value = Game.state.ideology.axes[axis];
    const info = AXIS_INFO[axis];
    const abs = Math.abs(value);
    const side = value >= 0 ? info.positiveLabel : info.negativeLabel;
    if (abs < 10) return 'Balanced';
    if (abs < 30) return `Leans ${side}`;
    if (abs < 60) return `${side}`;
    return `Strongly ${side}`;
  }
}

function scaleVector(v: IdeologyVector, scalar: number): IdeologyVector {
  const out: IdeologyVector = {};
  for (const k of Object.keys(v) as IdeologyAxis[]) {
    out[k] = (v[k] ?? 0) * scalar;
  }
  return out;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
