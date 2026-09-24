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
