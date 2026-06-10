import sharp from 'sharp';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ART = join(__dirname, '../../Art/Generated');
const BATCHES = join(ART, 'batches');
const OUT = join(__dirname, '../public/assets');

sharp.cache(false);

const todos = [];

const dirs = ['backgrounds', 'buildings', 'characters', 'cursors', 'fx', 'icons', 'portraits', 'props', 'ui'];

async function mkdirp(path) {
  await fs.mkdir(path, { recursive: true });
}

async function resetOutputDirs() {
  await mkdirp(OUT);
  for (const dir of dirs) {
    await fs.rm(join(OUT, dir), { recursive: true, force: true });
    await mkdirp(join(OUT, dir));
  }
  for (const name of await fs.readdir(OUT)) {
    if (name.endsWith('.png')) await fs.rm(join(OUT, name), { force: true });
  }
}

function isChecker(r, g, b) {
  return r > 218 && g > 218 && b > 218 && Math.abs(r - g) < 16 && Math.abs(g - b) < 16;
}

async function alphaBuffer(src, crop = null) {
  let img = sharp(src).ensureAlpha();
  if (crop) img = img.extract(crop);
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  for (let p = 0; p < out.length; p += info.channels) {
    const r = out[p], g = out[p + 1], b = out[p + 2];
    if (isChecker(r, g, b)) out[p + 3] = 0;
  }
  return { data: out, info };
}

async function components(src, minArea = 500) {
  const { data, info } = await alphaBuffer(src);
  const { width, height, channels } = info;
  const mask = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < mask.length; i++, p += channels) {
    mask[i] = data[p + 3] > 0 ? 1 : 0;
  }

  const seen = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const found = [];

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let qs = 0, qe = 0;
    queue[qe++] = start;
    seen[start] = 1;
    let minx = start % width, maxx = minx;
    let miny = Math.floor(start / width), maxy = miny;
    let count = 0;

    while (qs < qe) {
      const id = queue[qs++];
      const x = id % width;
      const y = Math.floor(id / width);
      count++;
      if (x < minx) minx = x;
      if (x > maxx) maxx = x;
      if (y < miny) miny = y;
      if (y > maxy) maxy = y;

      for (const off of [-width - 1, -width, -width + 1, -1, 1, width - 1, width, width + 1]) {
        const ni = id + off;
        if (ni < 0 || ni >= mask.length) continue;
        const nx = ni % width;
        const ny = Math.floor(ni / width);
        if (Math.abs(nx - x) > 1 || Math.abs(ny - y) > 1) continue;
        if (mask[ni] && !seen[ni]) {
          seen[ni] = 1;
          queue[qe++] = ni;
        }
      }
    }

    if (count >= minArea) found.push({ minx, miny, maxx, maxy, width: maxx - minx + 1, height: maxy - miny + 1, count });
  }

  return found.sort((a, b) => a.miny - b.miny || a.minx - b.minx);
}

function padBox(box, pad, imageWidth, imageHeight) {
  const left = Math.max(0, box.minx - pad);
  const top = Math.max(0, box.miny - pad);
  const right = Math.min(imageWidth - 1, box.maxx + pad);
  const bottom = Math.min(imageHeight - 1, box.maxy + pad);
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

async function sheetMeta(src) {
  const meta = await sharp(src).metadata();
  return { width: meta.width, height: meta.height };
}

async function writeCrop(src, box, dst, size, pad = 8) {
  await mkdirp(dirname(dst));
  const meta = await sheetMeta(src);
  const crop = padBox(box, pad, meta.width, meta.height);
  const { data, info } = await alphaBuffer(src, crop);
  await sharp(data, { raw: info })
    .resize(size[0], size[1], { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'nearest' })
    .png()
    .toFile(dst);
}

async function writeCropCover(src, crop, dst, size) {
  await mkdirp(dirname(dst));
  await sharp(src).extract(crop).resize(size[0], size[1], { fit: 'cover', position: 'center' }).png().toFile(dst);
}

async function makeSpriteSheet(src, boxes, dst, cols, frameW = 32, frameH = 48) {
  await mkdirp(dirname(dst));
  const frames = [];
  for (const box of boxes) {
    const meta = await sheetMeta(src);
    const crop = padBox(box, 6, meta.width, meta.height);
    const { data, info } = await alphaBuffer(src, crop);
    const frame = await sharp(data, { raw: info })
      .resize(frameW, frameH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'nearest' })
      .png()
      .toBuffer();
    frames.push({ input: frame, left: frames.length * frameW, top: 0 });
  }
  await sharp({
    create: {
      width: cols * frameW,
      height: frameH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite(frames).png().toFile(dst);
}

function groupRows(boxes, tolerance = 90) {
  const rows = [];
  for (const box of boxes) {
    let row = rows.find((items) => Math.abs(items[0].miny - box.miny) < tolerance);
    if (!row) {
      row = [];
      rows.push(row);
    }
    row.push(box);
  }
  return rows
    .map((row) => row.sort((a, b) => a.minx - b.minx))
    .sort((a, b) => a[0].miny - b[0].miny);
}

async function svgPng(dst, width, height, svg) {
  await mkdirp(dirname(dst));
  await sharp(Buffer.from(svg)).resize(width, height).png().toFile(dst);
}

function parchmentButton(icon, active = false) {
  const bg = active ? '#C8872A' : '#E8D5A3';
  const border = active ? '#D4AF37' : '#3D2B1F';
  const symbols = {
    play: '<polygon points="13,9 13,23 23,16" fill="#3D2B1F"/>',
    pause: '<rect x="10" y="9" width="4" height="14" fill="#3D2B1F"/><rect x="18" y="9" width="4" height="14" fill="#3D2B1F"/>',
    fast: '<polygon points="8,9 8,23 17,16" fill="#3D2B1F"/><polygon points="16,9 16,23 25,16" fill="#3D2B1F"/>',
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><ellipse cx="16" cy="16" rx="13" ry="13" fill="${bg}" stroke="${border}" stroke-width="2"/>${symbols[icon]}</svg>`;
}

function moraleSvg(count) {
  let flames = '';
  for (let i = 0; i < 5; i++) {
    const x = 6 + i * 11;
    const lit = i < count;
    flames += `<path d="M${x},13 C${x - 4},9 ${x + 1},5 ${x},2 C${x + 6},7 ${x + 4},10 ${x},13 Z" fill="${lit ? '#FFD66B' : '#6B4226'}" stroke="#1A1009" stroke-width="1"/>`;
    if (lit) flames += `<path d="M${x},10 C${x - 1},8 ${x + 1},6 ${x},5 C${x + 3},8 ${x + 2},9 ${x},10 Z" fill="#F4ECD4"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="16">${flames}</svg>`;
}

function mapIconSvg(kind) {
  const inner = {
    player: '<rect x="6" y="5" width="4" height="8" fill="#D4AF37"/><path d="M8 2 C4 7 6 11 8 14 C10 11 12 7 8 2Z" fill="#FFD66B" opacity=".8"/>',
    rival: '<rect x="3" y="4" width="10" height="8" rx="1" fill="#E8D5A3" stroke="#1A1009"/><circle cx="11" cy="10" r="2" fill="#8B2D42"/>',
    city: '<rect x="4" y="6" width="8" height="7" fill="#7A6E5F" stroke="#1A1009"/><polygon points="4,6 8,2 12,6" fill="#AFA090" stroke="#1A1009"/>',
    trade: '<circle cx="3" cy="8" r="1.5" fill="#6B4226"/><circle cx="8" cy="8" r="1.5" fill="#6B4226"/><circle cx="13" cy="8" r="1.5" fill="#6B4226"/>',
    event: '<circle cx="8" cy="8" r="6" fill="#C43030" stroke="#1A1009"/><rect x="7" y="4" width="2" height="6" fill="#F4ECD4"/><rect x="7" y="11" width="2" height="2" fill="#F4ECD4"/>',
  }[kind];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">${inner}</svg>`;
}

function cursorSvg(kind) {
  const dot = kind === 'hover' ? '<circle cx="4" cy="21" r="1.4" fill="#1A1009"/>' : '';
  const splash = kind === 'click' ? '<circle cx="4" cy="21" r="1.5" fill="#1A1009"/><circle cx="2" cy="19" r=".8" fill="#1A1009"/>' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="24"><path d="M13 1 C8 2 5 7 3 18 C7 15 12 8 13 1Z" fill="#F4ECD4" stroke="#1A1009"/><path d="M3 18 L1 23 L6 19 Z" fill="#D4AF37" stroke="#1A1009"/>${dot}${splash}</svg>`;
}

async function drawManualAssets() {
  for (const [name, bg, border] of [
    ['btn_primary.png', '#C8872A', '#D4AF37'],
    ['btn_primary_hover.png', '#D4951A', '#F0E080'],
    ['btn_secondary.png', '#E8D5A3', '#3D2B1F'],
    ['btn_secondary_hover.png', '#F4ECD4', '#3D2B1F'],
    ['btn_disabled.png', '#C4A87A', '#7A6E5F'],
  ]) {
    await svgPng(join(OUT, 'ui', name), 160, 44, `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="44"><rect x="2" y="2" width="156" height="40" rx="6" fill="${bg}" stroke="${border}" stroke-width="3"/><rect x="8" y="8" width="144" height="28" rx="3" fill="none" stroke="#F4ECD4" opacity=".35"/></svg>`);
  }

  for (const [name, icon, active] of [
    ['btn_play.png', 'play', false],
    ['btn_play_active.png', 'play', true],
    ['btn_pause.png', 'pause', false],
    ['btn_pause_active.png', 'pause', true],
    ['btn_fast.png', 'fast', false],
    ['btn_fast_active.png', 'fast', true],
  ]) await svgPng(join(OUT, 'ui', name), 32, 32, parchmentButton(icon, active));

  for (let i = 1; i <= 5; i++) await svgPng(join(OUT, 'ui', `ui_morale_${i}.png`), 60, 16, moraleSvg(i));
  for (const kind of ['player', 'rival', 'city', 'trade', 'event']) await svgPng(join(OUT, 'icons', `map_icon_${kind}.png`), 16, 16, mapIconSvg(kind));
  for (const kind of ['default', 'hover', 'click']) await svgPng(join(OUT, 'cursors', `cursor_${kind}.png`), 16, 24, cursorSvg(kind));

  await svgPng(join(OUT, 'ui', 'ui_border_simple.png'), 512, 320, `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="320"><rect x="2" y="2" width="508" height="316" fill="none" stroke="#3D2B1F" stroke-width="4"/><rect x="9" y="9" width="494" height="302" fill="none" stroke="#C4A87A" stroke-width="2"/><circle cx="24" cy="24" r="8" fill="#D4AF37" stroke="#1A1009"/><circle cx="488" cy="24" r="8" fill="#D4AF37" stroke="#1A1009"/><circle cx="24" cy="296" r="8" fill="#D4AF37" stroke="#1A1009"/><circle cx="488" cy="296" r="8" fill="#D4AF37" stroke="#1A1009"/></svg>`);
  await svgPng(join(OUT, 'ui', 'ui_border_ornate.png'), 512, 320, `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="320"><rect x="5" y="5" width="502" height="310" fill="none" stroke="#1A1009" stroke-width="5"/><rect x="15" y="15" width="482" height="290" fill="none" stroke="#D4AF37" stroke-width="3"/><path d="M25 45 C45 20 70 20 90 45 M422 45 C442 20 467 20 487 45 M25 275 C45 300 70 300 90 275 M422 275 C442 300 467 300 487 275" fill="none" stroke="#8B2D42" stroke-width="4"/><circle cx="34" cy="34" r="9" fill="#D4AF37" stroke="#1A1009"/><circle cx="478" cy="34" r="9" fill="#D4AF37" stroke="#1A1009"/><circle cx="34" cy="286" r="9" fill="#D4AF37" stroke="#1A1009"/><circle cx="478" cy="286" r="9" fill="#D4AF37" stroke="#1A1009"/></svg>`);
  await svgPng(join(OUT, 'ui', 'slider_track.png'), 200, 12, `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="12"><rect x="0" y="2" width="200" height="8" fill="#3D2B1F"/><rect x="2" y="4" width="196" height="4" fill="#E8D5A3"/><rect x="2" y="7" width="196" height="1" fill="#C4A87A"/></svg>`);
  await svgPng(join(OUT, 'ui', 'ui_progress_bar_track.png'), 240, 18, `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="18"><rect x="1" y="3" width="238" height="12" rx="3" fill="#3D2B1F"/><rect x="4" y="6" width="232" height="6" fill="#E8D5A3"/><rect x="4" y="11" width="232" height="1" fill="#C4A87A"/></svg>`);
  await svgPng(join(OUT, 'ui', 'ui_progress_bar_fill.png'), 230, 10, `<svg xmlns="http://www.w3.org/2000/svg" width="230" height="10"><rect width="230" height="10" fill="#C8872A"/><rect width="230" height="2" fill="#FFD66B"/></svg>`);
  await svgPng(join(OUT, 'ui', 'slider_thumb.png'), 16, 20, `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="20"><path d="M8 1 L15 7 L12 18 L4 18 L1 7 Z" fill="#D4AF37" stroke="#1A1009"/></svg>`);
  await svgPng(join(OUT, 'ui', 'ui_tab_active.png'), 120, 36, `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="36"><path d="M8 35 L8 10 Q8 3 16 3 H104 Q112 3 112 10 V35 Z" fill="#F4ECD4" stroke="#1A1009" stroke-width="2"/><path d="M18 8 H102" stroke="#D4AF37" stroke-width="2"/></svg>`);
  await svgPng(join(OUT, 'ui', 'ui_tab_inactive.png'), 120, 36, `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="36"><path d="M8 35 L8 12 Q8 6 16 6 H104 Q112 6 112 12 V35 Z" fill="#C4A87A" stroke="#3D2B1F" stroke-width="2"/></svg>`);

  const qualities = [
    ['badge_quality_1.png', 'A Flawed but Earnest Attempt', '#D7D2C4', '#3D2B1F', 10],
    ['badge_quality_2.png', 'A Modest Effort', '#CFC4A8', '#3D2B1F', 12],
    ['badge_quality_3.png', 'A Competent Work', '#E8D5A3', '#3D2B1F', 12],
    ['badge_quality_4.png', 'A Respected Contribution', '#6B4226', '#F4ECD4', 11],
    ['badge_quality_5.png', 'A Celebrated Achievement', '#C8872A', '#1A1009', 11],
    ['badge_quality_6.png', 'A Landmark Work', '#D4AF37', '#1A1009', 12],
  ];
  for (const [file, text, bg, fg, size] of qualities) {
    await svgPng(join(OUT, 'ui', file), 200, 60, `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><rect width="200" height="60" fill="${bg}"/><rect x="2" y="2" width="196" height="56" fill="none" stroke="#1A1009" stroke-width="2"/><rect x="8" y="8" width="184" height="44" fill="none" stroke="#F0E080"/><text x="100" y="35" font-family="Georgia,serif" font-size="${size}" font-weight="bold" text-anchor="middle" fill="${fg}">${text}</text></svg>`);
  }

  for (const [file, left, right] of [
    ['ui_ideology_access.png', '#4A2060', '#4A7C59'],
    ['ui_ideology_authority.png', '#8B2D42', '#26619C'],
    ['ui_ideology_cosmology.png', '#D4AF37', '#7A6E5F'],
    ['ui_ideology_method.png', '#1A3A6B', '#7DA882'],
    ['ui_ideology_purpose.png', '#8B5E00', '#7A9CC4'],
  ]) {
    await svgPng(join(OUT, 'ui', file), 200, 24, `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="24"><defs><linearGradient id="g"><stop offset="0" stop-color="${left}"/><stop offset="1" stop-color="${right}"/></linearGradient></defs><rect x="1" y="4" width="198" height="16" fill="url(#g)" stroke="#3D2B1F" stroke-width="2"/><circle cx="100" cy="12" r="6" fill="#D4AF37" stroke="#1A1009"/></svg>`);
  }

  for (const [name, color] of [['ui_skill_bar_fill_low.png', '#6B4226'], ['ui_skill_bar_fill_mid.png', '#C8872A'], ['ui_skill_bar_fill_high.png', '#D4AF37']]) {
    await svgPng(join(OUT, 'ui', name), 110, 4, `<svg xmlns="http://www.w3.org/2000/svg" width="110" height="4"><rect width="110" height="4" fill="${color}"/><rect width="110" height="1" fill="${name.includes('high') ? '#F0E080' : color}"/></svg>`);
  }
  await svgPng(join(OUT, 'ui', 'ui_skill_bar_track.png'), 120, 10, `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="10"><rect width="120" height="10" fill="#3D2B1F"/><rect x="2" y="2" width="116" height="6" fill="#C4A87A"/></svg>`);

  await svgPng(join(OUT, 'props', 'prop_lantern_off.png'), 16, 24, `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="24"><line x1="8" y1="1" x2="8" y2="5" stroke="#D4AF37"/><rect x="4" y="5" width="8" height="13" fill="#7A6E5F" stroke="#1A1009"/><rect x="6" y="18" width="4" height="3" fill="#3D2B1F"/><line x1="3" y1="20" x2="13" y2="20" stroke="#D4AF37"/></svg>`);
  await svgPng(join(OUT, 'props', 'tile_wall.png'), 16, 16, `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#7A6E5F"/><path d="M0 4 H16 M0 9 H16 M0 14 H16 M5 0 V4 M11 4 V9 M4 9 V14 M12 14 V16" stroke="#4A4035" stroke-width="1"/><path d="M1 1 H5 M7 5 H10" stroke="#AFA090" stroke-width="1"/></svg>`);

  for (const [file, fill] of [
    ['indicator_prosperous.png', '#FFD66B'],
    ['indicator_stable.png', '#FFD66B'],
    ['indicator_strained.png', '#C8872A'],
    ['indicator_critical.png', '#8B5E00'],
  ]) {
    await svgPng(join(OUT, 'ui', file), 40, 60, `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="60"><rect x="14" y="20" width="12" height="32" fill="#F4ECD4" stroke="#1A1009"/><path d="M20 5 C10 18 16 25 20 30 C25 24 31 17 20 5Z" fill="${fill}" stroke="#1A1009"/><path d="M20 13 C17 19 19 22 20 24 C22 21 24 18 20 13Z" fill="#F4ECD4"/></svg>`);
  }

  await svgPng(join(OUT, 'ui', 'ui_panel_parchment.png'), 400, 600, `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="#E8D5A3"/><rect x="8" y="8" width="384" height="584" fill="none" stroke="#3D2B1F" stroke-width="4"/><rect x="18" y="18" width="364" height="564" fill="none" stroke="#C4A87A" stroke-width="2"/></svg>`);
  await svgPng(join(OUT, 'ui', 'card_scholar.png'), 200, 260, `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="260"><rect x="2" y="2" width="196" height="256" rx="5" fill="#E8D5A3" stroke="#1A1009" stroke-width="3"/><rect x="60" y="18" width="80" height="80" fill="#F4ECD4" stroke="#3D2B1F" stroke-width="2"/><rect x="18" y="115" width="164" height="16" fill="#C4A87A"/><rect x="18" y="145" width="164" height="6" fill="#C4A87A"/><rect x="18" y="165" width="120" height="6" fill="#C4A87A"/><rect x="18" y="210" width="74" height="20" rx="8" fill="#F4ECD4" stroke="#3D2B1F"/><rect x="104" y="210" width="74" height="20" rx="8" fill="#F4ECD4" stroke="#3D2B1F"/></svg>`);
  await svgPng(join(OUT, 'ui', 'ui_modal_decision.png'), 490, 376, `<svg xmlns="http://www.w3.org/2000/svg" width="490" height="376"><rect x="5" y="5" width="480" height="366" rx="8" fill="#E8D5A3" stroke="#1A1009" stroke-width="5"/><rect x="20" y="20" width="450" height="336" fill="none" stroke="#D4AF37" stroke-width="3"/><path d="M25 55 C55 20 90 20 120 55 M370 55 C400 20 435 20 465 55" fill="none" stroke="#8B2D42" stroke-width="4"/></svg>`);
  await svgPng(join(OUT, 'ui', 'ui_modal_release.png'), 490, 376, `<svg xmlns="http://www.w3.org/2000/svg" width="490" height="376"><rect x="5" y="5" width="480" height="366" rx="8" fill="#F4ECD4" stroke="#1A1009" stroke-width="5"/><rect x="20" y="20" width="450" height="336" fill="none" stroke="#D4AF37" stroke-width="4"/><circle cx="245" cy="55" r="18" fill="#D4AF37" stroke="#1A1009"/></svg>`);
  await svgPng(join(OUT, 'ui', 'ui_notification.png'), 550, 60, `<svg xmlns="http://www.w3.org/2000/svg" width="550" height="60"><rect x="3" y="8" width="544" height="44" rx="8" fill="#E8D5A3" stroke="#1A1009" stroke-width="3"/><path d="M18 12 H532" stroke="#D4AF37" stroke-width="2"/></svg>`);
  await svgPng(join(OUT, 'ui', 'ui_world_report_letter.png'), 532, 376, `<svg xmlns="http://www.w3.org/2000/svg" width="532" height="376"><path d="M45 15 H487 L510 350 H22 Z" fill="#E8D5A3" stroke="#1A1009" stroke-width="4"/><path d="M45 15 L265 150 L487 15 M22 350 L205 210 M510 350 L327 210" fill="none" stroke="#C4A87A" stroke-width="3"/></svg>`);

  await svgPng(join(OUT, 'icons', 'icon_topic_literature.png'), 64, 64, `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect x="10" y="14" width="44" height="36" rx="3" fill="#E8D5A3" stroke="#1A1009" stroke-width="3"/><path d="M32 15 V50 M16 24 H28 M36 24 H48 M16 32 H28 M36 32 H48" stroke="#6B4226" stroke-width="2"/><path d="M16 8 H48" stroke="#D4AF37" stroke-width="4"/></svg>`);
  await svgPng(join(OUT, 'icons', 'icon_topic_mysticism.png'), 64, 64, `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="22" fill="#1A3A6B" stroke="#1A1009" stroke-width="3"/><path d="M32 12 L37 27 L53 27 L40 36 L45 52 L32 42 L19 52 L24 36 L11 27 L27 27 Z" fill="#FFD66B"/></svg>`);
  await svgPng(join(OUT, 'icons', 'icon_format_lecture.png'), 64, 64, `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect x="10" y="34" width="44" height="10" fill="#6B4226" stroke="#1A1009"/><rect x="18" y="20" width="28" height="24" fill="#E8D5A3" stroke="#1A1009"/><path d="M24 28 H40 M24 34 H38" stroke="#3D2B1F" stroke-width="2"/></svg>`);
  await svgPng(join(OUT, 'icons', 'icon_format_field_survey.png'), 64, 64, `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><path d="M12 14 L30 9 L52 16 L46 52 L26 47 L10 54 Z" fill="#E8D5A3" stroke="#1A1009" stroke-width="3"/><path d="M30 9 L26 47 M52 16 L46 52 M18 25 C28 21 35 31 46 26" stroke="#6B4226" stroke-width="2"/><path d="M39 36 L49 46 M49 36 L39 46" stroke="#C43030" stroke-width="4"/></svg>`);

  const figure = (x, color) => `<circle cx="${x + 16}" cy="14" r="5" fill="#C49A7A" stroke="#1A1009"/><path d="M${x + 8} 42 L${x + 13} 21 H${x + 20} L${x + 24} 42 Z" fill="${color}" stroke="#1A1009"/><path d="M${x + 10} 30 H${x + 23}" stroke="#D4AF37"/>`;
  for (const [file, color] of [
    ['scholar_generic_a_idle.png', '#4A7C59'],
    ['scholar_generic_b_idle.png', '#26619C'],
    ['scholar_generic_c_idle.png', '#8B2D42'],
    ['student_idle.png', '#C8872A'],
    ['student_walk.png', '#7DA882'],
  ]) {
    await svgPng(join(OUT, 'characters', file), 128, 48, `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="48">${[0, 32, 64, 96].map((x) => figure(x, color)).join('')}</svg>`);
  }
}

async function run() {
  console.log('Resetting generated runtime assets...');
  await resetOutputDirs();

  console.log('Backgrounds...');
  for (const name of ['campus_founding_hall_day', 'campus_founding_hall_night', 'campus_founding_hall_winter', 'interior_scriptorium', 'interior_library']) {
    await sharp(join(ART, 'backgrounds', `${name}.png`)).resize(1280, 720, { fit: 'cover', position: 'center' }).png().toFile(join(OUT, 'backgrounds', `${name}.png`));
  }

  console.log('Portraits...');
  {
    const src = join(BATCHES, 'tier1_portraits_sheet.png');
    const boxes = await components(src, 5000);
    const names = ['portrait_harlow', 'portrait_meridian', 'portrait_ossavi', 'portrait_vasara', 'portrait_yildiz'];
    for (let i = 0; i < Math.min(5, boxes.length); i++) await writeCrop(src, boxes[i], join(OUT, 'portraits', `${names[i]}.png`), [80, 80], 18);
  }

  console.log('Scholar sprites...');
  {
    const src = join(BATCHES, 'tier1_scholar_idle_sheet.png');
    const rows = groupRows(await components(src, 2000), 80);
    const names = ['yildiz', 'ossavi', 'meridian', 'vasara', 'harlow'];
    for (let r = 0; r < Math.min(rows.length, names.length); r++) await makeSpriteSheet(src, rows[r].slice(0, 4), join(OUT, 'characters', `scholar_${names[r]}_idle.png`), 4);
  }
  {
    const src = join(BATCHES, 'tier2_scholar_animation_sheet.png');
    const rows = groupRows((await components(src, 2000)).filter((b) => b.width > 40 && b.height > 40), 80);
    const names = ['yildiz', 'ossavi', 'meridian', 'vasara', 'harlow'];
    for (let r = 0; r < Math.min(rows.length, names.length); r++) {
      const row = rows[r];
      await makeSpriteSheet(src, row.slice(0, 4), join(OUT, 'characters', `scholar_${names[r]}_walk.png`), 4);
      await makeSpriteSheet(src, row.slice(4, 6), join(OUT, 'characters', `scholar_${names[r]}_sit.png`), 2);
      await makeSpriteSheet(src, row.slice(6, 8), join(OUT, 'characters', `scholar_${names[r]}_react.png`), 2);
    }
  }

  console.log('Buildings and props...');
  {
    const src = join(BATCHES, 'tier2_campus_buildings_props_sheet.png');
    const all = await components(src, 4000);
    const rows = [
      all.filter((b) => b.miny < 430).sort((a, b) => a.minx - b.minx),
      all.filter((b) => b.miny >= 430 && b.miny < 760).sort((a, b) => a.minx - b.minx),
      all.filter((b) => b.miny >= 760).sort((a, b) => a.miny - b.miny || a.minx - b.minx),
    ];
    const buildingNames = [
      ['building_founding_hall', 'building_library', 'building_observatory', 'building_music_hall', 'prop_garden'],
      ['building_scriptorium_wing', 'prop_teaching_courtyard', 'building_archive_vault', 'building_guest_quarters', 'building_public_hall', 'building_founders_tower'],
    ];
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < rows[r].length && i < buildingNames[r].length; i++) {
        await writeCrop(src, rows[r][i], join(OUT, 'buildings', `${buildingNames[r][i]}.png`), [buildingNames[r][i] === 'building_founders_tower' ? 72 : 128, 96], 12);
      }
    }
    const propNames = ['prop_bench', 'prop_inkquill', 'prop_manuscripts', null, 'prop_lantern_on', 'prop_tree', 'prop_well', 'tile_flagstone', 'tile_grass'];
    const propSizes = [[32, 16], [16, 16], [16, 24], null, [16, 24], [48, 64], [32, 32], [16, 16], [16, 16]];
    const propRows = rows[2].sort((a, b) => a.minx - b.minx);
    for (let i = 0; i < Math.min(propNames.length, propRows.length); i++) {
      if (!propNames[i]) continue;
      await writeCrop(src, propRows[i], join(OUT, 'props', `${propNames[i]}.png`), propSizes[i], 8);
    }
  }

  console.log('Icons and badges...');
  {
    const src = join(BATCHES, 'tier3_icons_badges_complete_sheet.png');
    const rows = groupRows(await components(src, 4000), 90);
    const topicNames = ['icon_topic_astronomy', 'icon_topic_medicine', 'icon_topic_music', 'icon_topic_cartography', 'icon_topic_history', 'icon_topic_theology', 'icon_topic_philosophy', 'icon_topic_education', 'icon_topic_mathematics', 'icon_topic_natural_history', 'icon_topic_law', 'icon_topic_engineering', 'icon_topic_architecture', 'icon_topic_politics', 'icon_topic_trade', 'icon_topic_literature', 'icon_topic_mysticism'];
    const formatNames = ['icon_format_illuminated_manuscript', 'icon_format_atlas', 'icon_format_musical_composition', 'icon_format_chronicle', 'icon_format_epic_poetry', 'icon_format_handbook', 'icon_format_philosophical_treatise', 'icon_format_hymn', 'icon_format_sacred_text', 'icon_format_stage_performance', 'icon_format_scientific_compendium', 'icon_format_architectural_plans', 'icon_format_propaganda_pamphlet', 'icon_format_encyclopedia', 'icon_format_commentary', 'icon_format_correspondence', 'icon_format_field_survey', 'icon_format_lecture'];
    const patronNames = ['icon_patron_temple', 'icon_patron_merchant', 'icon_patron_ruler', 'icon_patron_scholarly', 'icon_patron_community'];
    const archetypeNames = ['badge_archetype_wandering_mystic', 'badge_archetype_pragmatic_chronicler', 'badge_archetype_skeptical_empiricist', 'badge_archetype_court_scholar', 'badge_archetype_spiritual_composer', 'badge_archetype_master_craftsperson', 'badge_archetype_theological_debater', 'badge_archetype_natural_philosopher', 'badge_archetype_oral_keeper', 'badge_archetype_political_theorist', 'badge_archetype_mathematical_mind', 'badge_archetype_kindler', 'badge_archetype_institutional_builder'];
    for (let i = 0; i < topicNames.length && i < rows[0].length; i++) await writeCrop(src, rows[0][i], join(OUT, 'icons', `${topicNames[i]}.png`), [64, 64], 10);
    for (let i = 0; i < formatNames.length && i < rows[1].length; i++) await writeCrop(src, rows[1][i], join(OUT, 'icons', `${formatNames[i]}.png`), [64, 64], 10);
    for (let i = 0; i < patronNames.length && i < rows[3].length; i++) await writeCrop(src, rows[3][i], join(OUT, 'icons', `${patronNames[i]}.png`), [64, 64], 10);
    for (let i = 0; i < archetypeNames.length && i < rows[4].length; i++) await writeCrop(src, rows[4][i], join(OUT, 'icons', `${archetypeNames[i]}.png`), [48, 48], 8);
  }

  console.log('Title/world/FX...');
  {
    const src = join(BATCHES, 'tier3_world_title_fx_sheet.png');
    const boxes = await components(src, 1000);
    await writeCropCover(src, { left: 21, top: 31, width: 556, height: 401 }, join(OUT, 'backgrounds', 'worldmap_base.png'), [960, 540]);
    await writeCropCover(src, { left: 592, top: 42, width: 537, height: 393 }, join(OUT, 'backgrounds', 'title_background.png'), [1280, 720]);
    await writeCropCover(src, { left: 1141, top: 43, width: 374, height: 392 }, join(OUT, 'backgrounds', 'screen_loading.png'), [1280, 720]);
    await writeCrop(src, boxes.find((b) => b.miny > 440 && b.minx < 80), join(OUT, 'ui', 'logo_embers_of_memory.png'), [600, 200], 8);
    await writeCrop(src, { minx: 40, miny: 718, maxx: 648, maxy: 820 }, join(OUT, 'fx', 'fx_candle_flame.png'), [48, 12], 0);
    await writeCrop(src, { minx: 700, miny: 720, maxx: 1299, maxy: 974 }, join(OUT, 'fx', 'fx_ink_splatter.png'), [160, 32], 0);
    await writeCrop(src, { minx: 40, miny: 894, maxx: 808, maxy: 974 }, join(OUT, 'fx', 'fx_gold_sparkle.png'), [96, 16], 0);
    await writeCrop(src, { minx: 893, miny: 894, maxx: 1299, maxy: 974 }, join(OUT, 'fx', 'fx_work_progress.png'), [32, 8], 0);
  }

  console.log('Manual UI and tiny assets...');
  await drawManualAssets();

  console.log('Trait chips...');
  {
    const src = join(BATCHES, 'ui_trait_chips_sheet.png');
    const rows = groupRows(await components(src, 10000), 140);
    const names = ['ui_trait_chip_base', 'ui_trait_chip_gold', 'ui_trait_chip_muted'];
    for (let i = 0; i < names.length && i < rows.length; i++) await writeCrop(src, rows[i][0], join(OUT, 'ui', `${names[i]}.png`), [80, 20], 8);
  }

  await fs.writeFile(join(__dirname, '../ASSET_TODOS.md'), [
    '# Asset Slicing TODOs',
    '',
    `Generated by \`scripts/slice-assets.mjs\` on ${new Date().toISOString().slice(0, 10)}.`,
    '',
    'The slicer uses component detection for irregular AI-generated sheets and deterministic drawing for small UI assets.',
    'All 10 source sheets in `Art/Generated/batches/` are processed; outputs land in `public/assets/`.',
    '',
    '## Visual Verification Still Needed',
    '- [ ] Confirm icon names match their intended topic/format/archetype after component-based extraction.',
    '- [ ] Confirm generated building names match the correct visual building.',
    '- [ ] Replace any placeholder-like deterministic UI art with final art if desired.',
    '- [ ] Trait chip sheet currently produces 3 background skins (base / gold / muted). Individual trait icons are not extracted; chips are rendered with text overlaid on `ui_trait_chip_base.png` (see `scholar-panel.css`).',
    '',
    todos.length > 0 ? '## Errors During This Run' : '## No Errors During This Run',
    ...todos.map((todo) => `- [ ] ${todo}`),
  ].join('\n'));

  console.log('Done.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
