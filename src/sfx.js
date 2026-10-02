// Tiny WebAudio synth: no audio files to ship.
let ctx, master, muted = false, lastGulp = 0;

export function unlock() {
  if (ctx) return;
  ctx = new AudioContext();
  master = ctx.createGain();
  master.gain.value = 0.35;
  master.connect(ctx.destination);
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.35;
  return muted;
}

function tone(type, f0, f1, dur, vol = 0.5, delay = 0) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** Bigger things gulp lower. */
export function gulp(tier) {
  if (!ctx || ctx.currentTime - lastGulp < 0.05) return;
  lastGulp = ctx.currentTime;
  const f = 900 / (1 + tier * 1.5) + 60;
  tone('sine', f, f * 0.45, 0.12 + Math.min(tier, 8) * 0.03, 0.4);
}

export function hurt() {
  tone('square', 160, 50, 0.3, 0.3);
  tone('sine', 90, 40, 0.4, 0.6);
}

export function star() {
  [523, 659, 784].forEach((f, i) => tone('triangle', f, f, 0.18, 0.25, i * 0.09));
  tone('square', 700, 900, 0.25, 0.08, 0.3);
  tone('square', 900, 700, 0.25, 0.08, 0.55);
}

export function seal() {
  tone('sawtooth', 300, 40, 1.2, 0.25);
}

let lastSiren = 0;
/** Two-tone police siren, louder when closer; throttled so several cars don't stack. */
export function siren(dist) {
  if (!ctx || muted || ctx.currentTime - lastSiren < 1.6) return;
  lastSiren = ctx.currentTime;
  const v = Math.max(0.03, 0.14 - dist * 0.0025);
  tone('square', 740, 740, 0.38, v);
  tone('square', 560, 560, 0.38, v, 0.4);
  tone('square', 740, 740, 0.38, v, 0.8);
}

export function thump() {
  tone('sine', 120, 45, 0.25, 0.6);
  tone('square', 300, 90, 0.12, 0.15);
}

let lastHonk = 0;
/** Toy car horn (two detuned squares), throttled, quieter with distance. */
export function honk(dist = 5) {
  if (!ctx || muted || ctx.currentTime - lastHonk < 0.7) return;
  lastHonk = ctx.currentTime;
  const v = Math.max(0.03, 0.12 - dist * 0.004), f = 380 + Math.random() * 90;
  tone('square', f, f * 0.98, 0.16, v);
  tone('square', f * 1.26, f * 1.24, 0.16, v * 0.8);
  if (Math.random() < 0.5) { tone('square', f, f, 0.12, v, 0.22); tone('square', f * 1.26, f * 1.26, 0.12, v * 0.8, 0.22); }
}

let lastEek = 0;
/** Tiny panicked yelp. */
export function eek() {
  if (!ctx || muted || ctx.currentTime - lastEek < 0.25) return;
  lastEek = ctx.currentTime;
  const f = 900 + Math.random() * 500;
  tone('triangle', f, f * 1.5, 0.12, 0.06);
}

/** Big swallow: a deep thump under a rising whoosh. */
export function bigGulp(tier) {
  const base = 70 + 200 / (1 + tier);
  tone('sine', base, base * 0.5, 0.45, 0.7);
  tone('sawtooth', base * 1.5, base * 5, 0.35, 0.08, 0.05);
  tone('triangle', base * 2, base * 6, 0.4, 0.12, 0.08);
}

/** Size-up fanfare. */
export function levelUp() {
  [392, 523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, f, 0.2, 0.22, i * 0.07));
  tone('sine', 1046, 1568, 0.5, 0.12, 0.35);
}

/** Bass boom for blasts and big events (k: 0..1 size). */
export function boom(k = 1) {
  tone('sine', 70 + 30 * (1 - k), 28, 0.9 + k * 0.6, 0.5 + k * 0.4);
  tone('sawtooth', 180, 40, 0.5, 0.1 * k);
}

/** Pops and crackles of a fireworks volley. */
export function crackle(n = 10) {
  for (let i = 0; i < n; i++) {
    const d = 1.1 + i * 0.13 + Math.random() * 0.2, f = 200 + Math.random() * 300;
    tone('square', f, f * 0.3, 0.08, 0.06, d);
    tone('sine', 90, 40, 0.3, 0.12, d);
  }
}

/** A short rising whoosh (abilities, power-ups). */
export function whoosh() {
  tone('sawtooth', 200, 900, 0.25, 0.06);
  tone('sine', 300, 1200, 0.3, 0.1);
}

/** A little parade drum roll. */
export function drums() {
  for (let i = 0; i < 8; i++) tone('triangle', 180, 120, 0.06, 0.12, i * 0.09);
}

let lastRaid = 0;
/** Phase 2: an air-raid siren winding up and down over the countryside (throttled). */
export function airRaid() {
  if (!ctx || muted || ctx.currentTime - lastRaid < 6) return;
  lastRaid = ctx.currentTime;
  tone('sawtooth', 180, 620, 1.6, 0.05);
  tone('sawtooth', 620, 240, 1.8, 0.05, 1.6);
  tone('sine', 182, 624, 1.6, 0.06);
  tone('sine', 624, 242, 1.8, 0.06, 1.6);
}

/** A village church peal: a falling ring of bells (the village has seen the hole). */
export function bells() {
  if (!ctx || muted) return;
  [784, 698, 659, 587, 523, 494, 440, 392].forEach((f, i) => {
    tone('sine', f, f, 1.4, 0.07, i * 0.28);
    tone('triangle', f * 2.01, f * 2.01, 0.6, 0.02, i * 0.28);
  });
}

// ---------- Phase 3 (docs/PHASE3.md §12.5): land being torn off ----------
let noiseBuf = null;
/** A burst of filtered noise (rock breaking, surf, a roar). */
function noise(dur, lp, vol, delay = 0, hp = 0) {
  if (!ctx || muted) return;
  if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const t = ctx.currentTime + delay, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noiseBuf; src.loop = true; f.type = hp ? 'highpass' : 'lowpass'; f.frequency.value = hp || lp;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.05, dur * 0.2)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master); src.start(t); src.stop(t + dur + 0.02);
}
let lastTear = 0;
/** A district / island: a crack of rock and a gulp (k 0..1 size). */
export function tear(k = 0.3, semi = 0) { // (semi: a semitone per combo level)
  if (!ctx || ctx.currentTime - lastTear < 0.12) return;
  lastTear = ctx.currentTime;
  noise(0.25 + k * 0.3, 2400, 0.35 + k * 0.2); const pk = 2 ** (Math.min(semi, 12) / 12); tone('sine', (140 - k * 60) * pk, 38, 0.5 + k * 0.4, 0.5 + k * 0.2); tone('triangle', 520 * pk, 90, 0.12, 0.1);
}
/** A province: a rumble that arrives late, as it would from far away. */
export function rumble(k = 0.5, delay = 0.3) {
  noise(1.4 + k * 1.2, 300, 0.4 + k * 0.3, delay); tone('sine', 52, 26, 1.8 + k * 1.2, 0.55, delay); tone('sawtooth', 62, 30, 1.2, 0.08, delay);
}
/** A nation: a choir hit (a stacked chord) over a sub drop. */
export function choir(k = 0.7) {
  [196, 294, 392, 494, 588].forEach((f, i) => { tone('sine', f, f * 0.99, 2.2, 0.1, 0.02 * i); tone('triangle', f * 2.005, f * 2, 1.6, 0.03, 0.02 * i); });
  tone('sine', 110, 24, 2.6, 0.6 * k + 0.2);
}
/** A continent: the world holds its breath, an organ swell, then the boom. */
export function swell() {
  [65, 98, 131, 196, 262].forEach((f) => { tone('sawtooth', f, f * 1.02, 1.6, 0.07, 0.15); tone('sine', f * 2, f * 2, 1.6, 0.05, 0.15); });
  boom(1); noise(2.5, 500, 0.4, 1.6);
}
/** A coastline torn away: surf roar. */
export function surf() { noise(1.6, 1200, 0.22, 0.05, 250); }

// ---------- Phase 3 threats (docs/PHASE3.md §5.3): all WebAudio synthesis; `delay` carries the sound's travel time ----------
/** Filtered noise whose envelope RISES (a boom played backwards) and then cuts. */
function noiseUp(dur, lp, vol, delay = 0) {
  if (!ctx || muted) return;
  if (!noiseBuf) noise(0.01, 100, 0.0001); // (builds the shared buffer)
  const t = ctx.currentTime + delay, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noiseBuf; src.loop = true; f.type = 'lowpass';
  f.frequency.setValueAtTime(lp * 0.15, t); f.frequency.exponentialRampToValueAtTime(lp, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.96); g.gain.linearRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master); src.start(t); src.stop(t + dur + 0.02);
}
/** An ICBM leaves its silo: a rising roar and a low shudder (k 0..1 loudness: the silo's distance). */
export function nukeLaunch(k = 1) { noise(2.4, 700 + 900 * k, 0.28 * k + 0.06); tone('sawtooth', 70, 160, 2.2, 0.07 * k); tone('sine', 48, 36, 2.0, 0.3 * k); }
/** The target ring locks: three hard beeps. */
export function lockBeep() { for (let i = 0; i < 3; i++) tone('square', 880, 880, 0.09, 0.1, i * 0.16); }
/** DEFCON changed: a klaxon, faster and higher the closer to 1 (level 5..1). */
export function klaxon(level = 3) {
  const n = 6 - level, f = 380 + (5 - level) * 55;
  for (let i = 0; i < n; i++) { tone('sawtooth', f, f * 0.7, 0.26, 0.09, i * 0.34); tone('square', f * 1.5, f * 1.1, 0.26, 0.03, i * 0.34); }
}
/** A detonation: the flash is silent, the boom arrives `delay` s later (k 0..1 size). */
export function nukeBoom(k = 1, delay = 0) {
  noise(0.35, 5000, 0.5, delay); noise(2.6 + k, 600, 0.5, delay + 0.05);
  tone('sine', 62, 22, 2.8 + k, 0.8, delay); tone('sawtooth', 90, 30, 1.2, 0.12, delay + 0.05);
}
/** The best moment: the boom played backwards into a gulp, over a choir (the nuke fell into the void). */
export function reverseGulp() {
  noiseUp(0.7, 4200, 0.5); tone('sine', 30, 220, 0.62, 0.55); tone('sawtooth', 50, 400, 0.62, 0.07);
  tone('sine', 150, 28, 0.9, 0.9, 0.64); noise(0.5, 900, 0.45, 0.64);
  [196, 294, 392, 494, 588, 784].forEach((f, i) => { tone('sine', f, f, 2.6, 0.1, 0.62 + 0.03 * i); tone('triangle', f * 2.005, f * 2, 1.8, 0.03, 0.62 + 0.03 * i); });
}
/** A kinetic rod: a thin whine falling in, a crack and a deep thud. */
export function rodStrike(k = 1, delay = 0) {
  tone('sine', 5200, 900, 0.5, 0.06, delay - 0.45 < 0 ? 0 : delay - 0.45); noise(0.2, 6000, 0.45, delay); tone('sine', 78, 24, 1.8, 0.8, delay); noise(1.6, 400, 0.35, delay + 0.05);
}
/** The strafe: jets rushing past, rattling blasts. */
export function strafe() { noise(2.2, 1800, 0.14); for (let i = 0; i < 9; i++) { noise(0.2, 900, 0.3, 0.2 + i * 0.16); tone('sine', 90, 36, 0.3, 0.3, 0.2 + i * 0.16); } }
/** A satellite swallowed: a high tink and a whoosh. */
export function tink() { tone('triangle', 2600, 3400, 0.18, 0.12); tone('sine', 2000, 300, 0.35, 0.1, 0.05); noise(0.35, 4000, 0.15, 0.05); }
/** The Void Lid is coming: a long low drone. */
export function lidWarn() { tone('sawtooth', 70, 62, 1.8, 0.14); tone('square', 140, 120, 1.8, 0.04); }

// ---------- the Ascension (docs/PHASE3.md §7): the world goes quiet, the island breaks, the hole rips outward, then silence at altitude and a chord ----------
/** The whole mix drops to `k` (0..1 of normal) over `secs`: the silence before the island breaks. */
export function duck(k = 0.12, secs = 0.25) {
  if (!ctx || !master || muted) return;
  master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(0.35 * k, ctx.currentTime, secs / 3);
}
export function unduck(secs = 1.5) { duck(1, secs); }
/** A low drone (two sines a beat apart) that holds for `dur`: the breath held. */
export function drone(dur = 2.8, vol = 0.5) { tone('sine', 41, 41.6, dur, vol); tone('sine', 62, 61.4, dur, vol * 0.6); }
/** The surge: a rising roar and a tone that climbs a fifth and a half over `dur`. */
export function surge(dur = 2.2) { noiseUp(dur, 2600, 0.5); tone('sawtooth', 55, 330, dur, 0.1); tone('sine', 110, 880, dur, 0.18); }
/** The wind of the pull-out: noise that opens as the camera climbs and thins to nothing (the air runs out at ~100 km). */
export function windRush(dur = 3.4) { noise(dur, 1800, 0.3, 0, 300); noiseUp(dur * 0.55, 900, 0.12); }
/** The reveal: one long chord (a stacked fifth stack with a high shimmer) over the silence. */
export function chord() {
  [98, 147, 196, 294, 392, 587].forEach((f, i) => { tone('sine', f, f * 1.003, 4.6, 0.11 - i * 0.008, i * 0.07); tone('triangle', f * 2.002, f * 2, 3.8, 0.025, 0.2 + i * 0.07); });
  tone('sine', 49, 48.5, 5, 0.35);
}

// ---------- Phase 3 swath (docs/PHASE3-REVIEW.md A4): the grind of the land being eaten, one persistent node graph ----------
let gr = null;
/** grind.set(level 0..1, tier): a looped noise through a lowpass plus a sub sine; swells with the credit rate, drops a step per tier; stop() fades it out. All nodes are built once. */
export const grind = {
  set(level, tier = 1) {
    if (!ctx || muted) { if (gr) gr.g.gain.value = 0; return; }
    if (!gr) {
      if (!noiseBuf) noise(0.01, 100, 0.0001);
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), sub = ctx.createOscillator(), sg = ctx.createGain();
      src.buffer = noiseBuf; src.loop = true; f.type = 'lowpass'; sub.type = 'sine'; g.gain.value = 0; sg.gain.value = 0.5;
      src.connect(f).connect(g); sub.connect(sg).connect(g); g.connect(master); src.start(); sub.start();
      gr = { g, f, sub };
    }
    const t = ctx.currentTime, l = Math.max(0, Math.min(1, level)), step = Math.pow(0.82, tier - 1);
    gr.g.gain.setTargetAtTime(l * l * 0.55, t, 0.12); // (squared: a light touch is a whisper, a full bite a rumble)
    gr.f.frequency.setTargetAtTime((180 + 420 * l) * step, t, 0.12);
    gr.sub.frequency.setTargetAtTime(55 * step, t, 0.3);
  },
  stop() { if (gr && ctx) gr.g.gain.setTargetAtTime(0, ctx.currentTime, 0.1); },
};
let lastPebble = 0;
/** A parcel crumbles: a tiny dry crackle (throttled to 4 Hz). */
export function pebble() { if (!ctx || ctx.currentTime - lastPebble < 0.25) return; lastPebble = ctx.currentTime; noise(0.12, 3200, 0.12); tone('triangle', 260, 90, 0.08, 0.05); }

// ---------- Phase 3 WP-B (docs/PHASE3-REVIEW.md): rivals, laser, MIRV, fleet, tsunami, volcano, Aegis, cracker, rockets ----------
/** A rival rises: a long, detuned growl under the world. */
export function rivalGrowl() { tone('sawtooth', 58, 36, 1.8, 0.2); tone('sawtooth', 61, 38, 1.8, 0.16); tone('sine', 40, 27, 2.2, 0.5); noise(1.6, 420, 0.3, 0.1); }
/** A rival bites the hole: a crunch and a sub thud. */
export function rivalBite() { noise(0.4, 2200, 0.55); tone('sine', 110, 26, 0.9, 0.9); tone('sawtooth', 160, 40, 0.5, 0.15); }
/** A rival swallowed: the reversed boom into a gulp, then the choir. */
export function rivalEaten() { reverseGulp(); choir(1); tone('sine', 36, 22, 3.4, 0.6, 0.7); }
/** A salvo of cruise missiles leaves the deck: a hiss and a whoosh. */
export function cruise() { noise(1.1, 3200, 0.22); tone('sawtooth', 240, 900, 0.7, 0.07); tone('sine', 120, 60, 0.6, 0.2); }
/** A ship swallowed: a splash and a low gulp. */
export function gulpShip() { noise(0.5, 1800, 0.3, 0.05, 300); tone('sine', 180, 50, 0.5, 0.5); }
/** A tsunami: a long rising roar that breaks into surf. */
export function tsunami() { noiseUp(2.2, 900, 0.5); tone('sine', 44, 30, 2.6, 0.5); noise(3, 700, 0.35, 2.0, 200); }
/** A volcano: a rumble, then (erupt) the blast, a deep sub drop and a crackle. */
export function volcano(erupt = false) { if (erupt) { noise(2.6, 500, 0.6); tone('sine', 46, 24, 3, 0.9); tone('sawtooth', 70, 30, 1.8, 0.14); noise(0.5, 3000, 0.45, 0.05); } else rumble(0.9, 0); }
/** The Aegis descends: two low drones a beat apart under a rising whine and slow metal clangs. */
export function aegisDescend() { tone('sine', 62, 61.2, 7, 0.45); tone('sine', 93, 92, 7, 0.25); tone('sawtooth', 120, 520, 6.5, 0.05); for (let i = 0; i < 5; i++) tone('square', 300 - i * 20, 90, 0.4, 0.06, 1 + i * 1.3); }
/** An Aegis platform swallowed: a metal clang and a tail of sparks. */
export function aegisEat() { tone('square', 520, 150, 0.5, 0.2); tone('triangle', 1040, 260, 0.7, 0.14); noise(0.5, 5000, 0.3, 0, 1500); tone('sine', 90, 30, 0.9, 0.6); }
/** The Aegis broken: a shatter, a boom, a choir. */
export function aegisBreak() { noise(1.2, 6000, 0.5, 0, 800); boom(1); choir(1); reverseGulp(); tone('sine', 40, 22, 3.6, 0.8, 0.5); }
/** The cracker charges: a stacked riser that climbs for `dur` s. */
export function crackerCharge(dur = 30) { tone('sawtooth', 40, 220, dur, 0.1); tone('sawtooth', 60, 330, dur, 0.07); tone('sine', 30, 140, dur, 0.4); noiseUp(dur, 3000, 0.25); }
/** The cracker fires: a white-out, then the largest boom there is. */
export function crackerFire() { noise(0.4, 9000, 0.7); tone('sine', 58, 18, 5, 1.0, 0.1); noise(4, 500, 0.6, 0.15); tone('sawtooth', 80, 22, 3, 0.2, 0.15); boom(1); }
/** The cracker starved of power: it winds down, then the void swallows the sound. */
export function fizzle() { tone('sawtooth', 600, 40, 2.4, 0.2); tone('sine', 900, 60, 2.2, 0.15); reverseGulp(); choir(0.8); }
