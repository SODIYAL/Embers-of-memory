// Automated playtest — runs a full project loop in headless Chromium:
// begin → start a real project → fast-forward through mid-events and both
// stage gates (clicking the DOM modals like a player) → release → verify
// the work sells, then reload the page and confirm the save restores.
//
// Usage:  npm run build && node scripts/playtest.mjs [outDir]
// Needs:  npm install --no-save @sparticuz/chromium puppeteer-core

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';

const outDir = process.argv[2] ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

const puppeteer = await import('puppeteer-core');
const { resolveBrowser } = await import('./resolve-browser.mjs');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.wav': 'audio/wav',
};
const server = createServer(async (req, res) => {
  const path = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  try {
    const data = await readFile(join('dist', decodeURIComponent(path)));
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;

const { executablePath, args } = await resolveBrowser();
const browser = await puppeteer.launch({
  args,
  executablePath,
  headless: 'shell',
  defaultViewport: { width: 1280, height: 720 },
});
const page = await browser.newPage();
page.on('pageerror', e => console.log('[pageerror]', e.message));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const shot = name => page.screenshot({ path: join(outDir, `${name}.png`) }).then(() => console.log('captured', name));

await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle0' });
await sleep(3500);
await page.mouse.click(640, 475);   // Begin
await sleep(1600);

// Start a real project through the same path ProjectPanel uses.
await page.evaluate(() => {
  const { Game, Events, GameEvents } = window.__embers;
  const lead = Game.state.scholars[0];
  const assistants = Game.state.scholars.slice(1).filter(s => s.isAvailable);
  for (const s of [lead, ...assistants]) s.isAvailable = false;
  const project = {
    id: `proj_${Date.now()}`,
    topicId: 'astronomy',
    formatId: 'hymn',            // 30-day base — fast loop for testing
    leadScholarId: lead.id,
    assistantScholarIds: assistants.map(s => s.id),
    priorities: { Accuracy: 3, Spirituality: 2 },
    state: 'in_development',
    progress: 0,
    qualityScore: 0,
    startDay: Game.state.day,
    currentStageIndex: 0,
    stages: [{
      key: 'research',
      leadScholarId: lead.id,
      assistantScholarIds: assistants.map(s => s.id),
      qualitySlice: 0,
      startDay: Game.state.day,
    }],
  };
  Game.state.activeProject = project;
  Events.emit(GameEvents.PROJECT_STARTED, { project });
  Game.time.setSpeed('fast');
});

// Drive the run: whenever a DOM modal appears, click through it the way a
// player would. Stop when one work is released and the modal is closed.
let stageGates = 0, midEvents = 0, released = false;
const deadline = Date.now() + 120_000;
while (Date.now() < deadline) {
  const acted = await page.evaluate(() => {
    const visible = sel => document.querySelector(sel);
    const collect = visible('#release-collect');
    if (collect) { collect.click(); return 'release'; }
    const gateCard = visible('.stage-gate-card');
    if (gateCard) {
      const lead = gateCard.querySelector('.stage-lead-btn');
      if (lead && !lead.classList.contains('selected')) { lead.click(); return 'gate-lead'; }
      const confirm = gateCard.querySelector('#stage-gate-confirm');
      if (confirm && !confirm.disabled) { confirm.click(); return 'gate-confirm'; }
      return 'gate-wait';
    }
    const choice = visible('.modal-btn-choice');
    if (choice) { choice.click(); return 'choice'; }
    const ok = visible('#event-modal-ok');
    if (ok) { ok.click(); return 'ok'; }
    const confirm = visible('#decision-confirm');
    if (confirm) { confirm.click(); return 'confirm'; }
    return null;
  });
  if (acted === 'release') { released = true; console.log('clicked: release collect'); }
  else if (acted === 'gate-confirm') { stageGates++; console.log('clicked: stage gate confirm', stageGates); }
  else if (acted === 'choice' || acted === 'ok') { midEvents++; console.log('clicked:', acted); }

  if (acted === 'gate-confirm' && stageGates === 1) await shot('pt-after-gate1');

  if (released) {
    const done = await page.evaluate(() => {
      const { Game } = window.__embers;
      return Game.state.completedWorks.length > 0 && !Game.state.activeProject;
    });
    if (done) break;
  }
  await sleep(600);
}

const result = await page.evaluate(() => {
  const { Game } = window.__embers;
  const work = Game.state.completedWorks[0];
  return {
    day: Game.state.day,
    treasury: Game.state.treasury,
    works: Game.state.completedWorks.length,
    workTitle: work?.title,
    quality: work?.qualityScore,
    selling: !!(work?.salesState && !work.salesState.complete),
    scholarsAvailable: Game.state.scholars.filter(s => s.isAvailable).length,
  };
});
console.log('after release:', JSON.stringify(result));
await shot('pt-released');

// Let sales tick a few days, then reload and resume from the save.
await sleep(4000);
await page.reload({ waitUntil: 'networkidle0' });
await sleep(3500);
await page.mouse.click(640, 461);   // Continue
await sleep(2200);
const resumed = await page.evaluate(() => {
  const { Game } = window.__embers;
  return { day: Game.state.day, works: Game.state.completedWorks.length, scholars: Game.state.scholars.length };
});
console.log('after resume:', JSON.stringify(resumed));
await shot('pt-resumed');

console.log(`RESULT: stageGates=${stageGates} midEvents=${midEvents} released=${released} resumeOk=${resumed.works >= 1}`);
await browser.close();
server.close();
