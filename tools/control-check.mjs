import assert from 'node:assert/strict';
import { P2, steerAxis, steerAssist } from '../src/phase2.js';
import { P3, growthK } from '../src/phase3.js';

assert.equal(P2.turn, 0.06);
for (const r of [40e3, 150e3, 450e3, 1200e3, 2400e3]) {
  assert.equal(P3.turn(r), 0.06);
  assert.equal(P3.speed(r) / r, 1.15);
}
assert.equal(steerAxis(0.8, 0, 1 / 60), 0, 'neutral input stops immediately');
assert.ok(steerAxis(1, -1, 0.06) < 0, 'reversal changes direction within one turn interval');
for (const v of [[1, 0], [-1, 0]]) {
  const bent = steerAssist(v[0], v[1], -v[0], -v[1], 0.35);
  assert.ok(bent[0] * v[0] + bent[1] * v[1] > 0, 'assist cannot reverse requested direction');
  assert.ok(Math.abs(Math.hypot(...bent) - 1) < 1e-12, 'assist preserves requested speed');
}
assert.equal(growthK({}), 1);
assert.equal(growthK({ stun: 1 }), 0.7);
assert.equal(growthK({ wound: 1 }), 0.85);
assert.equal(growthK({ stun: 1, wound: 1, ash: true, slow: 1 }), 0.6);

console.log('control and growth checks passed');
