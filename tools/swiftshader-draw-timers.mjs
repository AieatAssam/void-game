// Diagnostic only: sparse GPU TIME_ELAPSED samples around Three r186's public
// render-object hook. This measures one render-list item (often an InstancedMesh
// batch), not individual instances. No application source or renderer internals
// are modified. Run one browser at a time; timer queries and hook wrapping perturb
// the measured workload, so treat results as attribution clues, not a phone FPS test.
//
// Usage:
//   SOFTWARE=1 WIDTH=390 HEIGHT=844 node tools/swiftshader-draw-timers.mjs [seconds=5] [rotationSeed=100] [query='?q=software&webgl&nowatch']
//   FREEZE=1 holds simulation/NodeFrame time and checks camera, hole, and counts.
//   COHORT=water samples only the terrain water mesh callback.
//   SCENE='window.__views("coast")' ...
import { chromium, channel } from './browser.mjs';

const [secondsArg = '5', rotationSeedArg = '100', queryArg = '?q=software&webgl&nowatch'] = process.argv.slice(2);
const seconds = Math.max(1, Math.min(20, Number(secondsArg) || 5));
const rotationSeed = Number(rotationSeedArg) || 0;
const software = process.env.SOFTWARE === '1';
const freeze = process.env.FREEZE === '1';
const cohort = process.env.COHORT || null;
if (cohort && cohort !== 'water') throw new Error(`Unknown COHORT=${cohort}; supported cohort: water`);
const query = `${queryArg}${queryArg.includes('?') ? '&' : '?'}seed=7&time=golden&nothumbs&nowatch`;
const startPlanet = new URLSearchParams(query.split('?').at(-1)).has('planet');
const browser = await chromium.launch({
  headless: process.env.HEADLESS !== '0',
  channel,
  args: ['--ignore-gpu-blocklist', ...(software ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [])]
});
const page = await browser.newPage({ viewport: { width: +(process.env.WIDTH || 390), height: +(process.env.HEIGHT || 844) }, deviceScaleFactor: 1 });
page.setDefaultTimeout(180000);
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) errors.push(`${r.status()} ${r.url()}`); });

let freezeAttempted = false;
try {
  await page.goto(`http://127.0.0.1:${process.env.PORT || 5174}/${query}`);
  if (startPlanet) await page.waitForFunction(() => window.__planet && window.__game().state.phase === 3 && window.__game().state.playing);
  else { await page.waitForSelector('#menu:not([hidden])'); await page.locator('#play').click(); }
  if (new URLSearchParams(query.split('?').at(-1)).has('region'))
    await page.waitForFunction(() => window.__game?.().state.phase === 2 && !window.__game().state.breaking);
  if (process.env.SCENE) {
    await page.evaluate(async source => { const result = (0, eval)(source); if (typeof result === 'function') await result(); }, process.env.SCENE);
  }
  await page.waitForTimeout(5000); // let shaders and assets warm before sampling

  let freezeBaseline = null;
  if (freeze) {
    freezeAttempted = true;
    freezeBaseline = await page.evaluate(() => {
      const g = window.__game(), nf = g.renderer._nodes?.nodeFrame;
      if (!nf || typeof nf.update !== 'function') throw new Error('Expected Three.js renderer._nodes.nodeFrame.update; freeze uses the private r186 NodeFrame API.');
      const saved = { playing: g.state.playing, draft: g.state.draft, draftsDue: g.state.draftsDue, pause: window.__pause, nf, update: nf.update, time: nf.time, deltaTime: nf.deltaTime, lastTime: nf.lastTime };
      window.__drawTimerFreeze = saved;
      g.state.playing = false;
      g.state.draft = [];
      g.state.draftsDue = 0;
      nf.update = function () { this.frameId++; this.deltaTime = 0; this.lastTime = performance.now(); g.renderer.info.frame = this.frameId; };
      window.__drawTimerSnapshot = () => {
        const { hole, state, camera } = window.__game();
        const xyz = v => [v.x, v.y, v.z], quat = q => [q.x, q.y, q.z, q.w];
        return {
          camera: { position: xyz(camera.position), quaternion: quat(camera.quaternion), up: xyz(camera.up), fov: camera.fov, aspect: camera.aspect, near: camera.near, far: camera.far },
          hole: { position: [hole.x, hole.z], radius: hole.r, area: hole.area },
          time: state.time,
          counts: { eaten: state.eaten, swallowed: state.pop, rivalsEaten: state.rivalsEaten },
        };
      };
      return window.__drawTimerSnapshot();
    });
  }

  const report = await page.evaluate(async ({ seconds, rotationSeed, freezeBaseline, cohort, software }) => {
    const summarize = samples => {
      const sorted = samples.slice().sort((a, b) => a - b);
      if (!sorted.length) return null;
      return { n: sorted.length, p50: sorted[Math.floor((sorted.length - 1) * 0.5)], p90: sorted[Math.floor((sorted.length - 1) * 0.9)], min: sorted[0], max: sorted.at(-1) };
    };
    const g = window.__game();
    const renderer = g.renderer;
    const backend = renderer.backend;
    const gl = backend.gl;
    const cohortTarget = cohort === 'water' ? g.city.terrain?.waterMesh : null;
    if (cohort === 'water' && !cohortTarget) throw new Error('COHORT=water target g.city.terrain.waterMesh is unavailable.');
    if (!gl || !renderer.setRenderObjectFunction || !renderer.renderObject) throw new Error('Expected the Three.js WebGL backend and public render-object hook.');
    if (backend.trackTimestamp) throw new Error('Built-in frame timestamp queries are enabled; remove ?fps so per-item queries cannot nest.');
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') || gl.getExtension('EXT_disjoint_timer_query');
    if (!ext || typeof gl.createQuery !== 'function') throw new Error('This WebGL backend does not expose disjoint timer queries.');
    const frozenSnapshot = () => window.__drawTimerSnapshot();
    const assertFrozen = where => {
      if (freezeBaseline && JSON.stringify(frozenSnapshot()) !== JSON.stringify(freezeBaseline)) throw new Error(`FREEZE=1 game/camera state changed ${where}.`);
    };

    const windowMs = async () => {
      const values = [];
      let start = 0, previous = 0;
      await new Promise(resolve => requestAnimationFrame(function frame(t) {
        if (!start) start = t;
        if (previous) values.push(t - previous);
        previous = t;
        if (t - start < seconds * 1000) requestAnimationFrame(frame); else resolve();
      }));
      values.sort((a, b) => a - b);
      return { n: values.length, p50: values[Math.floor(values.length * 0.5)], p95: values[Math.floor(values.length * 0.95)], max: values.at(-1) };
    };

    // Sequential within one stable page: uninstrumented reference first, then the
    // sparse-query window. This is an overhead check, not a cross-device benchmark.
    const rafBefore = await windowMs();
    assertFrozen('during the uninstrumented RAF reference');
    const querySamples = [], skipped = { disjoint: 0, unavailable: 0, pendingCap: 0 };
    const maxPending = 32;
    let callbacks = 0, issued = 0, cohortCallbacks = 0, activeQuery = false, instrumenting = true, rafFrame = 0;
    let activeFrame = -1, frameCallbacks = 0, targetCallback = 0, sampledThisFrame = false, estimatedCallbacksPerFrame = 122;
    const pending = new Set();
    const callbackHistogram = new Map(), callbackObjects = new Set(), sampledObjects = new Set(), sampledFrames = new Set();
    const scenePass = g.post?.scenePass;
    if (!scenePass?.updateBefore) throw new Error('Expected the FXAA scene pass updateBefore hook.');
    const oldHook = renderer.getRenderObjectFunction?.() ?? null;
    if (oldHook) throw new Error('A custom render-object hook is already installed; refusing to replace it.');
    const originalUpdateBefore = scenePass.updateBefore;
    const poll = () => {
      rafFrame++;
      if (gl.getParameter(ext.GPU_DISJOINT_EXT)) for (const entry of pending) entry.disjoint = true;
      for (const entry of [...pending]) {
        if (!gl.getQueryParameter(entry.query, gl.QUERY_RESULT_AVAILABLE)) continue;
        const ns = gl.getQueryParameter(entry.query, gl.QUERY_RESULT);
        gl.deleteQuery(entry.query);
        pending.delete(entry);
        if (entry.disjoint) skipped.disjoint++;
        else if (Number.isFinite(ns) && ns >= 0) querySamples.push({
          label: entry.label, uuid: entry.uuid, objectName: entry.objectName,
          type: entry.type, pass: entry.pass, materialName: entry.materialName, materialType: entry.materialType,
          geometryName: entry.geometryName, geometryType: entry.geometryType, renderOrder: entry.renderOrder,
          ms: ns / 1e6, instances: entry.instances
        });
        else skipped.unavailable++;
      }
      if (instrumenting || pending.size) requestAnimationFrame(poll);
    };
    const sampleRenderObject = (object, scene, camera, geometry, material, group, lightsNode, clippingContext, passId) => {
      callbacks++;
      const materialName = material?.name || '';
      const geometryName = geometry?.name || '';
      const pass = passId || 'main';
      const histogramKey = `${object.uuid}|${pass}|${material?.uuid || ''}|${geometry?.uuid || ''}`;
      const histogramEntry = callbackHistogram.get(histogramKey) || {
        objectName: object.name || '', type: object.type, pass, materialName: materialName || '(unnamed)', materialType: material?.type || 'unknown',
        geometryName: geometryName || '(unnamed)', geometryType: geometry?.type || 'unknown', renderOrder: object.renderOrder,
        parentName: object.parent?.name || '', positionCount: geometry?.attributes?.position?.count || 0,
        materialHasPlanetUniforms: !!material?.userData?.u,
        instances: typeof object.count === 'number' ? object.count : 1, callbacks: 0, uuid: object.uuid
      };
      histogramEntry.callbacks++;
      callbackHistogram.set(histogramKey, histogramEntry);
      callbackObjects.add(object.uuid);
      const cohortMatch = cohort === 'water' && object === cohortTarget;
      if (cohortMatch) cohortCallbacks++;

      if (rafFrame !== activeFrame) {
        if (activeFrame >= 0 && frameCallbacks) estimatedCallbacksPerFrame = frameCallbacks;
        activeFrame = rafFrame;
        frameCallbacks = 0;
        sampledThisFrame = false;
        const phase = (rafFrame * 0.6180339887498949 + rotationSeed * 0.13750352375) % 1;
        targetCallback = Math.floor(phase * Math.max(1, estimatedCallbacksPerFrame));
      }
      const callbackIndex = frameCallbacks++;
      const due = (cohort === 'water' ? cohortMatch : callbackIndex === targetCallback) && !sampledThisFrame;
      const sample = due && !activeQuery && object.occlusionTest !== true && pending.size < maxPending;
      if (due && pending.size >= maxPending) skipped.pendingCap++;
      let query = null;
      if (sample) {
        query = gl.createQuery();
        try {
          gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
          activeQuery = true;
          sampledThisFrame = true;
          issued++;
          sampledFrames.add(rafFrame);
          sampledObjects.add(object.uuid);
        } catch (error) {
          gl.deleteQuery(query);
          query = null;
          activeQuery = false;
        }
      }
      try {
        renderer.renderObject(object, scene, camera, geometry, material, group, lightsNode, clippingContext, passId);
      } finally {
        if (query) {
          try {
            gl.endQuery(ext.TIME_ELAPSED_EXT);
            activeQuery = false;
            pending.add({
              query,
              label: object.name || `${object.type}/${materialName || material?.type || 'material'}/${geometryName || geometry?.type || 'geometry'}`,
              uuid: object.uuid,
              objectName: object.name || '',
              type: object.type,
              pass,
              materialName: materialName || '(unnamed)',
              materialType: material?.type || 'unknown',
              geometryName: geometryName || '(unnamed)',
              geometryType: geometry?.type || 'unknown',
              parentName: object.parent?.name || '',
              positionCount: geometry?.attributes?.position?.count || 0,
              materialHasPlanetUniforms: !!material?.userData?.u,
              renderOrder: object.renderOrder,
              instances: typeof object.count === 'number' ? object.count : 1
            });
          } catch {
            gl.deleteQuery(query);
            activeQuery = false;
            skipped.unavailable++;
          }
        }
      }
    };
    scenePass.updateBefore = function (...args) {
      const previousHook = renderer.getRenderObjectFunction();
      renderer.setRenderObjectFunction(sampleRenderObject);
      try { return originalUpdateBefore.apply(this, args); }
      finally { renderer.setRenderObjectFunction(previousHook); }
    };
    let rafInstrumented;
    try {
      requestAnimationFrame(poll);
      rafInstrumented = await windowMs();
      assertFrozen('during the instrumented RAF window');
      instrumenting = false;
      // Poll availability without blocking GPU execution; unfinished samples are omitted.
      if (pending.size) requestAnimationFrame(poll);
      const deadline = performance.now() + 1000;
      while (pending.size && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
      for (const entry of pending) { gl.deleteQuery(entry.query); skipped.unavailable++; }
      pending.clear();
    } finally {
      instrumenting = false;
      scenePass.updateBefore = originalUpdateBefore;
      renderer.setRenderObjectFunction(oldHook);
      for (const entry of pending) { gl.deleteQuery(entry.query); skipped.unavailable++; }
      pending.clear();
    }

    const callbacksPerFrame = callbacks / Math.max(1, rafInstrumented.n);
    if (!callbacks || callbacksPerFrame < 1) throw new Error(`Scene-pass render-object hook captured only ${callbacks} callbacks over ${rafInstrumented.n} frames (${callbacksPerFrame.toFixed(1)}/frame).`);
    if (cohort && cohortCallbacks === 0) throw new Error(`COHORT=${cohort} target was never seen by the scene-pass render-object hook.`);

    const groups = new Map();
    for (const sample of querySamples) {
      const key = `${sample.uuid} | ${sample.pass}`;
      const entry = groups.get(key) || {
        label: sample.label, uuid: sample.uuid, objectName: sample.objectName, type: sample.type, pass: sample.pass,
        materialName: sample.materialName, materialType: sample.materialType,
        geometryName: sample.geometryName, geometryType: sample.geometryType, renderOrder: sample.renderOrder,
        parentName: sample.parentName, positionCount: sample.positionCount, materialHasPlanetUniforms: sample.materialHasPlanetUniforms,
        samples: [], instances: sample.instances
      };
      entry.samples.push(sample.ms);
      groups.set(key, entry);
    }
    const attributed = [...groups.values()].map(entry => ({
      label: entry.label, objectName: entry.objectName || null, uuid: entry.uuid.slice(0, 8), type: entry.type, pass: entry.pass,
      materialName: entry.materialName, materialType: entry.materialType,
      geometryName: entry.geometryName, geometryType: entry.geometryType, renderOrder: entry.renderOrder,
      parentName: entry.parentName || null, positionCount: entry.positionCount, materialHasPlanetUniforms: entry.materialHasPlanetUniforms,
      instances: entry.instances,
      gpuMs: summarize(entry.samples)
    })).sort((a, b) => (b.gpuMs?.p50 || 0) - (a.gpuMs?.p50 || 0));
    const maskedRenderer = gl.getParameter(gl.RENDERER);
    const rendererInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const unmaskedRenderer = rendererInfo ? gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL) : null;
    const softwareRenderer = /swiftshader|llvmpipe|software/i.test(`${maskedRenderer} ${unmaskedRenderer || ''}`);
    if (software && !softwareRenderer) throw new Error(`SOFTWARE=1 requested but renderer is ${unmaskedRenderer || maskedRenderer}.`);
    const callbackHistogramReport = [...callbackHistogram.values()].sort((a, b) => b.callbacks - a.callbacks).map(entry => ({
      uuid: entry.uuid.slice(0, 8), objectName: entry.objectName || null, type: entry.type, pass: entry.pass,
      materialName: entry.materialName, materialType: entry.materialType, geometryName: entry.geometryName, geometryType: entry.geometryType,
      parentName: entry.parentName || null, positionCount: entry.positionCount, materialHasPlanetUniforms: entry.materialHasPlanetUniforms,
      renderOrder: entry.renderOrder, instances: entry.instances, callbacks: entry.callbacks
    }));
    if (issued === 0) throw new Error(`No timer query was issued in ${seconds}s (${callbacks} render-object callbacks).`);
    if (issued !== sampledFrames.size) throw new Error(`Expected at most one timer query per animation frame; issued ${issued} across ${sampledFrames.size} sampled frames.`);
    if (!cohort && issued >= 20 && sampledObjects.size < 5) throw new Error(`Rotating sample schedule reached only ${sampledObjects.size} unique objects in ${issued} queries; expected at least 5.`);
    return {
      renderer: { masked: maskedRenderer, unmasked: unmaskedRenderer, unmaskedAvailable: !!unmaskedRenderer, software: softwareRenderer },
      viewport: [innerWidth, innerHeight],
      backbuffer: [renderer.domElement.width, renderer.domElement.height],
      backend: backend.constructor.name,
      trackTimestamp: backend.trackTimestamp,
      rotationSeed,
      ...(cohort ? { cohort: { name: cohort, target: { name: cohortTarget.name || null, type: cohortTarget.type, uuid: cohortTarget.uuid }, callbacks: cohortCallbacks, queriesIssued: issued, sampleCount: querySamples.length } } : {}),
      secondsPerWindow: seconds,
      callbacks,
      callbacksPerFrame,
      uniqueCallbackObjects: callbackObjects.size,
      queryCount: issued,
      sampledFrames: sampledFrames.size,
      uniqueSampledObjects: sampledObjects.size,
      skipped,
      rafBefore,
      rafInstrumented,
      ...(freezeBaseline ? { freeze: { enabled: true, baseline: freezeBaseline, after: frozenSnapshot(), verified: true } } : {}),
      attributed,
      callbackHistogram: callbackHistogramReport,
      caveat: cohort ? 'The selected cohort is sampled at most once per frame when its render-object callback occurs; the histogram still counts all callbacks. Timer scope is one Three render-list callback. Instrumentation perturbs timing; do not interpret samples as per-instance cost or phone FPS.' : 'At most one sequential timer query is issued per animation frame, with a rotating callback position to reduce object aliasing. Histogram counts every scene-pass callback without issuing queries. Timer scope is one Three render-list callback; InstancedMesh is one batch and material groups/passes may be separate callbacks. Instrumentation perturbs timing; do not interpret samples as per-instance cost or phone FPS.'
    };
  }, { seconds, rotationSeed, freezeBaseline, cohort, software });
  report.errors = errors;
  console.log(JSON.stringify(report, null, 2));
  if (errors.length) process.exitCode = 1;
} finally {
  if (freezeAttempted) await page.evaluate(() => {
    const saved = window.__drawTimerFreeze;
    if (!saved) return;
    saved.nf.update = saved.update;
    saved.nf.time = saved.time;
    saved.nf.deltaTime = saved.deltaTime;
    saved.nf.lastTime = saved.lastTime;
    const { state } = window.__game();
    state.draft = saved.draft;
    state.playing = saved.playing;
    state.draftsDue = saved.draftsDue;
    window.__pause = saved.pause;
    delete window.__drawTimerFreeze;
    delete window.__drawTimerSnapshot;
  }).catch(() => {});
  await browser.close();
}
