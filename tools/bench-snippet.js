// Paste into the browser console on a ?planet page (docs/PERFORMANCE.md, "Phase 3"): await __tiers([40000, 150000, 450000, 1200000]) -> ms per frame at pixel ratio 1 and 2 per tier.
// (On WebGL replace the sync with a 1-pixel gl.readPixels; gl.finish() does not wait there.)
window.__bench = async (frames = 60, pr = 1) => {
  const g = window.__game(), r = g.renderer; if (pr) r.setPixelRatio(pr);
  const sync = async () => { const b = r.backend; if (b.device) await b.device.queue.onSubmittedWorkDone(); else b.gl.finish(); };
  for (let i = 0; i < 8; i++) window.__tick(1 / 60);
  await sync(); r.info.reset?.();
  const cpu = []; const t0 = performance.now(); let lh = performance.memory?.usedJSHeapSize || 0, alloc = 0;
  for (let i = 0; i < frames; i++) { const a = performance.now(); window.__tick(1 / 60); cpu.push(performance.now() - a); const h = performance.memory?.usedJSHeapSize || 0; if (h > lh) alloc += h - lh; lh = h; if (i % 10 === 9) await sync(); }
  await sync(); const ms = (performance.now() - t0) / frames; cpu.sort((a, b) => a - b); const inf = r.info;
  return { ms: +ms.toFixed(1), cpu: +(cpu.reduce((a, b) => a + b, 0) / frames).toFixed(1), cpuMax: +cpu[frames - 1].toFixed(1), draws: Math.round((inf.render.drawCalls ?? inf.render.calls) / frames), tris: Math.round(inf.render.triangles / frames / 1000), allocKB: +(alloc / 1024 / frames).toFixed(0) };
};
window.__tiers = async (rs) => { const out = {}; const P = window.__planet; for (const rr of rs) { P.setR(rr); for (let i = 0; i < 120; i++) window.__tick(1 / 30); await new Promise(r => setTimeout(r, 300)); out['r' + rr / 1000] = [await window.__bench(50, 1), await window.__bench(30, 2)]; } return JSON.stringify(out); };
