// Procedural pixel-art UI — deterministically draws every small UI asset
// that used to be a bad AI-sheet crop. Raw RGBA buffers, no anti-aliasing,
// no randomness: running twice yields byte-identical PNGs.
//
// Usage:  node scripts/draw-pixel-ui.mjs
//
// All sizes are native art resolution; the engine draws them at 2× (and the
// DOM shows them with image-rendering: pixelated), so the on-screen pixel
// grain matches the 2×-scaled character sprites.

import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'public/assets';

// ── Palette (mirrors the DOM theme tokens in src/ui/ui-theme.css) ──
const C = {
  ink:        [0x18, 0x10, 0x0a],
  shadow:     [0x2e, 0x1c, 0x0c],
  wood:       [0x5c, 0x34, 0x18],
  woodLight:  [0x6e, 0x3e, 0x1c],
  woodDark:   [0x46, 0x26, 0x10],
  parchment:  [0xe8, 0xd5, 0xb0],
  parchDark:  [0xd6, 0xbe, 0x94],
  gold:       [0xd4, 0xa8, 0x55],
  goldDark:   [0xa8, 0x7c, 0x36],
  highlight:  [0xf2, 0xd1, 0x9a],
  ember:      [0xc8, 0x7a, 0x4a],
  emberDeep:  [0x9a, 0x4e, 0x2a],
  green:      [0x8a, 0xb8, 0x7a],
  greenDeep:  [0x5a, 0x84, 0x4e],
  amber:      [0xd4, 0xa8, 0x55],
  blue:       [0x8a, 0xb8, 0xc8],
  white:      [0xf6, 0xee, 0xdc],
};

// ── Canvas helpers ─────────────────────────────────────────────────

function canvas(w, h) {
  const data = new Uint8Array(w * h * 4);
  const set = (x, y, c, a = 255) => {
    if (x < 0 || y < 0 || x >= w || y >= h || !c) return;
    const i = (y * w + x) * 4;
    data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = a;
  };
  const rect = (x, y, rw, rh, c, a = 255) => {
    for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) set(xx, yy, c, a);
  };
  const hline = (x, y, len, c, a = 255) => rect(x, y, len, 1, c, a);
  const vline = (x, y, len, c, a = 255) => rect(x, y, 1, len, c, a);
  // Signature chunky bevel frame: dark outline, lit top/left, shaded
  // bottom/right, fill inside.
  const frame = (x, y, fw, fh, { fill, lit = C.woodLight, shade = C.woodDark, outline = C.ink }) => {
    rect(x, y, fw, fh, outline);
    rect(x + 1, y + 1, fw - 2, fh - 2, fill);
    hline(x + 1, y + 1, fw - 2, lit);
    vline(x + 1, y + 1, fh - 2, lit);
    hline(x + 1, y + fh - 2, fw - 2, shade);
    vline(x + fw - 2, y + 1, fh - 2, shade);
  };
  const dither = (x, y, rw, rh, a0, b0) => {
    for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) {
      set(xx, yy, ((xx + yy) & 1) === 0 ? a0 : b0);
    }
  };
  return { w, h, data, set, rect, hline, vline, frame, dither };
}

async function save(c, file, colors = 16) {
  const path = join(OUT, file);
  await sharp(Buffer.from(c.data), { raw: { width: c.w, height: c.h, channels: 4 } })
    .png({ palette: true, colors, effort: 10, dither: 0 })
    .toFile(path);
  console.log('wrote', path, `${c.w}x${c.h}`);
}

// ── Buttons (80×22, drawn at 2× → 160×44 on screen) ────────────────

async function buttons() {
  const make = (fill, lit, shade, label) => {
    const c = canvas(80, 22);
    c.frame(0, 0, 80, 22, { fill, lit, shade });
    // Corner notches for a chamfered medieval plate
    for (const [x, y] of [[0, 0], [79, 0], [0, 21], [79, 21]]) c.set(x, y, null, 0);
    for (const [x, y] of [[1, 1], [78, 1], [1, 20], [78, 20]]) c.set(x, y, C.ink);
    // Rivet studs
    for (const [x, y] of [[4, 10], [75, 10]]) { c.set(x, y, shade); c.set(x, y - 1, lit); }
    return c;
  };
  await save(make(C.gold, C.highlight, C.goldDark), 'ui/btn_primary.png');
  await save(make(C.highlight, C.white, C.gold), 'ui/btn_primary_hover.png');
  await save(make(C.wood, C.woodLight, C.woodDark), 'ui/btn_secondary.png');
  await save(make(C.woodLight, [0x8a, 0x52, 0x28], C.wood), 'ui/btn_secondary_hover.png');
  const dis = make([0x3a, 0x30, 0x24], [0x46, 0x3c, 0x2e], [0x2c, 0x24, 0x1a]);
  await save(dis, 'ui/btn_disabled.png');
}

// ── Time-control buttons (12×12, drawn at 2× → 24×24) ──────────────

async function timeButtons() {
  const base = (active) => {
    const c = canvas(12, 12);
    c.frame(0, 0, 12, 12, active
      ? { fill: C.gold, lit: C.highlight, shade: C.goldDark }
      : { fill: C.wood, lit: C.woodLight, shade: C.woodDark });
    return c;
  };
  const glyph = (c, active) => active ? C.ink : C.parchment;

  const play = (active) => {
    const c = base(active);
    for (let i = 0; i < 4; i++) c.vline(4 + i, 3 + i, 6 - i * 2 < 1 ? 1 : 6 - i * 2, glyph(c, active));
    return c;
  };
  const pause = (active) => {
    const c = base(active);
    c.rect(4, 3, 2, 6, glyph(c, active));
    c.rect(7, 3, 2, 6, glyph(c, active));
    return c;
  };
  const fast = (active) => {
    const c = base(active);
    for (let i = 0; i < 3; i++) {
      c.vline(3 + i, 4 + i, 4 - i * 2 < 1 ? 1 : 4 - i * 2, glyph(c, active));
      c.vline(7 + i, 4 + i, 4 - i * 2 < 1 ? 1 : 4 - i * 2, glyph(c, active));
    }
    return c;
  };
  await save(play(false), 'ui/btn_play.png');
  await save(play(true), 'ui/btn_play_active.png');
  await save(pause(false), 'ui/btn_pause.png');
  await save(pause(true), 'ui/btn_pause_active.png');
  await save(fast(false), 'ui/btn_fast.png');
  await save(fast(true), 'ui/btn_fast_active.png');
}

// ── Tabs (60×18) ───────────────────────────────────────────────────

async function tabs() {
  const active = canvas(60, 18);
  active.frame(0, 0, 60, 18, { fill: C.parchment, lit: C.white, shade: C.parchDark });
  active.hline(1, 17, 58, C.parchment); // open bottom edge — joins the panel
  await save(active, 'ui/ui_tab_active.png');

  const inactive = canvas(60, 18);
  inactive.frame(0, 2, 60, 16, { fill: C.wood, lit: C.woodLight, shade: C.woodDark });
  await save(inactive, 'ui/ui_tab_inactive.png');
}

// ── Morale pips (30×8): five ember pips, lit count = morale level ──

async function morale() {
  for (let level = 1; level <= 5; level++) {
    const c = canvas(30, 8);
    for (let p = 0; p < 5; p++) {
      const x = p * 6 + 1;
      const lit = p < level;
      const body = lit ? (level <= 2 ? C.ember : level === 3 ? C.amber : C.green) : C.shadow;
      c.rect(x + 1, 2, 2, 4, body);
      c.set(x, 3, body); c.set(x, 4, body);
      c.set(x + 3, 3, body); c.set(x + 3, 4, body);
      c.set(x + 1, 1, lit ? C.highlight : C.shadow); c.set(x + 2, 1, lit ? C.highlight : C.shadow);
      c.set(x + 1, 6, C.ink); c.set(x + 2, 6, C.ink);
    }
    await save(c, `ui/ui_morale_${level}.png`);
  }
}

// ── Treasury indicators (14×21, drawn at 2× → 28×42): hung banner ──

async function indicators() {
  const states = {
    prosperous: [C.green, C.greenDeep],
    stable:     [C.parchment, C.parchDark],
    strained:   [C.amber, C.goldDark],
    critical:   [C.ember, C.emberDeep],
  };
  for (const [name, [main, deep]] of Object.entries(states)) {
    const c = canvas(14, 21);
    c.hline(1, 0, 12, C.woodDark);            // hanging rod
    c.hline(1, 1, 12, C.woodLight);
    c.rect(2, 2, 10, 14, main);               // banner cloth
    c.vline(2, 2, 14, deep);
    c.vline(11, 2, 14, deep);
    // Swallowtail bottom
    for (let i = 0; i < 4; i++) {
      c.vline(2 + i, 16, 4 - i, deep);
      c.vline(11 - i, 16, 4 - i, deep);
    }
    c.rect(6, 16, 2, 3, main);
    // Emblem: small diamond
    c.set(6, 7, deep); c.set(7, 7, deep);
    c.set(5, 8, deep); c.set(8, 8, deep);
    c.set(6, 9, deep); c.set(7, 9, deep);
    await save(c, `ui/indicator_${name}.png`);
  }
}

// ── Scholar card (100×130) ─────────────────────────────────────────

async function scholarCard() {
  const c = canvas(100, 130);
  c.frame(0, 0, 100, 130, { fill: C.parchment, lit: C.white, shade: C.parchDark, outline: C.ink });
  c.frame(2, 2, 96, 126, { fill: C.parchment, lit: C.parchDark, shade: C.parchDark, outline: C.wood });
  c.rect(3, 3, 94, 22, C.wood);               // header band
  c.hline(3, 3, 94, C.woodLight);
  c.hline(3, 24, 94, C.woodDark);
  c.frame(8, 30, 44, 44, { fill: C.shadow, lit: C.woodDark, shade: C.ink, outline: C.ink }); // portrait well
  for (let i = 0; i < 4; i++) c.hline(8, 84 + i * 11, 84, C.parchDark);  // text rule lines
  await save(c, 'ui/card_scholar.png');
}

// ── Trait chips (40×10) ────────────────────────────────────────────

async function traitChips() {
  const make = (fill, lit, shade) => {
    const c = canvas(40, 10);
    c.frame(0, 0, 40, 10, { fill, lit, shade });
    return c;
  };
  await save(make(C.parchment, C.white, C.parchDark), 'ui/ui_trait_chip_base.png');
  await save(make(C.gold, C.highlight, C.goldDark), 'ui/ui_trait_chip_gold.png');
  await save(make([0x4a, 0x3c, 0x2c], [0x5a, 0x4a, 0x38], [0x3a, 0x2e, 0x20]), 'ui/ui_trait_chip_muted.png');
}

// ── Map icons (8×8) ────────────────────────────────────────────────

async function mapIcons() {
  const icons = {
    city: (c) => {                                   // keep/tower
      c.rect(2, 3, 4, 5, C.parchment);
      c.set(1, 2, C.parchment); c.set(3, 2, C.parchment); c.set(5, 2, C.parchment);
      c.rect(3, 5, 2, 3, C.ink);
    },
    player: (c) => {                                 // ember flame
      c.set(4, 1, C.ember);
      c.rect(3, 2, 2, 2, C.ember);
      c.rect(2, 4, 4, 3, C.gold);
      c.rect(3, 5, 2, 2, C.highlight);
    },
    rival: (c) => {                                  // shield
      c.rect(2, 1, 5, 4, C.blue);
      c.rect(3, 5, 3, 1, C.blue);
      c.set(4, 6, C.blue);
      c.vline(4, 1, 5, C.ink);
    },
    trade: (c) => {                                  // coin
      c.rect(2, 2, 4, 4, C.gold);
      c.set(3, 1, C.gold); c.set(4, 1, C.gold);
      c.set(3, 6, C.goldDark); c.set(4, 6, C.goldDark);
      c.set(3, 3, C.highlight);
    },
    event: (c) => {                                  // exclamation
      c.rect(3, 1, 2, 4, C.ember);
      c.rect(3, 6, 2, 1, C.ember);
    },
  };
  for (const [name, draw] of Object.entries(icons)) {
    const c = canvas(8, 8);
    draw(c);
    await save(c, `icons/map_icon_${name}.png`);
  }
}

// ── Cursors (16×24): quill feather, hotspot at the nib (1,1) ───────

async function cursors() {
  const make = (feather, rib) => {
    const c = canvas(16, 24);
    // Nib at top-left, feather sweeping to bottom-right.
    c.set(1, 1, C.ink); c.set(2, 2, C.ink);
    for (let i = 0; i < 9; i++) {
      const x = 3 + i, y = 3 + i;
      c.set(x, y, rib);                      // central rib
      c.set(x + 1, y, feather); c.set(x + 2, y, feather);
      if (i > 1) { c.set(x + 3, y, feather); }
      if (i > 3) { c.set(x - 1, y + 1, feather); }
    }
    c.rect(11, 13, 3, 6, feather);
    c.set(12, 19, feather);
    return c;
  };
  await save(make(C.parchment, C.parchDark), 'cursors/cursor_default.png');
  await save(make(C.highlight, C.gold), 'cursors/cursor_hover.png');
  await save(make(C.gold, C.goldDark), 'cursors/cursor_click.png');
}

// ── FX strips ──────────────────────────────────────────────────────

async function fx() {
  // Gold sparkle — 4 frames of 16×16, four-point star bloom and fade.
  const sparkle = canvas(64, 16);
  const arms = [3, 6, 5, 2];
  arms.forEach((len, f) => {
    const ox = f * 16 + 8, oy = 8;
    const col = f === 3 ? C.goldDark : C.gold;
    for (let i = 0; i < len; i++) {
      sparkle.set(ox, oy - i, col); sparkle.set(ox, oy + i, col);
      sparkle.set(ox - i, oy, col); sparkle.set(ox + i, oy, col);
    }
    if (f === 1 || f === 2) {
      sparkle.set(ox - 1, oy - 1, C.highlight); sparkle.set(ox + 1, oy - 1, C.highlight);
      sparkle.set(ox - 1, oy + 1, C.highlight); sparkle.set(ox + 1, oy + 1, C.highlight);
      sparkle.set(ox, oy, C.white);
    }
  });
  await save(sparkle, 'fx/fx_gold_sparkle.png');

  // Ink splatter — 5 frames of 32×32, expanding blot.
  const ink = canvas(160, 32);
  const radii = [2, 4, 7, 9, 10];
  radii.forEach((r, f) => {
    const ox = f * 32 + 16, oy = 16;
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const d = x * x + y * y;
      if (d <= r * r && ((x * 7 + y * 13 + f) % 5 !== 0 || d < r * r * 0.5)) {
        ink.set(ox + x, oy + y, f === 4 ? C.shadow : C.ink, f === 4 ? 160 : 255);
      }
    }
    // Droplets
    ink.set(ox + r + 2, oy - 2, C.ink); ink.set(ox - r - 1, oy + 3, C.ink);
  });
  await save(ink, 'fx/fx_ink_splatter.png');

  // Work progress — 4 frames of 8×8, rising quill-dust dots.
  const work = canvas(32, 8);
  for (let f = 0; f < 4; f++) {
    const ox = f * 8;
    work.set(ox + 2, 6 - f, C.gold);
    work.set(ox + 5, 7 - f, C.highlight);
    if (f > 1) work.set(ox + 4, 8 - f, C.parchment);
  }
  await save(work, 'fx/fx_work_progress.png');

  // Candle flame — 4 frames of 12×12 flicker (replaces the bad crop).
  const flame = canvas(48, 12);
  const lean = [0, 1, 0, -1];
  lean.forEach((dx, f) => {
    const ox = f * 12 + 6, base = 10;
    flame.rect(ox - 2 + dx, 5, 4, 5, C.ember);
    flame.rect(ox - 1 + dx, 3, 2, 7, C.gold);
    flame.set(ox + dx, 2, C.gold);
    flame.rect(ox - 1 + dx, 6, 2, 3, C.highlight);
    flame.set(ox + dx, 9, C.white);
    flame.set(ox, base, C.ink); flame.set(ox - 1, base, C.ink);
  });
  await save(flame, 'fx/fx_candle_flame.png');
}

// ── Bars, slider, notification ─────────────────────────────────────

async function bars() {
  const track = canvas(120, 9);
  track.frame(0, 0, 120, 9, { fill: C.shadow, lit: C.woodDark, shade: C.ink });
  await save(track, 'ui/ui_progress_bar_track.png');

  const fill = canvas(115, 5);
  fill.rect(0, 0, 115, 5, C.gold);
  fill.hline(0, 0, 115, C.highlight);
  fill.hline(0, 4, 115, C.goldDark);
  await save(fill, 'ui/ui_progress_bar_fill.png');

  const skillTrack = canvas(60, 5);
  skillTrack.frame(0, 0, 60, 5, { fill: C.shadow, lit: C.woodDark, shade: C.ink });
  await save(skillTrack, 'ui/ui_skill_bar_track.png');

  for (const [name, col, top] of [
    ['low', C.ember, C.emberDeep], ['mid', C.amber, C.goldDark], ['high', C.green, C.greenDeep],
  ]) {
    const f = canvas(55, 2);
    f.hline(0, 0, 55, col);
    f.hline(0, 1, 55, top);
    await save(f, `ui/ui_skill_bar_fill_${name}.png`);
  }

  const sliderTrack = canvas(100, 6);
  sliderTrack.frame(0, 1, 100, 4, { fill: C.shadow, lit: C.woodDark, shade: C.ink });
  await save(sliderTrack, 'ui/slider_track.png');

  const thumb = canvas(8, 10);                 // wax-seal knob
  thumb.frame(1, 0, 6, 10, { fill: C.ember, lit: [0xe0, 0x96, 0x66], shade: C.emberDeep });
  thumb.set(3, 4, C.emberDeep); thumb.set(4, 4, C.emberDeep);
  await save(thumb, 'ui/slider_thumb.png');

  const notif = canvas(275, 30);
  notif.frame(0, 0, 275, 30, { fill: C.ink, lit: C.shadow, shade: [0x0a, 0x06, 0x04] });
  notif.vline(2, 2, 26, C.gold);
  notif.vline(3, 2, 26, C.goldDark);
  await save(notif, 'ui/ui_notification.png');
}

// ── Ember mark (24×32) — menu title emblem ─────────────────────────

async function emberMark() {
  const c = canvas(24, 32);
  // Outer flame
  c.rect(9, 6, 6, 18, C.ember);
  c.rect(7, 10, 10, 12, C.ember);
  c.set(11, 4, C.ember); c.set(12, 4, C.ember);
  c.set(10, 5, C.ember); c.set(13, 5, C.ember);
  c.set(6, 14, C.ember); c.set(17, 14, C.ember);
  c.vline(6, 14, 6, C.ember); c.vline(17, 14, 6, C.ember);
  // Inner glow
  c.rect(10, 10, 4, 12, C.gold);
  c.rect(11, 14, 2, 7, C.highlight);
  c.set(11, 20, C.white); c.set(12, 20, C.white);
  // Base coals
  c.rect(7, 24, 10, 3, C.woodDark);
  c.hline(8, 24, 8, C.emberDeep);
  c.set(9, 23, C.gold); c.set(14, 23, C.gold);
  await save(c, 'ui/ui_ember_mark.png');
}

// ── Main ───────────────────────────────────────────────────────────

mkdirSync(join(OUT, 'ui'), { recursive: true });
mkdirSync(join(OUT, 'icons'), { recursive: true });
mkdirSync(join(OUT, 'cursors'), { recursive: true });
mkdirSync(join(OUT, 'fx'), { recursive: true });

await buttons();
await timeButtons();
await tabs();
await morale();
await indicators();
await scholarCard();
await traitChips();
await mapIcons();
await cursors();
await fx();
await bars();
await emberMark();

console.log('done.');
