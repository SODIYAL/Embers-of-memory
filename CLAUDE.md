# Embers of Memory — dev notes

Medieval-academic management sim, presented as an **illuminated chronicle**.
Pure TypeScript + Vite + DOM/CSS — **no Phaser, no canvas, no pixel art**
(the game was rewritten from a Phaser pixel-art game into a text-based DOM
UI; see "History" below). All game state lives in `GameState` (saved to
localStorage, version-gated — bump `CURRENT_SAVE_VERSION` in `SaveManager.ts`
when its shape changes; there are no migrations, a bump resets saves).
Systems in `src/systems/` communicate through the typed event bus
(`src/game/EventBus.ts`).

## Commands

- `npm run dev` — Vite dev server (localhost:5173)
- `npm run build` — type-check + bundle (no test suite; **this is the gate**)
- `npm run preview` — serve the built `dist/`

`tsconfig` is strict: `noUnusedLocals`/`noUnusedParameters` and
`erasableSyntaxOnly` (so **no parameter properties** — declare fields and
assign in the constructor body) and `verbatimModuleSyntax` (type-only imports
must use `import type`).

The game exposes `window.__embers = { Game, Events, GameEvents }` (set in
`main.ts`) so a browser console — or a Playwright/puppeteer harness — can
drive and inspect game state directly. To verify behavior, run `npm run dev`
and drive the DOM (the time controls tick via `setInterval` in `TimeManager`,
fully independent of any renderer).

## Architecture

- `src/game/GameManager.ts` (`Game` singleton) owns the whole lifecycle:
  `GameState`, the `TimeManager` clock, the `SaveManager`, and **all systems**
  (`economy`, `project`, `recruitment`, `milestones`, `institution`,
  `departments`, `world`, `reprints`, `sales`). `Game.start()` inits every
  system and starts the clock; the DOM reads `Game.<system>` for panels.
- `src/game/TimeManager.ts` drives `DAY_PASSED` / `MONTH_PASSED` /
  `YEAR_PASSED` off a `setInterval` (renderer-agnostic). Day = 1200 ms
  (normal) / 300 ms (fast). 30 days/month, 360 days/year.
- `src/systems/**` hold all game logic; they only read/write `GameState` and
  emit/handle events. `IdeologySystem` is a stateless lens (no listeners).
- `src/game/Audio.ts` is a framework-free `HTMLAudioElement` wrapper
  (`Audio` singleton); it degrades silently if an SFX/music file is missing.

## UI layer (the rewrite)

- `src/app/App.ts` — orchestrates `TitleScreen` ↔ `GameView`, both mounted
  into `#app`.
- `src/app/TitleScreen.ts` — Begin / Continue / New Chronicle.
- `src/app/GameView.ts` — the main view and the hub that wires **every**
  `GameEvent` into UI: a status header (institution, date, renown, coffers,
  stance), a prose "Abbey, Presently" page (drop-cap, goal, active-project
  block + progress), the **Chronicle** (the dated event journal — the
  centerpiece), center-top toasts, and a footer of time controls + action
  buttons. It reuses the existing DOM panels/modals unchanged.
- Panels (`src/ui/panels/*`) and modals (`src/ui/modals/*`) are plain DOM that
  mount into `#ui-layer` (the overlay). They are renderer-agnostic and were
  carried over as-is. While any panel/modal is open, `#ui-layer` has children
  — `GameView.isBlocked()` uses that to gate keyboard shortcuts.

## Visual conventions (illuminated manuscript)

- `src/ui/manuscript.css` is the theme: a dark scriptorium desk with parchment
  surfaces, built entirely from CSS gradients (no raster textures), so it
  scales to any window. Tokens at `:root` (`--parchment`, `--ink`, `--rubric`
  red, `--gilt` gold, …). Display type is Alagard (`public/fonts/alagard.ttf`,
  `--font-display`); body is a serif (`--font-body`). Rubricated headers,
  drop-caps, gilt rule lines, marginalia.
- `src/ui/ui-theme.css` still loads for the reused panels/modals; those panels
  currently keep their original dark-wood styling (a "leather ledger" look
  over the parchment). Reskinning them fully to parchment is the obvious next
  polish step — each panel CSS hardcodes its own colors, so it must flip both
  background and text together.

## History / dead weight

This was a Phaser 4 pixel-art game. The rewrite removed Phaser, the three
scenes, and `campusLayout.ts`. **Now-unused leftovers** (kept on disk, not
referenced by the build): the pixel PNGs under `public/assets/**` (except
`public/assets/audio/**`, still used by `Audio.ts`, and `public/fonts/**`),
`art-src/`, and the pixel-pipeline scripts in `scripts/` (`gen-pixel-assets`,
`draw-pixel-ui`, `audit-assets`, `verify-asset-links`, `screenshot`,
`playtest`, `slice-assets`, `generate-art`). Their npm scripts were removed
from `package.json`. They can be deleted wholesale when convenient.
