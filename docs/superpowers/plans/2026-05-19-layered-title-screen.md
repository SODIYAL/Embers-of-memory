# Layered Title Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the welcome screen as a layered, atmospheric title scene with depth, restrained motion, and a clear start/continue action.

**Architecture:** Keep `MenuScene` as the only runtime owner of title-screen presentation. `BootScene` loads stable title-layer asset keys, while `MenuScene` composes background, atmospheric layers, logo, tagline, and buttons with Phaser tweens. Generated image assets live in `public/assets/title/`.

**Tech Stack:** Phaser 4, TypeScript, Vite, PNG bitmap assets, built-in image generation, existing build and asset-link verification scripts.

---

## Files

- Create: `public/assets/title/title_cloud_band.png`
- Create: `public/assets/title/title_birds_sheet.png`
- Create: `public/assets/title/title_curtain_edge.png`
- Create: `public/assets/title/title_light_rays.png`
- Create: `public/assets/title/title_dust_mote.png`
- Modify: `src/scenes/BootScene.ts`
- Modify: `src/scenes/MenuScene.ts`

## Task 1: Generate And Extract Title Assets

- [ ] Generate one title overlay sheet with painterly clouds, tiny birds, curtain edge, light rays, and dust mote sprites in the existing warm manuscript-room art style.
- [ ] Chroma-key the sheet locally and save each extracted PNG under `public/assets/title/`.
- [ ] Inspect extracted assets to reject any vector-looking, cropped, or mismatched layer.

## Task 2: Load Title Assets

- [ ] In `src/scenes/BootScene.ts`, load stable keys:

```ts
this.load.image('title_cloud_band', '/assets/title/title_cloud_band.png');
this.load.image('title_birds_sheet', '/assets/title/title_birds_sheet.png');
this.load.image('title_curtain_edge', '/assets/title/title_curtain_edge.png');
this.load.image('title_light_rays', '/assets/title/title_light_rays.png');
this.load.image('title_dust_mote', '/assets/title/title_dust_mote.png');
```

## Task 3: Compose Menu Depth Layers

- [ ] In `MenuScene.create()`, replace the single static background setup with a helper that:
  - places the base title background,
  - adds a slow cloud band behind the logo,
  - adds birds in the sky zone,
  - adds foreground curtain sway,
  - adds light rays and dust motes,
  - keeps the logo/button safe zone readable.

## Task 4: Animate Subtly

- [ ] Add slow parallax tweens:
  - clouds drift horizontally,
  - curtain edge sways by 1-3 px,
  - light rays breathe in alpha,
  - dust motes float through the manuscript area,
  - birds cross only in the distant sky.

## Task 5: Verify

- [ ] Run `npm.cmd run build`.
- [ ] Run `npm.cmd run assets:links`.
- [ ] Start Vite and capture a Playwright screenshot of the title screen at 1600x900.
- [ ] Check that the title remains readable, buttons are clickable, motion layers do not look pasted on, and no canvas alignment shift is introduced.
