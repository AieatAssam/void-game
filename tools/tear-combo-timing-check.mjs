// Deterministic prototype check for tear acceptance vs setup completion.
// Start Vite first; browser module imports use the app's actual BiteMap and PlanetGame code.
import assert from 'node:assert/strict';
import { chromium, channel } from './browser.mjs';

const browser = await chromium.launch({ headless: true, channel, args: ['--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
page.setDefaultTimeout(180000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto(`http://127.0.0.1:${process.env.PORT || 5174}/?q=low&webgl&nothumbs&nowatch`);
  await page.waitForSelector('#menu:not([hidden])');
  const result = await page.evaluate(async () => {
    const [{ BiteMap }, { PlanetGame }] = await Promise.all([import('/src/bite.js'), import('/src/planetgame.js')]);
    const NORMAL = 32768, CONSTRAINED = 8192; // production TEAR_SETUP, and a 4x constrained budget
    const setupWork = (sizes = [65536, 131072]) => {
      const [firstSize, secondSize] = sizes, n = firstSize + secondSize, parcels = [new Int32Array(firstSize), new Int32Array(secondSize)];
      for (let i = 0; i < firstSize; i++) parcels[0][i] = i;
      for (let i = 0; i < secondSize; i++) parcels[1][i] = firstSize + i;
      const pDir = new Float32Array(n * 3), pu = [null, new Int32Array(n), new Int32Array(n), new Int32Array(n), new Int32Array(n)];
      for (let pk = 0; pk < n; pk++) {
        const u = pk < firstSize ? 0 : 1, a = (pk % 2048) / 2048 * Math.PI;
        pDir[pk * 3] = Math.sin(a); pDir[pk * 3 + 1] = Math.cos(a); pDir[pk * 3 + 2] = 0;
        for (let L = 1; L <= 4; L++) pu[L][pk] = u;
      }
      const lf = {
        lv: [
          { left: new Float64Array(n).fill(1) },
          { n: 2, area0: new Float64Array([1e6, 1e6]), left: new Float64Array([1e6, 1e6]), torn: new Uint8Array(2), nsum: new Float64Array(2) },
        ],
        pu, pDir,
        parcels: (_L, u) => parcels[u], name: (_L, u) => `fixture-${u}`,
        dirOf: () => ({ x: 0, y: 1, z: 0 }), rEq: () => 500,
      };
      const b = Object.create(BiteMap.prototype);
      Object.assign(b, { lf, jobs: [], events: [], ptear: new Uint8Array(6 * 256 * 256), pop: 0, popK: 0,
        setupAt: 0, stat: { tears: 0, pulls: 0, parcelTears: 0 } });
      return b;
    };
    const comboHarness = () => {
      const world = { bite: { events: [] }, distTo: () => 0, shock: () => {}, P: { elevation: () => 0 },
        renderPos: () => ({ x: 0, y: 0, z: 0 }), normalAt: () => ({ x: 0, y: 1, z: 0 }) };
      const state = { time: 0, shake: 0, hitstop: 0 };
      const ctx = { state, hole: { r: 1000 }, camera: { position: { length: () => 3000 } },
        sfx: { tear: () => {}, pebble: () => {} }, debris: { puff: () => {} }, news: { queue: [], say: () => {} }, card: () => {} };
      const game = Object.assign(Object.create(PlanetGame.prototype), { world, combo: 0, comboAt: -9, comboCard: 99, gainLabel: () => {} });
      return { game, ctx };
    };
    const run = (fps, baseBudget, requestedAcceptanceGap, reverse) => {
      const parcelsPerJob = reverse ? [131072, 65536] : [65536, 131072];
      const b = setupWork(parcelsPerJob), dt = 1 / fps, accepted = [], starts = [], { game, ctx } = comboHarness();
      let acceptedSecond = false;
      const dispatch = time => {
        while (b.events.length) {
          const event = b.events.shift(); event.time = time;
          if (event.type === 'accepted') accepted.push({ unit: event.u, time });
          else if (event.type === 'start') {
            starts.push({ unit: event.u, time }); ctx.state.time = time; game.swallow(event, ctx);
            starts.at(-1).combo = game.combo;
          }
        }
      };
      const setupFrame = () => {
        const scale = Math.max(1, Math.min(3, dt * 60));
        let budget = baseBudget * scale, misses = 0;
        while (budget > 0 && misses < b.jobs.length) {
          if (b.setupAt >= b.jobs.length) b.setupAt = 0;
          const job = b.jobs[b.setupAt++];
          if (!job.setup) { misses++; continue; }
          misses = 0;
          budget -= b.setupTear(job, Math.min(512, budget));
          if (job.empty) b.jobs.splice(b.jobs.indexOf(job), 1);
        }
        const count = b.jobs.length, first = count ? b.setupAt % count : 0;
        b.setupAt = (first + 1) % Math.max(1, b.jobs.length);
      };
      for (let frame = 0; frame < fps * 20 && starts.length < 2; frame++) {
        const time = frame * dt;
        if (!accepted.length) { b.startTear(1, 0, { x: 0, y: 1, z: 0 }, 'tear'); dispatch(time); }
        if (!acceptedSecond && time + 1e-9 >= requestedAcceptanceGap) {
          acceptedSecond = true; b.startTear(1, 1, { x: 0, y: 1, z: 0 }, 'tear'); dispatch(time);
        }
        setupFrame(); dispatch(time);
      }
      if (starts.length !== 2 || accepted.map(e => e.unit).join() !== '0,1' || new Set(starts.map(e => e.unit)).size !== 2 || starts[0].time > starts[1].time)
        throw new Error(`bad accept/start order: ${fps}Hz budget ${baseBudget} gap ${requestedAcceptanceGap}: ${JSON.stringify({ accepted, starts })}`);
      const actualStartGap = starts[1].time - starts[0].time, expectedCombo = actualStartGap < 2.5 ? 1 : 0;
      if (starts[1].combo !== expectedCombo) throw new Error(`combo disagrees with start gap ${actualStartGap}`);
      const acceptedGap = accepted[1].time - accepted[0].time;
      return { fps, budget: baseBudget === NORMAL ? 'normal' : 'constrained', parcelsPerJob, accepted, starts,
        requestedAcceptanceGap, acceptedGap, actualStartGap, comboAfterSecond: starts[1].combo,
        differsFromAcceptanceGapRule: starts[1].combo !== (acceptedGap < 2.5 ? 1 : 0) };
    };

    const rows = [];
    for (const budget of [NORMAL, CONSTRAINED]) for (const fps of [15, 30, 60]) for (const gap of [2.4, 2.6]) for (const reverse of [false, true]) rows.push(run(fps, budget, gap, reverse));

    const noParcels = setupWork([0, 0]), noParcelsGame = comboHarness();
    const noParcelJob = noParcels.startTear(1, 0, { x: 0, y: 1, z: 0 }, 'tear');
    while (noParcels.events.length) { noParcelsGame.ctx.state.time = 0.2; noParcelsGame.game.swallow(noParcels.events.shift(), noParcelsGame.ctx); }
    const zeroParcelJob = { returnedNull: noParcelJob === null, events: noParcels.events.length, jobs: noParcels.jobs.length,
      combo: noParcelsGame.game.combo, markedTorn: noParcels.lf.lv[1].torn[0] };
    if (!zeroParcelJob.returnedNull || zeroParcelJob.events || zeroParcelJob.jobs || zeroParcelJob.combo || !zeroParcelJob.markedTorn)
      throw new Error(`no-parcel job accepted a start/combo: ${JSON.stringify(zeroParcelJob)}`);

    const depleted = setupWork([64, 0]), depletedGame = comboHarness();
    depleted.lf.lv[0].left.fill(0);
    const depletedJob = depleted.startTear(1, 0, { x: 0, y: 1, z: 0 }, 'tear');
    const dispatched = [];
    while (depleted.events.length) {
      const event = depleted.events.shift(); dispatched.push(event.type);
      depletedGame.ctx.state.time = 0.2; depletedGame.game.swallow(event, depletedGame.ctx);
    }
    const dt = 1 / 60, scale = Math.max(1, Math.min(3, dt * 60));
    let setupBudget = NORMAL * scale, misses = 0;
    while (setupBudget > 0 && misses < depleted.jobs.length) {
      if (depleted.setupAt >= depleted.jobs.length) depleted.setupAt = 0;
      const job = depleted.jobs[depleted.setupAt++];
      if (!job.setup) { misses++; continue; }
      misses = 0;
      setupBudget -= depleted.setupTear(job, Math.min(512, setupBudget));
      if (job.empty) depleted.jobs.splice(depleted.jobs.indexOf(job), 1);
    }
    const depletedParcelJob = { returnedJob: !!depletedJob, parcelCount: depletedJob?.ps.length,
      exhaustedLevel0: depleted.lf.lv[0].left.every(value => value <= 1e-6), dispatched,
      jobRemoved: depleted.jobs.length === 0, combo: depletedGame.game.combo };
    if (!depletedParcelJob.returnedJob || !depletedParcelJob.exhaustedLevel0 || !depletedParcelJob.jobRemoved ||
        depletedParcelJob.dispatched.join() !== 'accepted' || depletedParcelJob.combo)
      throw new Error(`depleted-parcel job started or earned combo: ${JSON.stringify(depletedParcelJob)}`);
    return { rows, zeroParcelJob, depletedParcelJob };
  });
  assert.equal(result.rows.length, 24);
  assert.deepEqual(result.zeroParcelJob, { returnedNull: true, events: 0, jobs: 0, combo: 0, markedTorn: 1 });
  assert.deepEqual(result.depletedParcelJob, { returnedJob: true, parcelCount: 64, exhaustedLevel0: true,
    dispatched: ['accepted'], jobRemoved: true, combo: 0 });
  assert.deepEqual(errors, [], `browser errors: ${errors.join('; ')}`);
  console.log(JSON.stringify({ ...result, errors }));
} finally { await browser.close(); }
