# Embers of Memory — dev notes

Medieval-academic management sim. Phaser 4 + TypeScript + Vite. All game
state lives in `GameState` (saved to localStorage, version-gated — bump
`CURRENT_SAVE_VERSION` in `SaveManager.ts` when its shape changes; there are
no migrations, a bump resets saves). Systems in `src/systems/` communicate
through the typed event bus (`src/game/EventBus.ts`).

## Commands

- `npm run build` — type-check + bundle (no test suite; this is the gate)
- `npm run assets:links` — verify every referenced asset file exists
- `npm run shots [outDir]` — headless screenshots of 5 campus scenarios
  (menu / day / active project / night / winter)
- `npm run playtest [outDir]` — automated full loop: starts a real project,
  clicks through mid-events + stage gates + release modal like a player,
  verifies sales + save/reload resume
- `node scripts/generate-ambience.mjs` — regenerate the synthesized
  mountain-wind music loop (needs ffmpeg; `apt-get install -y ffmpeg`)

`shots`/`playtest` need ad-hoc deps (not in package.json — Chromium ships
via npm since external browser CDNs are blocked in the sandbox):

    npm install --no-save @sparticuz/chromium puppeteer-core

Build first; the harness serves `dist/`. The game exposes
`window.__embers = { Game, Events, GameEvents }` (set in `main.ts`) so the
harness — and a browser console — can drive game state directly.

## Visual conventions (campus scene)

- 1280×720 fixed design resolution; the day background painting is the
  base layer. Mood (dusk/night, winter cast) is done with overlay tints,
  never by swapping the painting (the night/winter paintings are different
  compositions — don't crossfade them in-scene).
- Light/effects must anchor to real painted features. Current anchors read
  off `campus_founding_hall_day.png`: porch candles at (625,388) and
  (761,416), lit window at (862,375). Re-derive if the painting changes.
- Character sprites are 32×48 pixel art drawn at 2× with NEAREST filtering.
  Founders (yildiz, ossavi, meridian, vasara, harlow) have idle/walk/sit/
  react sheets; generic hires only idle.
- Birds stay in the open sky left of the hall — never in front of it.
- Per `ASSET_SPLICE_AUDIT.md` some assets are bad crops; verified bad:
  `fx_candle_flame.png` is not a clean 4×12×12 frame grid (don't animate it).
