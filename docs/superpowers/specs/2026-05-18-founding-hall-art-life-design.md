# Founding Hall Art Life Design

## Goal

Make the main founding hall screen feel alive, cohesive, and readable during long stretches of play by replacing procedural-looking effects with painted assets and restrained animation layers that match the existing scene.

## Scope

This pass focuses on the campus/founding hall screen only. It keeps the current 1280x720 composition and UI layout, but adds art-directed layers for ambient life and active project work.

## Direction

Use the current founding hall background as the base. Generate matching painted overlay assets and sprite sheets rather than drawing rectangles, SVG-like clouds, random glows, or detached particle effects. A full background repaint is allowed later, but this first pass should preserve the strong existing architecture and reduce risk.

## Required Visual Changes

- Replace the rectangle-drawn active work desk with a painted workstation asset.
- Provide stage-specific workstation states for research, drafting, and refinement.
- Keep birds in the open sky and behind architecture.
- Add life to real scene anchors only: left tree, prayer flags, lantern/candle positions, work table.
- Remove effects that look like UI/vector overlays on top of the painted image.
- Keep motion subtle enough that it adds atmosphere without distracting from the management UI.

## Asset Set

Create or add the following project assets:

- `public/assets/workstations/workstation_research.png`
- `public/assets/workstations/workstation_drafting.png`
- `public/assets/workstations/workstation_refinement.png`
- `public/assets/ambient/ambient_flame_sheet.png`
- `public/assets/ambient/ambient_birds_sheet.png`
- `public/assets/ambient/ambient_tree_canopy_overlay.png`
- `public/assets/ambient/ambient_prayer_flags_overlay.png`

The workstation images should be transparent PNGs or clean chroma-key removals. They should match the current pixel-painted, warm Himalayan monastery/courtyard art direction.

## Layer Rules

The campus scene should render in this order:

1. Distant sky life behind the hall.
2. Current background image.
3. Scene-anchored ambient overlays such as tree canopy and flags.
4. Active work station and stage-specific effects.
5. Scholar cards and scholar movement.
6. HUD bars and panels.

Birds must never cross in front of the hall. Ambient light must come from actual scene sources, not random floating glow dots.

## Active Work Readability

When a project is active, the player should understand work is happening before reading the bottom-left text. The work station should show:

- Research: references, books, open maps, scattered notes.
- Drafting: manuscript pages, ink, quill, active writing feel.
- Refinement: cleaned manuscript, seal, small gold details, controlled sparkle.

The stage label and progress bar can remain, but they should support the visual state rather than being the only signal.

## Verification

- `npm.cmd run build` passes.
- `npm.cmd run assets:links` passes.
- Visual review confirms no screen left-shift, no birds over the building, no SVG-like clouds/glows, and no detached random candle dots.
