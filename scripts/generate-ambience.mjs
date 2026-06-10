// Synthesizes the campus ambience loop — high mountain wind with a faint
// warm hum — and encodes it to mp3 (requires ffmpeg on PATH).
//
// Usage: node scripts/generate-ambience.mjs
// Writes: public/assets/audio/music/campus_ambient.mp3
//
// Design notes: 60s seamless loop. All LFOs use an integer number of
// cycles per loop; the noise bed is made seamless by crossfading the final
// 2 seconds into the first 2. Levels are deliberately low — this is
// atmosphere, not music, and it sits under the game's SFX.

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, unlinkSync } from 'node:fs';

const SR = 44100;
const LOOP_S = 60;
const XFADE_S = 2;
const N = SR * (LOOP_S + XFADE_S);

const TWO_PI = Math.PI * 2;
const channels = [[], []];

for (let ch = 0; ch < 2; ch++) {
  const out = new Float64Array(N);
  let brown = 0;          // integrated white noise
  let lp = 0;             // one-pole lowpass state (wind bed)
  let bp = 0;             // second pole for the gust band
  const phase = ch * 1.7; // de-correlate the stereo sides

  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const white = Math.random() * 2 - 1;
    brown = (brown + white * 0.02) * 0.997;

    // Wind bed: heavily lowpassed brown noise, 3 slow swells per loop.
    lp += 0.045 * (brown - lp);
    const swell = 0.55 + 0.45 * Math.sin(TWO_PI * (3 * t / LOOP_S) + phase);
    const bed = lp * 2.6 * swell;

    // Gusts: a brighter band, gated by a sharper episodic envelope
    // (2 cycles per loop, raised to a power so it spends most time quiet).
    bp += 0.30 * (brown * 3 - bp);
    const gustEnv = Math.pow(0.5 + 0.5 * Math.sin(TWO_PI * (2 * t / LOOP_S) + phase + 2.1), 4);
    const gust = (bp - lp) * 1.4 * gustEnv;

    // Hum: faint low warmth, 5 tremolo cycles per loop. Barely audible.
    const trem = 0.7 + 0.3 * Math.sin(TWO_PI * (5 * t / LOOP_S));
    const hum = (Math.sin(TWO_PI * 110 * t) * 0.6 + Math.sin(TWO_PI * 165 * t) * 0.4) * 0.012 * trem;

    out[i] = (bed + gust + hum) * 0.16;
  }
  channels[ch] = out;
}

// Make the loop seamless: blend the tail into the head, then truncate.
const loopN = SR * LOOP_S;
const xfadeN = SR * XFADE_S;
for (const out of channels) {
  for (let i = 0; i < xfadeN; i++) {
    const w = i / xfadeN;
    out[i] = out[i] * w + out[loopN + i] * (1 - w);
  }
}

// Interleave to 16-bit PCM WAV.
const pcm = Buffer.alloc(loopN * 2 * 2);
for (let i = 0; i < loopN; i++) {
  for (let ch = 0; ch < 2; ch++) {
    const v = Math.max(-1, Math.min(1, channels[ch][i]));
    pcm.writeInt16LE(Math.round(v * 32767), (i * 2 + ch) * 2);
  }
}
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);             // PCM
header.writeUInt16LE(2, 22);             // stereo
header.writeUInt32LE(SR, 24);
header.writeUInt32LE(SR * 4, 28);        // byte rate
header.writeUInt16LE(4, 32);             // block align
header.writeUInt16LE(16, 34);            // bits
header.write('data', 36);
header.writeUInt32LE(pcm.length, 40);

mkdirSync('public/assets/audio/music', { recursive: true });
const tmpWav = '/tmp/campus_ambient.wav';
writeFileSync(tmpWav, Buffer.concat([header, pcm]));
execFileSync('ffmpeg', [
  '-y', '-i', tmpWav,
  '-codec:a', 'libmp3lame', '-b:a', '96k',
  'public/assets/audio/music/campus_ambient.mp3',
], { stdio: 'pipe' });
unlinkSync(tmpWav);
console.log('wrote public/assets/audio/music/campus_ambient.mp3');
