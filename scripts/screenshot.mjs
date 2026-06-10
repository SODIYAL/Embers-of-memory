// Screenshot harness — drives the built game in headless Chromium and
// captures campus scenarios for visual review.
//
// Usage:  npm run build && node scripts/screenshot.mjs [outDir]
//
// Requires dev deps that are NOT in package.json (install ad hoc):
//   npm install --no-save @sparticuz/chromium puppeteer-core
//
// Scenarios captured:
//   01-menu            title screen
//   02-campus-day      fresh campus, daytime
//   03-campus-work     active project, team seated at the workstation
//   04-campus-night    month-end night with lantern glow
//   05-campus-winter   winter month with snowfall

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';

const outDir = process.argv[2] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

const chromium = (await import('@sparticuz/chromium')).default;
const puppeteer = await import('puppeteer-core');

// ── Tiny static server over dist/ ─────────────────────────────────
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.wav': 'audio/wav', '.json': 'application/json',
};
const server = createServer(async (req, res) => {
  const path = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const file = join('dist', decodeURIComponent(path));
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('not found');
  }
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;
console.log(`serving dist/ on :${port}`);

if (!existsSync('dist/index.html')) {
  console.error('dist/ missing — run `npm run build` first');
  process.exit(1);
}

// ── Browser ────────────────────────────────────────────────────────
chromium.setGraphicsMode = true; // WebGL via SwiftShader — Phaser 4 needs it
const browser = await puppeteer.launch({
  args: [...chromium.args, '--enable-unsafe-swiftshader'],
  executablePath: await chromium.executablePath(),
  headless: 'shell',
  defaultViewport: { width: 1280, height: 720 },
});
const page = await browser.newPage();
page.on('console', m => { if (m.type() === 'error') console.log('[page]', m.text()); });
page.on('pageerror', e => console.log('[pageerror]', e.message));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const shot = async name => {
  await page.screenshot({ path: join(outDir, `${name}.png`) });
  console.log('captured', name);
};
// Click on game canvas at design coordinates (viewport matches 1280x720).
const click = (x, y) => page.mouse.click(x, y);

await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle0' });
await sleep(3500);            // boot + menu fade-in
await shot('01-menu');

// Begin (fresh save) at (640, 475); if a save existed, Continue is at (640, 461).
await click(640, 475);
await sleep(1600);            // fade-out + campus fade-in
await shot('02-campus-day');

// Fabricate an active project so the team gathers at the workstation.
await page.evaluate(() => {
  const { Game, Events, GameEvents } = window.__embers;
  const scholars = Game.state.scholars;
  const lead = scholars[0];
  const assistants = scholars.slice(1).filter(s => s.isAvailable).slice(0, 3);
  for (const s of [lead, ...assistants]) s.isAvailable = false;
  const project = {
    id: 'shot_project',
    topicId: 'astronomy',
    formatId: 'scientific_compendium',
    leadScholarId: lead.id,
    assistantScholarIds: assistants.map(s => s.id),
    priorities: { Accuracy: 4, Innovation: 3 },
    state: 'in_development',
    progress: 0.18,
    qualityScore: 0,
    startDay: Game.state.day,
    currentStageIndex: 0,
    stages: [{
      key: 'research',
      leadScholarId: lead.id,
      assistantScholarIds: assistants.map(s => s.id),
      qualitySlice: 0,
      startDay: Game.state.day,
      emphasis: { Rigor: 3 },
    }],
  };
  Game.state.activeProject = project;
  Events.emit(GameEvents.PROJECT_STARTED, { project });
});
await sleep(4500);            // walk to seats, emotes/bubbles begin
await shot('03-campus-work');

// Night: jump to a month-end day and let the dusk tween settle.
await page.evaluate(() => {
  const { Game, Events, GameEvents } = window.__embers;
  Game.time.setSpeed('paused');
  Game.state.day = 26;
  Events.emit(GameEvents.DAY_PASSED, { day: 26 });
});
await sleep(1800);
await shot('04-campus-night');

// Winter: month 12 (day ~332, daytime part of the month).
await page.evaluate(() => {
  const { Game, Events, GameEvents } = window.__embers;
  Game.state.day = 332;
  Events.emit(GameEvents.DAY_PASSED, { day: 332 });
});
await sleep(5000);            // dawn tween + snow starts falling
await shot('05-campus-winter');

await browser.close();
server.close();
console.log(`done — screenshots in ${outDir}/`);
