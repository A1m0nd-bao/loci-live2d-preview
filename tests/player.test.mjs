import test from 'node:test';
import assert from 'node:assert/strict';
import { ModelPlayer } from '../player.js';

globalThis.PIXI = { live2d: { MotionPriority: { FORCE: 3 }, Live2DFactory: { motionTasksMap: new WeakMap() } } };

function fixture() {
  const motion = { setIsLoop(value) { assert.equal(value, false); } };
  const manager = {
    motionGroups: { Idle: [], Action: [] }, current: null, starts: [], playing: true,
    async loadMotion() { return motion; },
    stopAllMotions() { this.current = null; },
  };
  const model = {
    internalModel: { motionManager: manager },
    async motion(group, index, priority) {
      assert.equal(priority, 3);
      if (manager.current === `${group}:${index}`) return false;
      assert.equal(manager.playing, false);
      manager.current = `${group}:${index}`; manager.playing = true;
      manager.starts.push(manager.current); return true;
    },
  };
  const player = Object.assign(Object.create(ModelPlayer.prototype), {
    model, motionGeneration: 0,
    manifest: { FileReferences: { Motions: { Idle: [{ File: 'idle.motion3.json' }], Action: [{ File: 'action.motion3.json' }] } } },
  });
  return { player, manager, motion };
}

test('replay resets the already-current motion even with FORCE priority', async () => {
  const { player, manager } = fixture(); manager.current = 'Idle:0';
  assert.equal(await player.play('Idle'), true);
  assert.equal(await player.play('Idle'), true);
  assert.deepEqual(manager.starts, ['Idle:0', 'Idle:0']);
});

test('a slow earlier motion cannot replace a newer selection', async () => {
  const { player, manager, motion } = fixture(); let finish;
  manager.loadMotion = group => group === 'Idle' ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(motion);
  const earlier = player.play('Idle');
  assert.equal(await player.play('Action'), true);
  finish(motion); assert.equal(await earlier, false);
  assert.deepEqual(manager.starts, ['Action:0']);
});

test('duplicate pending requests start only the newest request', async () => {
  const { player, manager, motion } = fixture(); const finishes = [];
  manager.loadMotion = () => new Promise(resolve => finishes.push(resolve));
  const first = player.play('Idle'), second = player.play('Idle');
  finishes[0](motion); assert.equal(await first, false);
  finishes[1](motion); assert.equal(await second, true);
  assert.deepEqual(manager.starts, ['Idle:0']);
});

test('a failed cached download can be retried without reloading the model', async () => {
  const { player, manager, motion } = fixture(); manager.motionGroups.Idle[0] = null;
  const tasks = { Idle: [Promise.resolve(undefined)] };
  PIXI.live2d.Live2DFactory.motionTasksMap.set(manager, tasks);
  manager.loadMotion = async () => { assert.equal(manager.motionGroups.Idle[0], undefined); assert.equal(tasks.Idle[0], undefined); return motion; };
  assert.equal(await player.play('Idle'), true);
});

test('a missing motion reports its filename and does not stop the active motion', async () => {
  const { player, manager } = fixture(); manager.current = 'Action:0';
  manager.loadMotion = async () => undefined;
  await assert.rejects(player.play('Idle'), /idle\.motion3\.json/);
  assert.equal(manager.current, 'Action:0');
});

test('a replaced model ignores a late download', async () => {
  const { player, manager, motion } = fixture(); let finish;
  manager.loadMotion = () => new Promise(resolve => { finish = resolve; });
  const pending = player.play('Idle'); player.model = null; ++player.motionGeneration;
  finish(motion); assert.equal(await pending, false); assert.deepEqual(manager.starts, []);
});
