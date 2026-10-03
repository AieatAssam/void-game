// Bakes the `surf` and `night` face arrays off the main thread. in: { seed, N, faces: [0..5] } out: one message per face.
import { makePlanet, bakeRows } from './planetgen.js';

self.onmessage = (ev) => {
  const { seed, N, faces } = ev.data;
  const P = makePlanet(seed);
  for (const f of faces) {
    const surf = new Uint8Array(N * N * 4), night = new Uint8Array(N * N * 2);
    bakeRows(P, f, N, 0, N, surf, night);
    self.postMessage({ face: f, surf: surf.buffer, night: night.buffer }, [surf.buffer, night.buffer]);
  }
};
