import test from 'node:test';
import assert from 'node:assert/strict';
import { ModelPlayer } from '../player.js';
import { createLegacyController } from '../legacy-selector.js';

globalThis.PIXI = { live2d: { MotionPriority: { FORCE: 3 }, Live2DFactory: { motionTasksMap: new WeakMap() } } };

function fixture() {
  const motion = { setIsLoop(value) { assert.equal(value, false); } };
  const manager = {
    motionGroups: { Idle: [], Action: [] }, current: null, starts: [], playing: true,
    async loadMotion() { return motion; },
    stopAllMotions() { this.current = null; },
  };
  const model = {
    internalModel: { motionManager: manager, coreModel: {
      values: [0.7, 1], defaults: [0, 1], saved: [],
      getParameterCount() { return this.values.length; },
      getParameterDefaultValue(index) { return this.defaults[index]; },
      setParameterValueByIndex(index, value) { this.values[index] = value; },
      saveParameters() { this.saved = [...this.values]; },
    } },
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

test('switching to a sparse motion clears and saves the interrupted pose', async () => {
  const { player } = fixture(), core = player.model.internalModel.coreModel;
  assert.equal(await player.play('Idle'), true);
  assert.deepEqual(core.values, core.defaults);
  assert.deepEqual(core.saved, core.defaults);
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

function legacyFixture() {
  const f = fixture(), p=['ParamHideBaseArms','ParamAction_1'];
  f.player.legacy=createLegacyController(p.map(id=>({id,min:0,max:1,defaultValue:0})));
  f.player.legacyIndices=new Map(p.map((id,i)=>[id,i])); f.player.selectorClock=0;
  const clip={Meta:{Duration:2.1},Curves:p.map(Id=>({Target:'Parameter',Id,Segments:[0,0,2,.28,1,2,1.92,0,2,2.1,0]}))};
  f.compiled=f.player.legacy.compile(clip); f.player.readSelectorClip=async()=>f.compiled;
  return f;
}
test('opt-in policy is applied after simulated competing SDK fades',async()=>{
  const {player}=legacyFixture(); await player.play('Action'); player.selectorClock=500;
  const core=player.model.internalModel.coreModel; core.values=[.37,.37]; player.applyLegacy();
  assert.deepEqual(core.values,[1,1]); player.selectorClock=2000;player.applyLegacy();assert.deepEqual(core.values,[0,0]);
});
test('late selector data cannot replace a newer selection',async()=>{
  const {player,compiled}=legacyFixture();let resolve;
  player.readSelectorClip=file=>file.startsWith('idle')?new Promise(r=>resolve=r):Promise.resolve(compiled);
  const pending=player.play('Idle');assert.equal(await player.play('Action'),true);player.selectorClock=500;
  resolve(compiled);assert.equal(await pending,false);player.applyLegacy();assert.deepEqual(player.model.internalModel.coreModel.values,[1,1]);
});
test('invalid selector data does not interrupt the current motion',async()=>{
  const {player,manager}=legacyFixture();manager.current='Action:0';
  player.readSelectorClip=async()=>{throw Error('bad policy');};
  await assert.rejects(player.play('Idle'),/bad policy/);assert.equal(manager.current,'Action:0');
});
test('selector timeline uses the same capped scaled clock as model playback and freezes while paused or hidden',()=>{
  const {player}=legacyFixture();globalThis.document={hidden:false};
  const steps=[];player.model.update=dt=>steps.push(dt);player.paused=false;player.speed=2;
  player.advance(20);assert.equal(player.selectorClock,40);assert.deepEqual(steps,[40]);
  player.paused=true;player.advance(20);assert.equal(player.selectorClock,40);
  player.paused=false;document.hidden=true;player.advance(20);assert.equal(player.selectorClock,40);
  document.hidden=false;player.advance(1000);assert.equal(player.selectorClock,200);assert.deepEqual(steps,[40,160]);
  delete globalThis.document;
});
