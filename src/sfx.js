// Tiny WebAudio synth: no audio files to ship.
// The graph (built once): every voice -> `master` (the world's duck) -> `tierLP` (a lowpass that closes as the scale grows: a bigger world is farther away) -> `bus`;
// the finale and the tinnitus ring skip the duck and the lowpass and join at `bus`. `bus` is the mute (a gain), then a compressor (a limiter in effect) and a soft clipper, so the
// heaviest moment (a nuke, a hit, the grind together) can never clip: the output is bounded to +-1 by construction. A tab that is hidden suspends the context.
let dest = null; // (a StereoPanner while `panned` runs: the voices it schedules join the mix there)
let ctx, master, tierLP, bus, comp, trim, shaper, muted = false, lastGulp = 0, duckK = 1, live = 0;
const MASTER = 0.35, TIER_HZ = [11000, 8000, 5000, 3000]; // (the lowpass per scale tier T1..T4)
const softClip = (() => { const n = 2049, c = new Float32Array(n), k = 1.4, d = Math.tanh(k); for (let i = 0; i < n; i++) c[i] = Math.tanh(k * ((i / (n - 1)) * 2 - 1)) / d; return c; })();

/** Build the output graph on a context (the real one, or the offline one the level probe renders with). */
function buildGraph(c, { limit = true } = {}) {
  bus = c.createGain(); bus.gain.value = muted ? 0 : 1;
  comp = c.createDynamicsCompressor(); comp.threshold.value = -6; comp.knee.value = 6; comp.ratio.value = 10; comp.attack.value = 0.003; comp.release.value = 0.22;
  shaper = c.createWaveShaper(); shaper.curve = softClip; shaper.oversample = '2x';
  trim = c.createGain(); trim.gain.value = 0.6; // (Chrome's compressor adds its own makeup gain: the trim brings the loudness back to the un-limited mix)
  if (limit) bus.connect(comp).connect(trim).connect(shaper).connect(c.destination); else bus.connect(c.destination);
  tierLP = c.createBiquadFilter(); tierLP.type = 'lowpass'; tierLP.frequency.value = TIER_HZ[0]; tierLP.Q.value = 0.5; tierLP.connect(bus);
  master = c.createGain(); master.gain.value = MASTER * duckK; master.connect(tierLP);
}

/** Run `fn` (which schedules voices) with everything it makes panned to `p` (-1 left .. 1 right). */
function panned(p, fn) {
  if (!ctx || !p) return fn();
  const sp = ctx.createStereoPanner(); sp.pan.value = Math.max(-1, Math.min(1, p)); sp.connect(master); dest = sp;
  try { fn(); } finally { dest = null; }
}

export function unlock() {
  if (ctx) return;
  ctx = new AudioContext();
  buildGraph(ctx);
  document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else ctx.resume(); }); // (no sound, and no CPU, from a hidden tab)
}

export function toggleMute() {
  muted = !muted;
  if (bus) bus.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.02); // (one stage mutes everything: the voices, the bed, the finale, the ring)
  return muted;
}

/** The scale tier (1..4): the world's lowpass closes a notch per tier, and the music bed changes chord. */
export function setTier(t) {
  if (!ctx || !tierLP) return;
  const k = Math.max(1, Math.min(4, t | 0));
  tierLP.frequency.setTargetAtTime(TIER_HZ[k - 1], ctx.currentTime, 0.7);
  bed.tier(k);
}

function tone(type, f0, f1, dur, vol = 0.5, delay = 0) {
  if (!ctx || muted || live > 80) return; // (a voice cap: a storm of events can never pile up nodes)
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest || master);
  o.start(t);
  o.stop(t + dur + 0.02);
  live++; o.onended = () => { live--; g.disconnect(); };
}

/** Bigger things gulp lower. */
export function gulp(tier) {
  if (!ctx || ctx.currentTime - lastGulp < 0.05) return;
  lastGulp = ctx.currentTime;
  const f = 900 / (1 + tier * 1.5) + 60;
  tone('sine', f, f * 0.45, 0.12 + Math.min(tier, 8) * 0.03, 0.4);
}

let lastCapture = 0;
/** A light onset tick for ordinary captures; one voice at most every 120 ms. */
export function captureOnset() {
  if (!ctx || ctx.currentTime - lastCapture < 0.12) return;
  lastCapture = ctx.currentTime;
  tone('triangle', 520, 340, 0.07, 0.045);
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
  if (!ctx || muted || live > 80) return;
  if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const t = ctx.currentTime + delay, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noiseBuf; src.loop = true; f.type = hp ? 'highpass' : 'lowpass'; f.frequency.value = hp || lp;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.05, dur * 0.2)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(dest || master); src.start(t); src.stop(t + dur + 0.02);
  live++; src.onended = () => { live--; g.disconnect(); };
}
let lastTear = 0;
/** A restrained rising cue while a large tear wave is being prepared. */
export function tearAnticipate() {
  tone('sine', 180, 260, 0.16, 0.07);
}
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
  if (!ctx || muted || live > 80) return;
  if (!noiseBuf) noise(0.01, 100, 0.0001); // (builds the shared buffer)
  const t = ctx.currentTime + delay, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noiseBuf; src.loop = true; f.type = 'lowpass';
  f.frequency.setValueAtTime(lp * 0.15, t); f.frequency.exponentialRampToValueAtTime(lp, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.96); g.gain.linearRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(dest || master); src.start(t); src.stop(t + dur + 0.02);
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
export function nukeBoom(k = 1, delay = 0, pan = 0) {
  panned(pan, () => {
    noise(0.35, 5000, 0.5, delay); noise(2.6 + k, 600, 0.5, delay + 0.05);
    tone('sine', 62, 22, 2.8 + k, 0.8, delay); tone('sawtooth', 90, 30, 1.2, 0.12, delay + 0.05);
  });
}
/** The best moment: the boom played backwards into a gulp, over a choir (the nuke fell into the void). */
export function reverseGulp() {
  noiseUp(0.7, 4200, 0.5); tone('sine', 30, 220, 0.62, 0.55); tone('sawtooth', 50, 400, 0.62, 0.07);
  tone('sine', 150, 28, 0.9, 0.9, 0.64); noise(0.5, 900, 0.45, 0.64);
  [196, 294, 392, 494, 588, 784].forEach((f, i) => { tone('sine', f, f, 2.6, 0.1, 0.62 + 0.03 * i); tone('triangle', f * 2.005, f * 2, 1.8, 0.03, 0.62 + 0.03 * i); });
}
/** A kinetic rod: a thin whine falling in, a crack and a deep thud. */
export function rodStrike(k = 1, delay = 0, pan = 0) {
  panned(pan, () => { tone('sine', 5200, 900, 0.5, 0.06, delay - 0.45 < 0 ? 0 : delay - 0.45); noise(0.2, 6000, 0.45, delay); tone('sine', 78, 24, 1.8, 0.8, delay); noise(1.6, 400, 0.35, delay + 0.05); });
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
  duckK = k; master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(MASTER * k, ctx.currentTime, secs / 3);
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
/** A rocket lifts off: a rising roar that thins out. */
export function rocket() { noise(2.4, 1400, 0.25); tone('sawtooth', 70, 200, 2.2, 0.06); }

// ---------- real pain (src/pain.js): the hole is hit ----------
let ringG = null;
/** The hole is hit (k 0..1, the share of it lost, scaled): a cracked slam, a pitch-dropped body and a sub thump; the world ducks and a tinnitus ring (its own gain, past the duck) fades back over seconds. */
export function pain(k = 0.5) {
  if (!ctx || muted) return;
  const t = ctx.currentTime, kk = Math.min(1, Math.max(0.15, k));
  noise(0.22 + 0.25 * kk, 3600, 0.5 + 0.3 * kk); tone('sawtooth', 210 - 60 * kk, 34, 0.45, 0.16 + 0.1 * kk);
  tone('sine', 130 - 50 * kk, 22, 0.8 + 0.8 * kk, 0.9); tone('sine', 54, 19, 1.4 + 1.2 * kk, 0.7 + 0.3 * kk, 0.03); noise(0.9 + kk, 420, 0.4, 0.06);
  if (kk > 0.25 && master) {
    master.gain.cancelScheduledValues(t); master.gain.setTargetAtTime(MASTER * duckK * (0.6 - 0.35 * kk), t, 0.012); master.gain.setTargetAtTime(MASTER * duckK, t + 0.3 + 0.5 * kk, 0.45 + 0.5 * kk);
    if (!ringG) { ringG = ctx.createGain(); ringG.gain.value = 0; ringG.connect(bus); for (const f of [5400, 7600]) { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(ringG); o.start(); } }
    ringG.gain.cancelScheduledValues(t); ringG.gain.setValueAtTime(0, t); ringG.gain.linearRampToValueAtTime(0.012 + 0.03 * kk, t + 0.05); ringG.gain.setTargetAtTime(0, t + 0.4, 0.7 + 1.1 * kk);
  }
}
/** One heartbeat of the wounded hole (k 0..1): two soft low thumps. */
export function heart(k = 0.5) { tone('sine', 66, 38, 0.16, 0.3 * k + 0.08); tone('sine', 54, 34, 0.18, 0.22 * k + 0.05, 0.2); }

// ---------- the finale (src/finale.js): one persistent graph, driven by finale.mix(t-derived targets); the chunks are one-shots over it ----------
let fa = null;
/** Build the finale's graph (once) and open its bus. It bypasses the master's duck (the world goes silent, the finale does not). */
export const finale = {
  start() {
    if (!ctx) return;
    if (!noiseBuf) noise(0.01, 100, 0.0001);
    if (fa) return;
    const out = ctx.createGain(); out.gain.value = 0.4; out.connect(bus); // (it bypasses the duck, so it is trimmed to sit with the rest: 0.4 ~ the master's 0.35)
    const lane = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; g.connect(out); return g; };
    const osc = (type, f, dest, det = 0) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det; o.connect(dest); o.start(); return o; };
    const nz = (dest) => { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.connect(dest); s.start(); return s; };
    fa = { out, noise: noiseBuf };
    // sub: two detuned sines and a saw an octave down through a lowpass: the world's weight
    fa.gSub = lane(); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160; lp.connect(fa.gSub);
    fa.sub = [osc('sine', 41, lp), osc('sine', 41.7, lp), osc('sawtooth', 20.5, lp)];
    // groan: noise through a slow, resonant lowpass (the crust straining)
    fa.gGroan = lane(); fa.fGroan = ctx.createBiquadFilter(); fa.fGroan.type = 'lowpass'; fa.fGroan.Q.value = 7; fa.fGroan.frequency.value = 160; nz(fa.fGroan); fa.fGroan.connect(fa.gGroan);
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.19; lg.gain.value = 70; lfo.connect(lg).connect(fa.fGroan.frequency); lfo.start();
    // the choir / organ: a stacked D minor, sines and triangles, a slow tremolo
    fa.gChoir = lane(); fa.choir = [];
    [73.4, 110, 146.8, 174.6, 220, 293.7, 440].forEach((f, i) => { const g = ctx.createGain(); g.gain.value = 0.16 / (1 + i * 0.35); g.connect(fa.gChoir); fa.choir.push(osc(i % 2 ? 'triangle' : 'sine', f, g, (i - 3) * 3), osc('sine', f * 2.003, g, i * 2)); });
    // grinding: band-passed noise, shuddering
    fa.gGrind = lane(); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 480; bp.Q.value = 0.9; nz(bp); const am = ctx.createGain(); am.gain.value = 0.5; bp.connect(am); am.connect(fa.gGrind);
    const l2 = ctx.createOscillator(), l2g = ctx.createGain(); l2.type = 'sawtooth'; l2.frequency.value = 11; l2g.gain.value = 0.5; l2.connect(l2g).connect(am.gain); l2.start(); fa.bp = bp;
    // the shimmer: high sines drifting up, only after the silence
    fa.gShim = lane(); fa.shim = [1760, 2637, 3520, 5274].map((f, i) => osc('sine', f, (() => { const g = ctx.createGain(); g.gain.value = 0.05 / (1 + i * 0.5); g.connect(fa.gShim); return g; })(), i * 7));
    // the resolved drone: a fifth over a sub, breathing
    fa.gDrone = lane(); const dl = ctx.createGain(); dl.gain.value = 0.5; dl.connect(fa.gDrone); fa.drone = [osc('sine', 55, dl), osc('sine', 82.5, dl, 2), osc('sine', 110.2, dl, -2)];
    const l3 = ctx.createOscillator(), l3g = ctx.createGain(); l3.frequency.value = 0.23; l3g.gain.value = 0.3; l3.connect(l3g).connect(dl.gain); l3.start();
  },
  /** targets 0..1 per layer (smoothed here): sub, groan, choir, grind, shim, drone; rise 0..1 lifts the sub's pitch and the grind's band. */
  mix(m, tau = 0.1) {
    if (!fa || !ctx) return;
    const t = ctx.currentTime, set = (g, v, k = 1) => g.gain.setTargetAtTime(v * k, t, tau);
    set(fa.gSub, m.sub * 0.62); set(fa.gGroan, m.groan * 0.55); set(fa.gChoir, m.choir * 0.5); set(fa.gGrind, m.grind * 0.34); set(fa.gShim, m.shim * 0.6); set(fa.gDrone, m.drone * 0.7);
    fa.sub[0].frequency.setTargetAtTime(41 + 24 * (m.rise || 0), t, 0.2); fa.sub[1].frequency.setTargetAtTime(41.7 + 24.6 * (m.rise || 0), t, 0.2); fa.sub[2].frequency.setTargetAtTime(20.5 + 12 * (m.rise || 0), t, 0.2);
    fa.fGroan.frequency.setTargetAtTime(150 + 160 * (m.groan || 0), t, 0.3); fa.bp.frequency.setTargetAtTime(380 + 900 * (m.rise || 0), t, 0.2);
    for (let i = 0; i < fa.shim.length; i++) fa.shim[i].frequency.setTargetAtTime([1760, 2637, 3520, 5274][i] * (1 + 0.35 * (m.up || 0)), t, 0.4);
  },
  /** A chunk swallowed (k 0..1 its share, n how many so far): a thump whose pitch climbs, a crunch of grit. */
  hit(k = 0.3, n = 0) {
    if (!fa || !ctx || muted) return;
    const f = 52 * (1 + 0.045 * n);
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f * 1.9, t); o.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.5); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35 + 0.5 * k, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g).connect(fa.out); o.start(t); o.stop(t + 1);
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g2 = ctx.createGain(); s.buffer = noiseBuf; s.loop = true; fl.type = 'lowpass'; fl.frequency.value = 500 + 700 * k;
    g2.gain.setValueAtTime(0.0001, t); g2.gain.exponentialRampToValueAtTime(0.25 + 0.3 * k, t + 0.02); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.5 + 0.5 * k); s.connect(fl).connect(g2).connect(fa.out); s.start(t); s.stop(t + 1.1);
  },
  /** The rupture: the crust goes in one sound: a crack, a sub slam, a long falling groan. */
  rupture() {
    if (!fa || !ctx || muted) return;
    const t = ctx.currentTime; noise(0.35, 7000, 0.7, 0); noise(2.8, 700, 0.6, 0.02); tone('sine', 70, 18, 3.2, 0.95); tone('sawtooth', 110, 30, 2.0, 0.16, 0.03);
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(240, t); o.frequency.exponentialRampToValueAtTime(34, t + 3.6); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.1, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400; o.connect(f).connect(g).connect(fa.out); o.start(t); o.stop(t + 3.7);
  },
  /** The last mouthful: a sub that falls through the floor, then (by the silence) nothing. */
  last() { if (!fa || !ctx || muted) return; tone('sine', 90, 14, 4.2, 1.0); noise(1.2, 400, 0.5, 0.02); },
  /** The resolve: a wide, slow chord (open fifths and an octave) that swells and holds. */
  resolve() {
    if (!fa || !ctx || muted) return;
    const t = ctx.currentTime;
    [73.4, 110, 146.8, 220, 293.7, 440, 587.3].forEach((f, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = i % 2 ? 'triangle' : 'sine'; o.frequency.value = f * 1.002; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.1 / (1 + i * 0.25), t + 3.2 + i * 0.12); g.gain.setTargetAtTime(0.0001, t + 6, 2.5); o.connect(g).connect(fa.out); o.start(t); o.stop(t + 14); });
  },
  stop() { if (fa && ctx) { const t = ctx.currentTime; for (const g of [fa.gSub, fa.gGroan, fa.gChoir, fa.gGrind, fa.gShim, fa.gDrone]) g.gain.setTargetAtTime(0, t, 0.4); } },
  /** Everything but the sub-bass out within a breath: the sudden silence at the transformation. */
  silence(tau = 0.04) { if (fa && ctx) { const t = ctx.currentTime; for (const g of [fa.gSub, fa.gGroan, fa.gChoir, fa.gGrind, fa.gShim, fa.gDrone]) g.gain.setTargetAtTime(0, t, tau); } },
};

// ---------- the music bed (docs/PHASE3-REVIEW.md D6): one persistent graph, a chord per scale tier; everything is a gain or a pitch target, so a tier-up is a glide, not a cut ----------
const CHORD = [[146.83, 174.61, 220], [116.54, 146.83, 174.61], [98, 116.54, 146.83], [73.42, 110, 146.83]]; // T1 Dm, T2 Bb, T3 Gm, T4 an open D (the drone)
const ROOT = [73.42, 58.27, 49, 36.71], AMB_HZ = [620, 480, 330, 200], AMB_G = [0.5, 0.55, 0.42, 0.12], PAD_HZ = [820, 640, 520, 380], PAD_G = [0.8, 0.8, 0.75, 0.55];
let bd = null;
/**
 * bed.tier(k): the chord glides (3 notes x 3 detuned saws through a lowpass), the sub drone and the choir follow; ambience (wind, thinning with the scale, nearly gone in space).
 * bed.defcon(d): a low pulse rises as DEFCON falls 5 -> 1. bed.surf(k 0..1): a wash when the cap overlaps a coast. bed.duck(k, s): the bed ducks under big events. bed.stop(): fade out.
 */
export const bed = {
  start() {
    if (!ctx || bd) return;
    if (!noiseBuf) noise(0.01, 100, 0.0001);
    const t = ctx.currentTime, out = ctx.createGain(); out.gain.value = 0; out.gain.setTargetAtTime(1, t, 2.5); out.connect(master);
    const osc = (type, f, dest, det = 0) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det; o.connect(dest); o.start(); return o; };
    const nz = (dest) => { const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true; n.connect(dest); n.start(); return n; };
    const k = 0; bd = { out, k };
    // the pad: three notes, each three detuned saws, lowpassed (a soft, slow-breathing bed)
    const pl = ctx.createBiquadFilter(); pl.type = 'lowpass'; pl.frequency.value = PAD_HZ[k]; pl.Q.value = 0.6; const pg = ctx.createGain(); pg.gain.value = 0.05 * PAD_G[k]; pl.connect(pg).connect(out);
    bd.padLP = pl; bd.padG = pg; bd.pad = CHORD[k].map((f) => [-9, 0, 9].map((c) => osc('sawtooth', f, pl, c)));
    const br = ctx.createOscillator(), brg = ctx.createGain(); br.frequency.value = 0.07; brg.gain.value = 140; br.connect(brg).connect(pl.frequency); br.start();
    // the sub drone (the root, an octave and a half down) and the choir (open sines over the chord, a slow tremolo)
    const sg = ctx.createGain(); sg.gain.value = 0.16; sg.connect(out); bd.sub = osc('sine', ROOT[k], sg);
    const cg = ctx.createGain(); cg.gain.value = 0.045; cg.connect(out); const tr = ctx.createGain(); tr.gain.value = 0.7; tr.connect(cg); bd.choir = [2, 3, 4].map((m, i) => osc('sine', CHORD[k][i] * m * 0.5, tr, i * 4));
    const lf = ctx.createOscillator(), lg = ctx.createGain(); lf.frequency.value = 0.13; lg.gain.value = 0.3; lf.connect(lg).connect(tr.gain); lf.start();
    // ambience: wind
    const ab = ctx.createBiquadFilter(); ab.type = 'bandpass'; ab.frequency.value = AMB_HZ[k]; ab.Q.value = 0.5; const ag = ctx.createGain(); ag.gain.value = 0.1 * AMB_G[k]; nz(ab); ab.connect(ag).connect(out); bd.ambF = ab; bd.ambG = ag;
    const wl = ctx.createOscillator(), wg = ctx.createGain(); wl.frequency.value = 0.09; wg.gain.value = 0.35 * AMB_HZ[k] * 0.5; wl.connect(wg).connect(ab.frequency); wl.start(); // (gusts)
    // the pulse (DEFCON): a low sine gated by a slow LFO
    const pu = ctx.createGain(); pu.gain.value = 0; const pd = ctx.createGain(); pd.gain.value = 0; const pl2 = ctx.createOscillator(); pl2.frequency.value = 1; pl2.connect(pd).connect(pu.gain); pl2.start();
    osc('sine', 55, pu); pu.connect(out); bd.pulseBase = pu; bd.pulseDepth = pd; bd.pulseLfo = pl2;
    // the surf wash: noise through a bandpass, swelling
    const sf = ctx.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = 900; sf.Q.value = 0.7; const sfg = ctx.createGain(); sfg.gain.value = 0; nz(sf); sf.connect(sfg).connect(out); bd.surfG = sfg;
    const sl = ctx.createOscillator(), slg = ctx.createGain(); sl.frequency.value = 0.15; slg.gain.value = 0.35; sl.connect(slg).connect(sfg.gain); sl.start();
  },
  tier(k) {
    if (!ctx) return;
    if (!bd) this.start();
    if (!bd || bd.k === k - 1) return;
    const t = ctx.currentTime, i = k - 1; bd.k = i;
    bd.pad.forEach((row, n) => row.forEach((o) => o.frequency.setTargetAtTime(CHORD[i][n], t, 1.6)));
    bd.sub.frequency.setTargetAtTime(ROOT[i], t, 1.6); bd.choir.forEach((o, n) => o.frequency.setTargetAtTime(CHORD[i][n] * [2, 3, 4][n] * 0.5, t, 1.6));
    bd.padLP.frequency.setTargetAtTime(PAD_HZ[i], t, 1.6); bd.padG.gain.setTargetAtTime(0.05 * PAD_G[i], t, 1.6);
    bd.ambF.frequency.setTargetAtTime(AMB_HZ[i], t, 1.6); bd.ambG.gain.setTargetAtTime(0.1 * AMB_G[i], t, 1.6);
  },
  defcon(d) {
    if (!bd || !ctx) return;
    const k = Math.max(0, Math.min(1, (5 - d) / 4)), t = ctx.currentTime;
    bd.pulseBase.gain.setTargetAtTime(0.045 * k, t, 0.6); bd.pulseDepth.gain.setTargetAtTime(0.045 * k, t, 0.6); bd.pulseLfo.frequency.setTargetAtTime(0.8 + 1.9 * k, t, 0.6);
  },
  surf(k) { if (bd && ctx) bd.surfG.gain.setTargetAtTime(0.06 * Math.max(0, Math.min(1, k)), ctx.currentTime, 0.5); },
  duck(k = 0.4, secs = 0.2) { if (bd && ctx) bd.out.gain.setTargetAtTime(k, ctx.currentTime, secs / 3); },
  stop() { if (bd && ctx) bd.out.gain.setTargetAtTime(0, ctx.currentTime, 0.5); },
  start0() { if (bd && ctx) bd.out.gain.setTargetAtTime(1, ctx.currentTime, 1.5); },
};

// ---------- the level probe (dev: window.__sfxProbe): the heaviest moments rendered offline, peak and RMS in dBFS ----------
/** Render `secs` of a scenario with an OfflineAudioContext and report { peakDb, rmsDb } of the output, with the limiter chain in and with it out. Restores the live graph afterwards. */
export async function levelProbe(scenario = 'nuke', secs = 6) {
  const keep = { ctx, master, tierLP, bus, comp, shaper, noiseBuf, gr, fa, bd, muted, duckK, live, ringG };
  const out = {};
  for (const limit of [true, false]) {
    ctx = new OfflineAudioContext(2, 44100 * secs, 44100); muted = false; duckK = 1; live = 0; noiseBuf = null; gr = null; fa = null; bd = null; ringG = null; lastGulp = -9; lastTear = -9; lastSiren = -9; lastHonk = -9; lastEek = -9; lastRaid = -9; lastPebble = -9;
    buildGraph(ctx, { limit });
    bed.tier(3); bed.defcon(1); bed.surf(1);
    if (scenario === 'nuke' || scenario === 'all') { nukeBoom(1, 0.2); pain(1); grind.set(1, 3); rumble(1, 0.3); klaxon(1); tear(1, 12); }
    if (scenario === 'finale' || scenario === 'all') { finale.start(); finale.mix({ sub: 0.8, groan: 0.4, choir: 0.7, grind: 0.7, shim: 0.3, drone: 0.4, rise: 0.5, up: 0.3 }, 0.01); /* the busiest real moment: the body of the fall */ finale.rupture(); finale.hit(1, 20); finale.last(); }
    if (scenario === 'all') { crackerFire(); aegisBreak(); levelUp(); star(); }
    const buf = await ctx.startRendering(), a = buf.getChannelData(0), b = buf.getChannelData(1);
    let pk = 0, sq = 0; for (let i = 0; i < a.length; i++) { pk = Math.max(pk, Math.abs(a[i]), Math.abs(b[i])); sq += a[i] * a[i] + b[i] * b[i]; }
    out[limit ? 'limited' : 'raw'] = { peakDb: +(20 * Math.log10(pk || 1e-9)).toFixed(1), rmsDb: +(10 * Math.log10(sq / (a.length * 2) || 1e-12)).toFixed(1) };
  }
  ({ ctx, master, tierLP, bus, comp, shaper, noiseBuf, gr, fa, bd, muted, duckK, live, ringG } = keep);
  return out;
}
if (typeof window !== 'undefined') window.__sfxProbe = levelProbe;

// ---------- Phase 4 (docs/PHASE4.md): the cosmos ----------
const SP_ROOT = [41.2, 43.65, 49, 55, 58.27, 65.41, 73.42, 77.78, 87.31, 98, 110]; // the drone's root per tier: it climbs a step each time the scale jumps
const PENT = [0, 2, 4, 7, 9];
let sp = null;
/** Resume a context that was created before the first gesture (?space starts without a click). */
export function wake() { if (ctx && ctx.state === 'suspended') ctx.resume(); }
export const space = {
  /** The bed: a sub drone, a slow open fifth, and a band of "solar wind" that follows how fast the hole moves. */
  start() {
    if (!ctx || sp) return;
    if (!noiseBuf) noise(0.01, 100, 0.0001);
    const t = ctx.currentTime, out = ctx.createGain(); out.gain.value = 0; out.gain.setTargetAtTime(1, t, 3); out.connect(master);
    const osc = (type, f, dest) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.connect(dest); o.start(); return o; };
    const sg = ctx.createGain(); sg.gain.value = 0.2; sg.connect(out); const sub = osc('sine', SP_ROOT[0], sg);
    const pg = ctx.createGain(); pg.gain.value = 0.05; const trem = ctx.createGain(); trem.gain.value = 0.6; pg.connect(trem); trem.connect(out);
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.09; lg.gain.value = 0.4; lfo.connect(lg).connect(trem.gain); lfo.start();
    const pad = [2, 3, 4.5].map((m) => osc('sine', SP_ROOT[0] * m * 2, pg));
    const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 500; wf.Q.value = 0.6; const wg = ctx.createGain(); wg.gain.value = 0.0;
    const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true; n.connect(wf).connect(wg).connect(out); n.start();
    sp = { out, sub, pad, wf, wg, tier: 0 };
  },
  /** Every frame: speed 0..1 (wind), tier 1..11 (root), nibble 0..1 (the crunch of something huge being eaten). */
  set(speed = 0, tier = 1, nib = 0) {
    if (!ctx || !sp) return;
    const t = ctx.currentTime, i = Math.max(0, Math.min(10, tier - 1));
    if (sp.tier !== i) { sp.tier = i; sp.sub.frequency.setTargetAtTime(SP_ROOT[i], t, 1.8); sp.pad.forEach((o, k) => o.frequency.setTargetAtTime(SP_ROOT[i] * [2, 3, 4.5][k] * 2, t, 1.8)); }
    sp.wg.gain.setTargetAtTime(0.02 + 0.16 * speed * speed, t, 0.15); sp.wf.frequency.setTargetAtTime(380 + 1500 * speed, t, 0.2);
    grind.set(nib, 1 + Math.floor(i / 4));
  },
  stop() { if (!ctx || !sp) return; sp.out.gain.setTargetAtTime(0, ctx.currentTime, 0.4); grind.stop(); const s = sp; sp = null; setTimeout(() => { try { s.sub.stop(); s.pad.forEach((o) => o.stop()); s.out.disconnect(); } catch { /* already gone */ } }, 2500); },
  /** A chain note: pentatonic, climbing two octaves with the count. */
  chain(n) { const k = Math.min(n, 14), f = 392 * 2 ** ((PENT[k % 5] + 12 * Math.floor(k / 5)) / 12); tone('sine', f, f * 1.003, 0.22, 0.2); tone('triangle', f * 2, f * 2, 0.14, 0.05); },
  power(kind) {
    if (kind === 'magnet') { tone('sine', 280, 900, 0.5, 0.25); tone('triangle', 560, 1800, 0.45, 0.08, 0.05); tone('sine', 900, 900, 0.35, 0.12, 0.4); }
    else if (kind === 'surge') { noiseUp(0.6, 3200, 0.3); tone('sawtooth', 110, 660, 0.55, 0.1); tone('square', 330, 990, 0.4, 0.05, 0.1); }
    else if (kind === 'shield') [523, 659, 784, 1046].forEach((f, i) => { tone('sine', f, f, 0.9, 0.16, i * 0.06); tone('triangle', f * 2, f * 2, 0.5, 0.04, i * 0.06); });
    else { boom(1); noiseUp(0.5, 5000, 0.4); tone('sine', 62, 22, 1.8, 0.8, 0.15); [523, 784, 1046].forEach((f, i) => tone('sine', f, f, 1.2, 0.1, 0.3 + i * 0.08)); }
  },
  flareWarn() { for (let i = 0; i < 2; i++) { tone('sawtooth', 240, 520, 0.7, 0.14, i * 0.8); tone('square', 120, 260, 0.7, 0.04, i * 0.8); } },
  flareHit() { noise(0.5, 2600, 0.6); tone('sine', 95, 24, 1.0, 0.9); tone('sawtooth', 300, 40, 0.6, 0.15); },
  storm() { noiseUp(1.5, 2400, 0.35); windRush(2.2); for (let i = 0; i < 4; i++) tone('triangle', 900 - i * 120, 300, 0.3, 0.05, 0.3 + i * 0.25); },
  ion() { noiseUp(0.7, 4200, 0.3); tone('sawtooth', 160, 880, 0.7, 0.08); tone('sine', 880, 1320, 0.4, 0.08, 0.3); },
  /** The tier-up: a rising open chord on the new root, a sub swell and a shimmer. */
  tierUp(n = 1) {
    const r = SP_ROOT[Math.min(10, n)] * 4;
    [1, 1.5, 2, 3, 4].forEach((m, i) => { tone('sine', r * m, r * m * 1.002, 3.2, 0.15 - i * 0.015, i * 0.12); tone('triangle', r * m * 2.001, r * m * 2, 2.4, 0.03, 0.3 + i * 0.12); });
    tone('sine', SP_ROOT[Math.min(10, n)], SP_ROOT[Math.min(10, n)] * 0.5, 3.4, 0.7); noiseUp(2.2, 6000, 0.25);
  },
  gulpBig(k = 0.5) { tone('sine', 140 - 80 * k, 30, 0.5 + 0.6 * k, 0.5 + 0.3 * k); noise(0.18, 1800, 0.15 + 0.2 * k); },
  victory() { chord(); choir(1); tone('sine', 36, 24, 6, 0.6, 0.2); },
};
