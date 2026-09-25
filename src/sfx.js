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
