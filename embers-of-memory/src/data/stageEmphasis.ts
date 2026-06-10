// Stage emphasis system — per-stage allocation across 3 stage-specific axes.
// Each stage's lead spends EMPHASIS_POINTS points; the closer the allocation
// is to the topic+format's ideal mix, the larger the quality bonus.
//
// Inspired by Game Dev Tycoon's design/tech sliders per phase. The "feel"
// is that each work has a hidden recipe, and discovering recipes by
// experimentation is part of the loop.
//
// Phase 1 prototype: Research stage only. Drafting + Refinement keep their
// existing emphasis behavior until we wire them in.

import type { StageKey } from '../models/Project';

export const EMPHASIS_POINTS = 5;

// The three axes for each stage. Each axis is a small thematic dimension
// the player allocates points across.
export const STAGE_AXES: Record<StageKey, readonly string[]> = {
  research:   ['Rigor', 'Sources', 'Scope'],
  drafting:   ['Clarity', 'Voice', 'Structure'],
  refinement: ['Polish', 'Accessibility', 'Beauty'],
};

// Short description shown under each axis in the picker.
export const AXIS_HINTS: Record<string, string> = {
  Rigor:        'Careful method, verifiable claims, footnoted citations.',
  Sources:      'Breadth of references — primary documents, eyewitness accounts.',
  Scope:        'How wide the inquiry casts — many threads or one deep cut.',
  Clarity:      'Plain prose; the reader follows without effort.',
  Voice:        'Distinctive style; the author shines through.',
  Structure:    'How the argument flows from chapter to chapter.',
  Polish:       'Catching errors, tightening the language.',
  Accessibility:'Smoothing entry points for non-specialist readers.',
  Beauty:       'Illustration, typography, marginalia — the object as art.',
};

// Hidden "ideal mix" per topic+format+stage. Values are FRACTIONS that sum
// to 1.0 across the stage's axes. The match score is 1 - 0.5 * L1 distance
// (so identical = 1.0, totally opposite ≈ 0). At full match the stage gets
// a +0.06 slice bonus; total mismatch costs -0.02.
//
// Keys: `${topicId}|${formatId}|${stageKey}`. Missing keys fall back to a
// generic format-based ideal so every work has a target.
export const IDEAL_MIX: Record<string, Record<string, number>> = {
  // ── Research stage, topic+format-specific ideals ─────────────────
  // Astronomy + scientific compendium — heavy rigor, broad sources
  'astronomy|scientific_compendium|research':  { Rigor: 0.50, Sources: 0.30, Scope: 0.20 },
  'astronomy|educational_handbook|research':   { Rigor: 0.40, Sources: 0.20, Scope: 0.40 },
  // Theology + hymn — sources matter most (canonical texts)
  'theology|hymn|research':                    { Rigor: 0.20, Sources: 0.60, Scope: 0.20 },
  'theology|philosophical_treatise|research':  { Rigor: 0.40, Sources: 0.40, Scope: 0.20 },
  // History — sources are king; scope shapes whether it's local or sweeping
  'history|philosophical_treatise|research':   { Rigor: 0.30, Sources: 0.50, Scope: 0.20 },
  'history|epic_poetry|research':              { Rigor: 0.10, Sources: 0.40, Scope: 0.50 },
  // Philosophy — broad scope; rigor matters more than primary sources
  'philosophy|philosophical_treatise|research':{ Rigor: 0.45, Sources: 0.15, Scope: 0.40 },
  // Cartography — sources dominate (field surveys, traveler reports)
  'cartography|atlas|research':                { Rigor: 0.30, Sources: 0.50, Scope: 0.20 },
  // Medicine — rigor first (patient outcomes), then sources
  'medicine|educational_handbook|research':    { Rigor: 0.55, Sources: 0.25, Scope: 0.20 },
  'medicine|scientific_compendium|research':   { Rigor: 0.55, Sources: 0.30, Scope: 0.15 },
  // Mathematics — pure rigor
  'mathematics|scientific_compendium|research':{ Rigor: 0.70, Sources: 0.10, Scope: 0.20 },
  'mathematics|educational_handbook|research': { Rigor: 0.50, Sources: 0.20, Scope: 0.30 },
  // Natural history — heavy on sources (specimens, observations)
  'natural_history|scientific_compendium|research': { Rigor: 0.30, Sources: 0.50, Scope: 0.20 },
  'natural_history|educational_handbook|research':  { Rigor: 0.30, Sources: 0.40, Scope: 0.30 },
  // Music — scope (range of pieces) and sources (folk traditions)
  'music|hymn|research':                       { Rigor: 0.20, Sources: 0.40, Scope: 0.40 },
  // Literature — broad scope, voice expected later
  'literature|epic_poetry|research':           { Rigor: 0.10, Sources: 0.30, Scope: 0.60 },
  // Engineering / Architecture — rigorous methods
  'engineering|educational_handbook|research': { Rigor: 0.55, Sources: 0.20, Scope: 0.25 },
  'architecture|atlas|research':               { Rigor: 0.40, Sources: 0.30, Scope: 0.30 },
};

// Generic fallback ideals by format reachType — used when no specific
// topic+format ideal is authored.
export const FORMAT_DEFAULT_IDEAL: Record<string, Record<StageKey, Record<string, number>>> = {
  scientific_compendium: {
    research:   { Rigor: 0.50, Sources: 0.30, Scope: 0.20 },
    drafting:   { Clarity: 0.40, Voice: 0.20, Structure: 0.40 },
    refinement: { Polish: 0.50, Accessibility: 0.20, Beauty: 0.30 },
  },
  philosophical_treatise: {
    research:   { Rigor: 0.40, Sources: 0.25, Scope: 0.35 },
    drafting:   { Clarity: 0.30, Voice: 0.35, Structure: 0.35 },
    refinement: { Polish: 0.40, Accessibility: 0.25, Beauty: 0.35 },
  },
  educational_handbook: {
    research:   { Rigor: 0.40, Sources: 0.30, Scope: 0.30 },
    drafting:   { Clarity: 0.50, Voice: 0.15, Structure: 0.35 },
    refinement: { Polish: 0.30, Accessibility: 0.50, Beauty: 0.20 },
  },
  atlas: {
    research:   { Rigor: 0.35, Sources: 0.45, Scope: 0.20 },
    drafting:   { Clarity: 0.30, Voice: 0.10, Structure: 0.60 },
    refinement: { Polish: 0.30, Accessibility: 0.20, Beauty: 0.50 },
  },
  hymn: {
    research:   { Rigor: 0.20, Sources: 0.50, Scope: 0.30 },
    drafting:   { Clarity: 0.30, Voice: 0.50, Structure: 0.20 },
    refinement: { Polish: 0.30, Accessibility: 0.30, Beauty: 0.40 },
  },
  epic_poetry: {
    research:   { Rigor: 0.15, Sources: 0.35, Scope: 0.50 },
    drafting:   { Clarity: 0.20, Voice: 0.50, Structure: 0.30 },
    refinement: { Polish: 0.30, Accessibility: 0.25, Beauty: 0.45 },
  },
};

// Return the ideal mix (axis -> fraction summing to ~1.0) for a given
// topic+format+stage, falling back to format default, then to an even split.
export function getIdealMix(topicId: string, formatId: string, stageKey: StageKey): Record<string, number> {
  const specific = IDEAL_MIX[`${topicId}|${formatId}|${stageKey}`];
  if (specific) return specific;
  const fmt = FORMAT_DEFAULT_IDEAL[formatId];
  if (fmt && fmt[stageKey]) return fmt[stageKey];
  // Even split across the stage's axes
  const axes = STAGE_AXES[stageKey];
  const even: Record<string, number> = {};
  for (const a of axes) even[a] = 1 / axes.length;
  return even;
}

// Convert a player's point allocation (axis -> 0..EMPHASIS_POINTS) into a
// normalized fraction map summing to 1.0. If the player spent 0 points
// (allowed), every axis gets an even share — neutral, no bonus, no penalty.
export function normalizeEmphasis(emphasis: Record<string, number>, stageKey: StageKey): Record<string, number> {
  const axes = STAGE_AXES[stageKey];
  const total = axes.reduce((s, a) => s + (emphasis[a] ?? 0), 0);
  const out: Record<string, number> = {};
  if (total <= 0) {
    for (const a of axes) out[a] = 1 / axes.length;
    return out;
  }
  for (const a of axes) out[a] = (emphasis[a] ?? 0) / total;
  return out;
}

// Compute match score 0..1. 1.0 = perfect match, 0.0 = totally opposite.
// Uses 1 - 0.5 * L1 distance between two probability vectors (a valid
// similarity since L1 distance between two probability distributions ∈ [0, 2]).
export function matchScore(playerMix: Record<string, number>, idealMix: Record<string, number>, stageKey: StageKey): number {
  const axes = STAGE_AXES[stageKey];
  let l1 = 0;
  for (const a of axes) {
    l1 += Math.abs((playerMix[a] ?? 0) - (idealMix[a] ?? 0));
  }
  return Math.max(0, 1 - 0.5 * l1);
}

// Map a 0..1 match score into a slice modifier in roughly [-0.02, +0.06].
// 0.0 (worst) → -0.02. 0.5 (random) → 0. 1.0 (perfect) → +0.06.
export function matchSliceModifier(score: number): number {
  if (score >= 0.5) return (score - 0.5) * 0.12;        // up to +0.06
  return (score - 0.5) * 0.04;                          // down to -0.02
}

export function matchLabel(score: number): { label: string; tone: 'high' | 'mid' | 'low' } {
  if (score >= 0.85) return { label: 'On point', tone: 'high' };
  if (score >= 0.65) return { label: 'Aligned',  tone: 'high' };
  if (score >= 0.40) return { label: 'Mixed',    tone: 'mid' };
  if (score >= 0.20) return { label: 'Off',      tone: 'low' };
  return                       { label: 'Misaligned', tone: 'low' };
}
