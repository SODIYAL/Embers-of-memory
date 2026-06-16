# Embers of Memory

> A medieval-academic management sim about building a center of learning — and deciding what knowledge is *for*.

You are the founder of a fledgling scriptorium. Recruit brilliant, temperamental scholars; commission works of philosophy, theology, astronomy, and music; and grow a single hall into a university whose ideas echo through the world. Every book you publish shifts your institution's ideology, pleases or angers the powers of the age, and competes with rival schools for the memory of history.

Built with **Phaser 4 + TypeScript + Vite**, rendered entirely in hand-pixeled 2× pixel art.

---

## Play

The game runs entirely in the browser — no backend, all state saved to `localStorage`. It auto-deploys to **GitHub Pages** on every push to `main` (see [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)).

To run it locally, see [Getting started](#getting-started) below.

---

## The game

You steward an institution across years of in-game time. Time flows on a medieval calendar (day → month → year) that you can pause, run, or fast-forward. Each month settles your books: backlist royalties and patron stipends come in; scholar salaries, facility upkeep, and operating costs go out. Stay in the red too long and the institution folds.

### The core loop

1. **Commission a work.** Pick a **topic** (Philosophy, Theology, History, Astronomy, Medicine, Music, Cartography…), a **format** (Philosophical Treatise, Scientific Compendium, Illustrated Atlas, Educational Handbook, Hymn, Epic Poetry), and a lead scholar.
2. **Shepherd it through three stages** — Research, Drafting, Refinement. Mid-project events force choices (push the lead and risk burnout, or rest and lose time). At each stage gate you assign the next lead and assistants, and can nudge the work's ideological framing.
3. **Release it.** Quality is computed from the lead's skill, topic/format fit, team chemistry, well-being, and your facilities — landing somewhere from *Flawed* to *Landmark*. The work opens a sales window, earns prestige, and leaves a permanent mark on your institution's beliefs.
4. **Reinvest.** Spend gold to recruit more scholars, unlock new wings, build and upgrade facilities, court patrons, and take on commissions — then commission the next, more ambitious work.

### What makes it tick

- **Scholars are people, not stat blocks.** Each has disciplines, a creative temperament, hidden **fears** and **ambitions**, and **beliefs** about how knowledge should work. They tire, grow restless when idle or mismatched, age, and eventually retire. The five hand-authored founders — *Yildiz of the High Roads*, *Ossavi the Archivist*, *Meridian the Uncertain*, *Vasara of the River Schools*, and *Harlow the Cartographer* — anchor a roster that fills out with named and procedurally generated recruits.
- **Chemistry.** Every pair of scholars carries a relationship that deepens (or sours) the more they collaborate, from *Deep Conflict* to *Legendary Partnership* — and it pulls the quality of shared work up or down.
- **Ideology & factions.** Every publication drifts your institution along three axes — *piety*, *tradition*, and *populism* — which sway **The Church**, **The Crown**, and **The Reformers**. Win a faction over for patronage; provoke one and risk denunciation or suppression of your work.
- **Patrons & economy.** Court major patrons (*House Vellan*, *The Temple of the Settled Flame*, *The Guild of Salt and Compass*, *The Court at Ilenya*, *Adept Korin of the Westmarch*) for recurring stipends, take one-off commissions and grants, and manage a treasury that punishes overreach.
- **A living world.** Three rival institutions — *The Crystallarium*, *The Cloister of the Settled Word*, and *The Free Hall of Pasare* — publish on their own cadence, compete for prestige, saturate topics, and even try to poach your scholars. World events (revivals, trade booms, plagues, heresy trials, war) shift demand and faction favor beneath your feet.
- **Departments.** Mature institutions spin up departments that propose and run their own projects autonomously — occasionally escalating a controversy to your desk.

### Growth & endgame

Your hall climbs from **Founding** to **Academy** to **University** as prestige, treasury, and roster grow, unlocking new zones (Scriptorium, Library, Observatory, Music Hall…) and facility upgrades along the way. The long game is influence: a deep backlist, aligned patrons, and works remembered long after the scholars who wrote them are gone. Lose the long game by going bankrupt or letting the roster empty out.

---

## Tech stack

| | |
|---|---|
| **Engine** | [Phaser 4](https://phaser.io/) (WebGL) |
| **Language** | TypeScript (ES2023) |
| **Build** | [Vite 8](https://vite.dev/) |
| **Rendering** | 1× pixel art drawn at 2× on a snapped 640×360 grid (crisp texels at any window size) |
| **State** | Plain `GameState` object → `localStorage` (version-gated, no server) |
| **Architecture** | Systems communicate over a typed event bus |

---

## Getting started

**Requirements:** Node 20+ and npm.

```bash
git clone https://github.com/SODIYAL/Embers-of-memory.git
cd Embers-of-memory
npm install
npm run dev        # start the Vite dev server
```

Open the printed local URL in your browser.

### Build

```bash
npm run build      # type-check (tsc) + bundle to dist/
npm run preview    # serve the production build locally
```

`npm run build` is the project's gate — there is no separate test suite; a clean type-check + bundle is what "passing" means.

---

## Project structure

```
src/
  main.ts            Phaser bootstrap + config
  scenes/            Boot, Menu, Campus (the main play scene) + campus layout
  game/              GameManager, TimeManager, SaveManager, EventBus, Audio, Chemistry
  systems/           Project, Economy, Ideology, Institution, Department,
                     Recruitment, Sales, Reprint, Milestone, World
  models/            GameState + domain types (Scholar, Project, Work, Economy…)
  data/              Authored content — scholars, topics, formats, patrons,
                     rivals, world/mid events, ideology tables
  ui/                DOM panels (project, scholars, treasury, ideology, world…)
                     and modals (stage gate, release report, decisions)
  utils/             Seeded RNG + generators

public/assets/       Shipped + generated pixel art (characters, buildings, props, UI)
public/fonts/        Alagard display font
art-src/             Sources for processed art (portraits, icons, workstations)
scripts/             Asset generation, audits, and headless screenshot/playtest harness
```

---

## Developer tooling

The asset pipeline is deterministic — regenerating produces byte-identical output.

| Command | What it does |
|---|---|
| `npm run assets:links` | Verify every referenced asset file actually exists |
| `npm run assets:audit` | Assert pixel assets match the sizes the engine assumes |
| `npm run assets:gen` | Regenerate procedural/processed pixel assets |
| `npm run assets:ui` | Regenerate the drawn pixel UI (buttons, indicators, cursors…) |
| `npm run shots [outDir]` | Headless screenshots of 5 campus scenarios |
| `npm run playtest [outDir]` | Automated full-loop playthrough (starts a project, clicks through events/gates/release, verifies sales + save-reload) |

The screenshot/playtest harness needs two ad-hoc, **not-in-`package.json`** dependencies; on Windows/macOS it uses a locally installed Chrome/Edge instead:

```bash
npm install --no-save @sparticuz/chromium puppeteer-core
```

The game exposes `window.__embers = { Game, Events, GameEvents }`, so the harness and the browser console can drive game state directly.

> Deeper architecture notes — the event bus, save versioning, the art pipeline, and campus-scene conventions — live in [`CLAUDE.md`](CLAUDE.md).

---

## Save data

All progress is stored in the browser's `localStorage`. Saves are **version-gated**: bumping `CURRENT_SAVE_VERSION` in [`src/game/SaveManager.ts`](src/game/SaveManager.ts) invalidates old saves (there are no migrations). Clearing site data resets the game.

---

## Credits & license

- Display font: **Alagard** by Hewett Tsoi.
- Generic scholar/student sprites are palette-swapped from the **yildiz** character sheets.

No license has been chosen yet. Until one is added, all rights are reserved by the author — if you intend to use, fork, or redistribute this project, please add a `LICENSE` file or get in touch first.
