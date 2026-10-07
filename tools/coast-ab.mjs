// Software-rendered coast A/B/A/B profile in one page. The private r186 node-frame
// clock is held at dt=0 while frame IDs advance; an empty draft pauses simulation.
// Usage: VIEW=river node tools/coast-ab.mjs <group-name|trees|foliageLite|crumbCache|terrain|waterSdf> [seconds=5] [query='?q=software&region&webgl']
// Example: node tools/coast-ab.mjs IslandTrees 5 '?q=software&region&webgl'
// Requires the Vite dev server. Writes .shots/coast-ab-<group>-<run>/{A1,B1,A2,B2}.{json,png}.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, channel } from './browser.mjs';

const [groupName, secondsArg = '5', query = '?q=software&region&webgl'] = process.argv.slice(2);
const view = process.env.VIEW || 'coast';
if (!groupName || groupName === '--help') {
  console.log('Usage: node tools/coast-ab.mjs <group-name|trees|foliageLite|crumbCache|terrain|waterSdf> [seconds=5] [query=\'?q=software&region&webgl\']');
  console.log('Set SOFTWARE=0 to use the normal machine renderer for visual A/B.');
  console.log('waterSdf toggles the optional shore field after its first build.');
  console.log(`Profiles ${view} A/B/A/B; trees hides tree meshes, terrain hides terrain sectors, foliageLite disables tree bark/leaf nodes, crumbCache compares rebuild-every-frame against cached packing.`);
  console.log('Requires the Vite dev server. Each foliageLite window settles for 3 seconds before sampling.');
  process.exit(groupName === '--help' ? 0 : 2);
}
const seconds = Number(secondsArg);
if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('seconds must be a positive number');

const safeName = groupName.replace(/[^a-z0-9_-]/gi, '_');
const out = `.shots/coast-ab-${safeName}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
mkdirSync(out, { recursive: true });
const software = process.env.SOFTWARE !== '0';
const browser = await chromium.launch({ headless: true, channel, args: software ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
let page, setupSaved = false, guardInstalled = false;
try {
  page = await browser.newPage({ viewport: { width: +(process.env.WIDTH || 390), height: +(process.env.HEIGHT || 844) }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(180000);
  const url = new URL(`http://127.0.0.1:${process.env.PORT || 5174}/${query}`);
  url.searchParams.set('seed', '7');
  url.searchParams.set('time', 'golden');
  url.searchParams.set('nothumbs', '');
  url.searchParams.set('nowatch', '');
  await page.goto(url.toString());
  await page.waitForSelector('#menu:not([hidden])');
  await page.locator('#play').click();
  await page.waitForFunction(() => window.__game?.().state.phase === 2 && !window.__game().state.breaking);
  const actualRenderer = await page.evaluate(() => {
    const gl = window.__game().renderer.backend.gl;
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return gl?.getParameter(ext?.UNMASKED_RENDERER_WEBGL || gl.RENDERER) || 'WebGPU';
  });
  if (software && !/swiftshader|llvmpipe|software/i.test(actualRenderer)) throw new Error(`Software renderer requested but got ${actualRenderer}`);

  setupSaved = true;
  await page.evaluate(async view => {
    const g = window.__game();
    window.__coastABRestore = { playing: g.state.playing, draft: g.state.draft, draftsDue: g.state.draftsDue };
    g.state.playing = false;
    g.state.draft = null; // city.update must run to reveal the region meshes
    await window.__views(view);
  }, view);
  await page.waitForFunction(() => {
    const { city } = window.__game();
    return city.reveal >= city.meshes.length;
  }, null, { timeout: 180000 });
  if (groupName === 'waterSdf') await page.waitForFunction(() => window.__game().city.terrain.waterSdfStats?.uploads > 0, null, { timeout: 180000 });

  // Pause play only after the reveal has completed, then freeze the renderer clock.
  guardInstalled = true;
  await page.evaluate(name => {
    const g = window.__game(), nf = g.renderer._nodes?.nodeFrame;
    if (!nf || typeof nf.update !== 'function') throw new Error('Expected Three.js renderer._nodes.nodeFrame.update; this diagnostic uses a private r186 API.');
    const saved = window.__coastABRestore;
    const wantsFoliageLite = name === 'foliageLite';
    const wantsCrumbCache = name === 'crumbCache';
    const wantsTerrain = name === 'terrain';
    const wantsWaterSdf = name === 'waterSdf';
    const selector = wantsFoliageLite || wantsCrumbCache ? 'trees' : name;
    const targets = wantsTerrain ? g.city.terrain?.sectors ?? [] : wantsWaterSdf ? [g.city.terrain?.waterMesh].filter(Boolean) : selector === 'trees' ? [] : [g.scene.getObjectByName(selector)].filter(o => o?.isGroup);
    if (wantsCrumbCache) targets.push(...g.city.meshes.filter(o => o.userData?.crumb && o.userData?.cull));
    else if (selector === 'trees') g.scene.traverse(o => {
      if (o.isInstancedMesh && Array.isArray(o.userData?.list) && o.userData.list.some(e => e.alive && /^(tree_|palm|pine)/i.test(e.name))) targets.push(o);
    });
    if (wantsTerrain && !g.city.terrain?.waterMesh) throw new Error('Terrain water mesh is unavailable.');
    if (wantsWaterSdf && (!g.city.terrain?.waterSdfActive || !g.city.terrain?.waterSdfTexture)) throw new Error('Load with ?waterSdf to profile the shore field.');
    if (!targets.length) throw new Error(wantsTerrain ? 'No terrain sectors found.' : selector === 'trees' ? 'No live tree instance meshes found in the phase-2 scene.' : `No THREE.Group named "${name}" in the scene.`);
    if (!targets.some(o => o.visible)) throw new Error(`Target "${name}" has no visible objects; B cannot measure a visible change.`);
    Object.assign(saved, { targets, visible: targets.map(o => o.visible), pause: window.__pause, nf, update: nf.update, time: nf.time });
    if (wantsWaterSdf) {
      const camera = g.camera, position = camera.position.clone(), quaternion = camera.quaternion.clone(), lookAt = camera.lookAt;
      const terrain = g.city.terrain, updateWaterSdf = terrain.updateWaterSdf;
      Object.assign(saved, { camera, cameraPosition: position, cameraQuaternion: quaternion, cameraLookAt: lookAt, terrain, updateWaterSdf });
      camera.lookAt = function (...args) {
        lookAt.apply(this, args);
        this.position.copy(position);
        this.quaternion.copy(quaternion);
        this.updateMatrixWorld(true);
      };
    }
    if (wantsFoliageLite) {
      const materials = new Set(targets.flatMap(o => Array.isArray(o.material) ? o.material.filter(m => m && m !== o.material.shadow) : []));
      saved.materials = [...materials].map(material => ({ material, normalNode: material.normalNode, positionNode: material.positionNode, emissiveNode: material.emissiveNode }));
      if (!saved.materials.length) throw new Error('No tree bark/leaf materials found.');
    }
    if (wantsCrumbCache) {
      if (typeof g.city.cullCrumbs !== 'function' || !targets.every(o => o.userData.cull && Number.isFinite(o.userData.cull.packedRevision))) throw new Error('Crumb cache fields/method are unavailable.');
      saved.cullCrumbs = g.city.cullCrumbs;
      window.__coastABCrumbTimings = [];
      g.city.cullCrumbs = function (shadowCamera) {
        if (!window.__coastABUseCache) for (const mesh of targets) mesh.userData.cull.packedRevision = -1;
        const start = performance.now();
        try { return saved.cullCrumbs.call(this, shadowCamera); }
        finally { window.__coastABCrumbTimings.push(performance.now() - start); }
      };
    }
    g.state.playing = saved.playing; g.state.draft = []; g.state.draftsDue = 0;
    nf.update = function () { this.frameId++; this.deltaTime = 0; this.lastTime = performance.now(); g.renderer.info.frame = this.frameId; };
    if (name === 'trees') {
      saved.budget = g.city.budget;
      saved.hideTrees = window.__coastABHideTrees;
      g.city.budget = function (...args) {
        const result = saved.budget.apply(this, args);
        if (window.__coastABHideTrees) targets.forEach(o => { o.visible = false; });
        return result;
      };
    }
  }, groupName);
  if (groupName === 'waterSdf') {
    await page.waitForTimeout(5000);
    const field = await page.evaluate(() => {
      const t = window.__game().city.terrain;
      return { type: t?.constructor?.name, enabled: t?.waterSdfEnabled, stats: t?.waterSdfStats, building: !!t?.waterSdfBuild, segments: t?.waterSdfSegments?.length, active: t?.waterSdfActive?.value };
    });
    console.log(`waterSdf settled: ${JSON.stringify(field)}`);
    if (!field.enabled || field.building || !field.stats?.uploads) throw new Error(`Shore field did not settle: ${JSON.stringify(field)}`);
    await page.evaluate(() => { window.__game().city.terrain.updateWaterSdf = function () {}; });
  }
  const snapshot = () => page.evaluate(name => {
    const g = window.__game(), { hole, state, camera, renderer } = g;
    const xyz = v => [v.x, v.y, v.z];
    const quat = q => [q.x, q.y, q.z, q.w];
    const size = renderer.getSize(new g.THREE.Vector2()), info = window.__info();
    return {
      hole: { r: hole.r, area: hole.area, position: [hole.x, hole.z] },
      counts: { eaten: state.eaten, swallowed: state.pop, rivalsEaten: state.rivalsEaten },
      camera: { position: xyz(camera.position), quaternion: quat(camera.quaternion), up: xyz(camera.up), fov: camera.fov, aspect: camera.aspect, near: camera.near, far: camera.far },
      phase: state.phase,
      renderer: { size: [size.x, size.y], pixels: [renderer.domElement.width, renderer.domElement.height], pixelRatio: renderer.getPixelRatio(), draws: info.calls, tris: info.tris, frameCalls: info.frameCalls },
      waterSdf: name === 'waterSdf' ? { ...g.city.terrain.waterSdfStats, active: g.city.terrain.waterSdfActive.value, origin: [g.city.terrain.waterSdfOrigin.value.x, g.city.terrain.waterSdfOrigin.value.y] } : null,
      targetVisible: window.__coastABRestore.targets.map(o => o.visible),
      terrain: name === 'terrain' ? { sectorCount: g.city.terrain.sectors.length, visibleSectorCount: g.city.terrain.sectors.filter(o => o.visible).length, waterVisible: g.city.terrain.waterMesh.visible } : null,
    };
  }, groupName);
  const stable = s => ({ ...s, renderer: { ...s.renderer, draws: undefined, tris: undefined }, targetVisible: undefined, terrain: s.terrain && { ...s.terrain, visibleSectorCount: undefined, waterVisible: undefined }, waterSdf: undefined });
  const profile = () => page.evaluate(duration => new Promise(resolve => {
    const times = [];
    let start, previous;
    const frame = t => {
      start ??= t;
      if (previous !== undefined) times.push(t - previous);
      previous = t;
      if (t - start < duration * 1000) requestAnimationFrame(frame);
      else {
        times.sort((a, b) => a - b);
        const percentile = p => times[Math.min(times.length - 1, Math.floor(times.length * p))];
        resolve({ n: times.length, p50: percentile(.5), p95: percentile(.95), worst: times.at(-1) });
      }
    };
    requestAnimationFrame(frame);
  }), seconds);

  let baseline;
  for (const [label, mutate] of [['A1', false], ['B1', true], ['A2', false], ['B2', true]]) {
    const before = await snapshot();
    baseline ??= before;
    assert.deepEqual(stable(before), stable(baseline), `${label} begins from different game/camera state`);
    let timing, during;
    try {
      if (groupName === 'foliageLite') await page.evaluate(lite => {
        for (const saved of window.__coastABRestore.materials) {
          saved.material.normalNode = lite ? null : saved.normalNode;
          saved.material.positionNode = lite ? null : saved.positionNode;
          saved.material.emissiveNode = lite ? null : saved.emissiveNode;
          saved.material.needsUpdate = true;
        }
      }, mutate);
      else if (groupName === 'waterSdf') await page.evaluate(enabled => {
        window.__game().city.terrain.waterSdfActive.value = enabled ? 1 : 0;
      }, mutate);
      else if (groupName === 'crumbCache') await page.evaluate(useCache => {
        window.__coastABUseCache = useCache;
        window.__coastABCrumbTimings.length = 0;
      }, mutate);
      else if (mutate) await page.evaluate(() => {
          window.__coastABHideTrees = window.__coastABRestore.targets.every(o => o.isInstancedMesh);
          window.__coastABRestore.targets.forEach(o => { o.visible = false; });
        });
      if (groupName === 'foliageLite') await page.waitForTimeout(3000); // let the alternate materials compile before timing
      timing = await profile();
      during = await snapshot();
      if (groupName === 'waterSdf') {
        for (const time of [0, 2.5, 5, 7.5, 10, 12.5]) {
          await page.evaluate(time => new Promise(resolve => {
            window.__coastABRestore.nf.time = time;
            requestAnimationFrame(() => requestAnimationFrame(resolve));
          }), time);
          await page.screenshot({ path: `${out}/${label}-t${time}.png` });
        }
      } else await page.screenshot({ path: `${out}/${label}.png` });
    } finally {
      if (groupName === 'foliageLite') await page.evaluate(() => {
        for (const saved of window.__coastABRestore.materials) {
          saved.material.normalNode = saved.normalNode;
          saved.material.positionNode = saved.positionNode;
          saved.material.emissiveNode = saved.emissiveNode;
          saved.material.needsUpdate = true;
        }
      });
      else if (mutate) await page.evaluate(() => {
        const saved = window.__coastABRestore;
        window.__coastABHideTrees = false;
        saved.targets.forEach((o, i) => { o.visible = saved.visible[i]; });
      });
    }
    const after = await snapshot();
    assert.deepEqual(stable(after), stable(before), `${label} changed game/camera state`);
    if (groupName === 'trees' && mutate) assert.ok(during.targetVisible.every(v => !v), `${label} did not hide every target`);
    else if (groupName === 'terrain' && mutate) assert.ok(during.targetVisible.every(v => !v), `${label} did not hide every terrain sector`);
    else assert.deepEqual(during.targetVisible, before.targetVisible, `${label} changed the target group`);
    if (groupName === 'terrain') {
      assert.equal(during.terrain.sectorCount, before.terrain.sectorCount, `${label} changed terrain sector count`);
      assert.equal(during.terrain.waterVisible, before.terrain.waterVisible, `${label} changed waterMesh visibility`);
      if (mutate) assert.equal(during.terrain.visibleSectorCount, 0, `${label} did not hide every terrain sector`);
      else assert.equal(during.terrain.visibleSectorCount, before.terrain.visibleSectorCount, `${label} changed terrain visibility`);
      assert.deepEqual(after.targetVisible, before.targetVisible, `${label} did not restore terrain sector visibility`);
      assert.equal(after.terrain.visibleSectorCount, before.terrain.visibleSectorCount, `${label} did not restore terrain visible-sector count`);
    }
    if (groupName === 'foliageLite') {
      assert.equal(during.renderer.draws, before.renderer.draws, `${label} changed draw-call count`);
      assert.equal(during.renderer.tris, before.renderer.tris, `${label} changed triangle count`);
    }
    let cacheContentCheck = null;
    if (groupName === 'crumbCache' && mutate) {
      cacheContentCheck = await page.evaluate(() => {
        const g = window.__game(), targets = window.__coastABRestore.targets;
        const capture = () => targets.map(m => ({
          count: m.count,
          proxyCount: m.userData.proxy?.count ?? null,
          matrices: Array.from(m.instanceMatrix.array.subarray(0, m.count * 16)),
          seeds: Array.from(m.userData.cull.seed.array.subarray(0, m.count)),
        }));
        const cached = capture();
        for (const m of targets) m.userData.cull.packedRevision = -1;
        g.city.cullCrumbs(null); // the standard query here is SwiftShader, whose culling omits the shadow frustum
        const rebuilt = capture();
        const equal = cached.every((x, i) => x.count === rebuilt[i].count && x.proxyCount === rebuilt[i].proxyCount
          && x.matrices.length === rebuilt[i].matrices.length && x.matrices.every((v, j) => v === rebuilt[i].matrices[j])
          && x.seeds.length === rebuilt[i].seeds.length && x.seeds.every((v, j) => v === rebuilt[i].seeds[j]));
        return { equal, meshCount: cached.length, instanceCount: cached.reduce((n, m) => n + m.count, 0) };
      });
      assert.ok(cacheContentCheck.equal, `${label} cached matrices/seeds differ from forced full packing`);
    }
    const targets = await page.evaluate(() => window.__coastABRestore.targets.map(o => o.name || o.type));
    const targetEntities = ['trees', 'foliageLite'].includes(groupName) ? await page.evaluate(() => [...new Set(window.__coastABRestore.targets.flatMap(o => o.userData.list.filter(e => e.alive).map(e => e.name)))].sort()) : [];
    const crumbCpu = groupName === 'crumbCache' ? await page.evaluate(() => {
      const times = window.__coastABCrumbTimings.slice().sort((a, b) => a - b);
      const p = q => times[Math.min(times.length - 1, Math.floor(times.length * q))] ?? 0;
      return { n: times.length, p50: p(.5), p95: p(.95), total: times.reduce((a, b) => a + b, 0) };
    }) : null;
    const record = { label, renderer: actualRenderer, seconds, targetGroup: groupName, profileMode: groupName === 'foliageLite' ? 'foliageLite' : groupName === 'trees' ? 'hideTrees' : groupName === 'crumbCache' ? 'crumbCache' : groupName === 'terrain' ? 'terrainSectors' : 'groupVisibility', targets, targetCount: targets.length, targetEntities, crumbCpu, cacheContentCheck, materialCount: groupName === 'foliageLite' ? await page.evaluate(() => window.__coastABRestore.materials.length) : 0, mutated: mutate, settleMs: groupName === 'foliageLite' ? 3000 : 0, budgetWrapper: groupName === 'trees', budgetReapply: groupName === 'trees' && mutate, before, during, after, timing };
    writeFileSync(`${out}/${label}.json`, JSON.stringify(record, null, 2));
    const images = groupName === 'waterSdf' ? `${out}/${label}-t*.png` : `${out}/${label}.png`;
    console.log(`${label}: p50 ${timing.p50.toFixed(2)} ms, p95 ${timing.p95.toFixed(2)} ms, n=${timing.n}; ${out}/${label}.json, ${images}`);
  }
  if (groupName === 'crumbCache') {
    const cacheInvalidation = await page.evaluate(() => {
      const g = window.__game(), city = g.city, camera = g.camera, targets = window.__coastABRestore.targets;
      const capture = () => targets.map(m => ({
        count: m.count,
        proxyCount: m.userData.proxy?.count ?? null,
        matrices: Array.from(m.instanceMatrix.array.subarray(0, m.count * 16)),
        seeds: Array.from(m.userData.cull.seed.array.subarray(0, m.count)),
      }));
      const equal = (a, b) => a.every((x, i) => x.count === b[i].count && x.proxyCount === b[i].proxyCount
        && x.matrices.length === b[i].matrices.length && x.matrices.every((v, j) => v === b[i].matrices[j])
        && x.seeds.length === b[i].seeds.length && x.seeds.every((v, j) => v === b[i].seeds[j]));
      const originalPosition = camera.position.clone(), cellsBefore = city.crumbVisibleRevision;
      camera.position.x += 256;
      camera.updateMatrixWorld(true);
      city.cullTraffic(camera);
      const cellInvalidated = city.crumbVisibleRevision !== cellsBefore;
      const cameraCache = capture();
      for (const m of targets) m.userData.cull.packedRevision = -1;
      city.cullCrumbs(null);
      const cameraRebuildMatches = equal(cameraCache, capture());

      const m = targets.find(mesh => mesh.count > 0), e = m?.userData.list[m.userData.cull.seed.array[0]];
      if (!e) throw new Error('No visible crumb available for transform invalidation check.');
      const x = e.x, revisionBefore = m.userData.cull.revision;
      e.x += 0.25;
      city.place(e);
      const transformInvalidated = m.userData.cull.revision > revisionBefore;
      city.cullTraffic(camera);
      const movedCache = capture();
      for (const q of targets) q.userData.cull.packedRevision = -1;
      city.cullCrumbs(null);
      const transformRebuildMatches = equal(movedCache, capture());

      e.x = x;
      city.place(e);
      camera.position.copy(originalPosition);
      camera.updateMatrixWorld(true);
      city.cullTraffic(camera);
      return { cellInvalidated, cameraRebuildMatches, transformInvalidated, transformRebuildMatches };
    });
    assert.ok(cacheInvalidation.cellInvalidated, 'camera movement did not change the visible-cell cache key');
    assert.ok(cacheInvalidation.cameraRebuildMatches, 'moved-camera cached buffers differ from forced full packing');
    assert.ok(cacheInvalidation.transformInvalidated, 'crumb transform did not invalidate its packed buffer');
    assert.ok(cacheInvalidation.transformRebuildMatches, 'moved-crumb cached buffers differ from forced full packing');
    writeFileSync(`${out}/cache-invalidation.json`, JSON.stringify(cacheInvalidation, null, 2));
    console.log(`cache invalidation: ${JSON.stringify(cacheInvalidation)}`);
  }
} finally {
  if (setupSaved) await page.evaluate(() => {
    const saved = window.__coastABRestore;
    if (!saved) return;
    if (saved.targets) saved.targets.forEach((o, i) => { o.visible = saved.visible[i]; });
    if (saved.camera) saved.camera.lookAt = saved.cameraLookAt;
    if (saved.terrain) saved.terrain.updateWaterSdf = saved.updateWaterSdf;
    if (saved.materials) for (const material of saved.materials) {
      material.material.normalNode = material.normalNode;
      material.material.positionNode = material.positionNode;
      material.material.emissiveNode = material.emissiveNode;
      material.material.needsUpdate = true;
    }
    if (saved.cullCrumbs) window.__game().city.cullCrumbs = saved.cullCrumbs;
    if (saved.nf) {
      saved.nf.update = saved.update;
      saved.nf.time = saved.time;
      saved.nf.deltaTime = 0;
      saved.nf.lastTime = performance.now();
    }
    if (saved.budget) window.__game().city.budget = saved.budget;
    window.__coastABHideTrees = saved.hideTrees;
    const { state } = window.__game();
    state.draft = saved.draft;
    state.playing = saved.playing;
    state.draftsDue = saved.draftsDue;
    if (saved.nf) window.__pause = saved.pause;
    delete window.__coastABRestore;
    delete window.__coastABUseCache;
    delete window.__coastABCrumbTimings;
  }).catch(() => {});
  await browser.close();
}
