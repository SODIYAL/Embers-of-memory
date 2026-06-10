# Founding Hall Art Life Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace disconnected procedural screen effects with cohesive painted ambient and active-work layers for the founding hall game screen.

**Architecture:** Keep gameplay state unchanged. `BootScene.ts` owns asset loading, while `CampusScene.ts` owns presentation layers, sprite placement, animation timing, and stage-driven workstation display. Generated bitmap assets live under `public/assets/ambient/` and `public/assets/workstations/`.

**Tech Stack:** Phaser 4, TypeScript, Vite, PNG/WebP bitmap assets, existing npm build and asset-link scripts.

---

## File Structure

- Modify `src/scenes/BootScene.ts`: load new ambient and workstation image keys.
- Modify `src/scenes/CampusScene.ts`: replace procedural active-work art, add anchored ambient sprite layers, constrain sky birds behind the hall, and use stage-specific workstation sprites.
- Create `public/assets/ambient/`: generated ambient sprite sheets and overlays.
- Create `public/assets/workstations/`: generated active-work station images.
- Verify with `npm.cmd run build` and `npm.cmd run assets:links`.

## Task 1: Add Project Asset Folders

**Files:**
- Create: `public/assets/ambient/.gitkeep`
- Create: `public/assets/workstations/.gitkeep`

- [ ] **Step 1: Create asset directories**

Use filesystem directory creation for:

```text
public/assets/ambient
public/assets/workstations
```

- [ ] **Step 2: Add empty keep files**

Add empty `.gitkeep` files so the directories are explicit before generated images are moved in.

## Task 2: Generate Initial Bitmap Assets

**Files:**
- Create: `public/assets/workstations/workstation_research.png`
- Create: `public/assets/workstations/workstation_drafting.png`
- Create: `public/assets/workstations/workstation_refinement.png`
- Create: `public/assets/ambient/ambient_flame_sheet.png`
- Create: `public/assets/ambient/ambient_birds_sheet.png`
- Create: `public/assets/ambient/ambient_tree_canopy_overlay.png`
- Create: `public/assets/ambient/ambient_prayer_flags_overlay.png`

- [ ] **Step 1: Generate workstation assets**

Generate three matching transparent or chroma-key-removable workstation images in the existing pixel-painted courtyard style. The assets should be small, grounded, and viewed in the same isometric perspective as the founding hall scene.

- [ ] **Step 2: Generate ambient assets**

Generate restrained ambient layers: small flame frames, tiny distant bird frames, a left-tree canopy overlay, and a prayer-flag overlay aligned to the existing scene.

- [ ] **Step 3: Inspect generated files**

Confirm the assets do not look like vector stickers, UI icons, or modern flat illustration. Reject any output with gradients, text, watermarking, or inconsistent perspective.

## Task 3: Load New Assets

**Files:**
- Modify: `src/scenes/BootScene.ts`

- [ ] **Step 1: Add asset loads**

Add this loading block near the existing props/fx loads:

```ts
for (const name of ['birds_sheet', 'flame_sheet', 'prayer_flags_overlay', 'tree_canopy_overlay']) {
  this.load.image(`ambient_${name}`, `/assets/ambient/ambient_${name}.png`);
}
for (const stage of ['research', 'drafting', 'refinement']) {
  this.load.image(`workstation_${stage}`, `/assets/workstations/workstation_${stage}.png`);
}
```

- [ ] **Step 2: Verify links**

Run:

```powershell
npm.cmd run assets:links
```

Expected: script completes without missing asset references.

## Task 4: Replace Active Work Drawing

**Files:**
- Modify: `src/scenes/CampusScene.ts`

- [ ] **Step 1: Add workstation fields**

Add private fields to `CampusScene`:

```ts
private activeWorkStation!: Phaser.GameObjects.Image;
private activeWorkAccent?: Phaser.GameObjects.Image;
```

- [ ] **Step 2: Replace desk rectangles**

In `buildActiveWorkLayer()`, remove rectangle/line desk art and create:

```ts
this.activeWorkStation = this.add.image(x, y + 4, 'workstation_research')
  .setOrigin(0.5, 0.62)
  .setScale(0.42)
  .setAlpha(0.96);
```

Keep the active work title, stage text, progress fill, and stage pips for readability.

- [ ] **Step 3: Swap station by stage**

In `refreshActiveWork(project)`, add:

```ts
this.activeWorkStation.setTexture(`workstation_${stage?.key ?? 'research'}`);
```

- [ ] **Step 4: Remove procedural stage effects that look pasted on**

Delete or disable rectangle-based note and ink strokes. Keep only subtle asset-based sparkle for refinement if it reads well in the scene.

## Task 5: Add Anchored Ambient Sprites

**Files:**
- Modify: `src/scenes/CampusScene.ts`

- [ ] **Step 1: Split ambient containers**

Use separate containers for depth:

```ts
private skyLifeLayer!: Phaser.GameObjects.Container;
private sceneAmbientLayer!: Phaser.GameObjects.Container;
```

- [ ] **Step 2: Build tree and flag overlays**

Add tree overlay around the existing left tree and flag overlay near the actual flag line. Use tiny `x`, `y`, `angle`, and `alpha` tweens only.

- [ ] **Step 3: Keep birds in sky only**

Constrain bird spawning to the left open-sky band and add birds to `skyLifeLayer`, which must sit behind the main background image.

## Task 6: Verify and Adjust

**Files:**
- Test: build output and asset references

- [ ] **Step 1: Run build**

Run:

```powershell
npm.cmd run build
```

Expected: TypeScript and Vite build complete successfully.

- [ ] **Step 2: Run asset-link verification**

Run:

```powershell
npm.cmd run assets:links
```

Expected: no missing assets.

- [ ] **Step 3: Visual QA**

Check the founding hall screen for these failures:

- Birds crossing the building.
- SVG/vector-looking overlays.
- Random glows detached from light sources.
- Active work table floating above the courtyard.
- Canvas alignment shifted left or right.
