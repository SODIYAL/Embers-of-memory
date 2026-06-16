# Embers of Memory — dev notes

Medieval-academic management sim. Phaser 4 + TypeScript + Vite. All game
state lives in `GameState` (saved to localStorage, version-gated — bump
`CURRENT_SAVE_VERSION` in `SaveManager.ts` when its shape changes; there are
no migrations, a bump resets saves). Systems in `src/systems/` communicate
through the typed event bus (`src/game/EventBus.ts`).

## Commands

- `npm run build` — type-check + bundle (no test suite; this is the gate)
- `npm run assets:links` — verify every referenced asset file exists
- `npm run assets:audit` — assert pixel assets match the sizes the engine assumes
- `npm run assets:gen` — regenerate procedural/processed pixel assets
  (backdrops, tiles, generic scholars, portraits, icons, workstations)
- `npm run assets:ui` — regenerate the deterministically drawn pixel UI
  (buttons, indicators, fx strips, cursors, …)
- `npm run shots [outDir]` — headless screenshots of 5 campus scenarios
  (menu / day / active project / night / winter)
- `npm run playtest [outDir]` — automated full loop: starts a real project,
  clicks through mid-events + stage gates + release modal like a player,
  verifies sales + save/reload resume
- `node scripts/generate-ambience.mjs` — regenerate the synthesized
  mountain-wind music loop (needs ffmpeg; `apt-get install -y ffmpeg`)

`shots`/`playtest` need ad-hoc deps (not in package.json):

    npm install --no-save @sparticuz/chromium puppeteer-core

On Windows/macOS the harness uses a locally installed Chrome/Edge instead
(`scripts/resolve-browser.mjs`); @sparticuz/chromium is only for the Linux
sandbox. Build first; the harness serves `dist/`. The game exposes
`window.__embers = { Game, Events, GameEvents }` (set in `main.ts`) so the
harness — and a browser console — can drive game state directly.

## Art pipeline

The whole game renders on a 2×2 texel grid: every asset is 1×-resolution
pixel art drawn at `setScale(2)` (`render.pixelArt` + `scale.snap 640×360`
in `main.ts` keep texels whole at any window size). There are NO painted
backgrounds anymore — scenes are composed from the pixel kit:

- `public/assets/**` PNGs are either shipped pixel art (characters,
  buildings, props) or generated output. Regenerate with `assets:gen` +
  `assets:ui`; both are deterministic (byte-identical reruns).
- `art-src/` holds sources for processed assets (portraits, icons,
  workstations). Never load from art-src at runtime.
- Generic scholars/students are palette-swapped from the yildiz sheets in
  `gen-pixel-assets.mjs` — don't hand-edit those PNGs.

## Visual conventions (campus scene)

- 1280×720 fixed design resolution. The campus is composed in
  `CampusScene.buildCampusStage()` from `src/scenes/campusLayout.ts`
  (sky backdrop, tiled plateau, buildings, courtyard props). Edit the
  layout there, not inline coordinates.
- Mood (dusk/night, winter cast) is overlay tints; night light halos and
  the lantern on/off swap anchor to `LANTERNS`/`WINDOW_GLOWS` in
  campusLayout — they move with the layout automatically.
- Courtyard props that scholars can walk around are `walkable: true` —
  they join the actor layer and y-sort with the sprites (feet origin
  (0.5, 1)).
- Character sprites are 32×48 pixel art drawn at 2×. Founders (yildiz,
  ossavi, meridian, vasara, harlow) have idle/walk/sit/react sheets;
  generic hires only idle.
- Display font is Alagard (`public/fonts/alagard.ttf`) for titles/headers
  (`DISPLAY_FONT` in CampusScene, `--font-display` in `src/ui/ui-theme.css`);
  body text stays Georgia for legibility. DOM panels share palette tokens
  from `ui-theme.css` (kept in sync with `scripts/draw-pixel-ui.mjs`).
