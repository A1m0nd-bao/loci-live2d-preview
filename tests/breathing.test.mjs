import test from 'node:test';
import assert from 'node:assert/strict';
import '../breathing.js';

function fixture(ids = ['ParamBreath', 'ParamBodyAngleY', 'ParamAngleY']) {
  const values = [0, 0, 0], minimumValues = [0, -10, -30], maximumValues = [1, 10, 30];
  const core = {
    getModel: () => ({ parameters: { ids, minimumValues, maximumValues } }),
    getParameterValueByIndex: i => values[i],
    setParameterValueByIndex(i, value) { values[i] = value; },
  };
  let stockCalls = 0;
  const internalModel = { coreModel: core, updateNaturalMovements() { ++stockCalls; if (ids.length) values[0] += .25; } };
  const model = { internalModel };
  Live2DBreathing.install(model);
  function frame(base = [0, 0, 0], dt = 100) {
    values.splice(0, 3, ...base);
    internalModel.updateNaturalMovements(dt, 0);
    return [...values];
  }
  return { model, frame, calls: () => stockCalls };
}

test('breathing spans nearly the full rig range without accumulating over cycles', () => {
  const { frame } = fixture();
  let min = 1, max = 0;
  for (let i = 0; i < 420; ++i) {
    const [breath, body, head] = frame();
    min = Math.min(min, breath); max = Math.max(max, breath);
    assert.ok(breath >= 0 && breath <= 1);
    assert.ok(Math.abs(body) <= 1.101 && Math.abs(head) <= .721);
  }
  assert.ok(max > .95 && min < .001);
});

test('authored breathing and body curves still influence the final pose', () => {
  const a = fixture(), b = fixture();
  for (let i = 0; i < 10; ++i) { a.frame(); b.frame(); }
  const low = a.frame([.1, -4, 8]), high = b.frame([.7, 5, -8]);
  assert.ok(high[0] > low[0]);
  assert.ok(Math.abs(high[1] - low[1] - 9) < 1e-9);
  assert.ok(Math.abs(high[2] - low[2] + 16) < 1e-9);
});

test('missing parameters do not create synthetic IDs; installation is idempotent', () => {
  const { model, frame, calls } = fixture([]);
  Live2DBreathing.install(model);
  assert.deepEqual(frame([.2, .3, .4]), [.2, .3, .4]);
  assert.equal(calls(), 1);
});

test('breathing clamps extreme motion values and a zero timestep holds its phase', () => {
  const { frame } = fixture();
  assert.deepEqual(frame([0, 0, 0], 0), frame([0, 0, 0], 0));
  for (let i = 0; i < 21; ++i) frame();
  assert.deepEqual(frame([2, 20, -50], 0), [1, 10, -30]);
});
