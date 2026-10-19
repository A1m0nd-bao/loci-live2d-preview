/** Original-100 legacy one-hot actions. Apply after SDK mixing, before Core update.
 * This is an exclusive CUT policy, NOT newly generated continuous animation.
 */
export const LEGACY_POLICY = 'exclusive-legacy-actions-v1';
export function legacyDefinitions(parameters) {
  const actions = parameters.filter(p => /^ParamAction_[1-9]\d*$/.test(p.id));
  const hide = parameters.find(p => p.id === 'ParamHideBaseArms');
  if (!actions.length || !hide) throw Error('缺少旧版动作开关或基础手臂显隐开关');
  const all = [hide, ...actions];
  if (all.some(p => p.min !== 0 || p.max !== 1 || p.defaultValue !== 0)) throw Error('不支持的旧版动作范围');
  return { actions: actions.map(p => p.id), hide: hide.id, ids: all.map(p => p.id) };
}

function points(curve, duration) {
  const s = curve.Segments;
  if (!Array.isArray(s) || s.length < 5 || (s.length - 2) % 3 || s[0] !== 0 || ![0, 1].includes(s[1])) throw Error('动作开关缺少二值起点');
  const result = [{ time: 0, value: s[1] }];
  for (let i = 2; i < s.length; i += 3) {
    if (s[i] !== 2 || !Number.isFinite(s[i+1]) || s[i+1] <= result.at(-1).time || s[i+1] > duration || ![0,1].includes(s[i+2])) throw Error('旧版动作开关只允许二值阶跃');
    result.push({ time: s[i+1], value: s[i+2] });
  }
  if (result.at(-1).time !== duration || result.at(-1).value !== 0) throw Error('动作结束必须回到基础姿态');
  return result;
}
const valueAt = (points, time) => { let value = points[0].value; for (const point of points) { if (point.time > time) break; value = point.value; } return value; };

export function compileLegacyClip(clip, definitions) {
  const duration = clip?.Meta?.Duration;
  if (!Number.isFinite(duration) || duration <= 0 || duration > 3600) throw Error('动作时长无效');
  const selected = clip.Curves.filter(c => c.Target === 'Parameter' && definitions.ids.includes(c.Id));
  if (selected.length !== definitions.ids.length || new Set(selected.map(c => c.Id)).size !== definitions.ids.length) throw Error('动作开关曲线不完整或重复');
  const tracks = new Map(selected.map(c => [c.Id, points(c, duration)]));
  const times = [...new Set([...tracks.values()].flatMap(p => p.map(x => x.time)))].sort((a,b) => a-b);
  const frames = times.map(time => {
    const values = Object.fromEntries([...tracks].map(([id,p]) => [id,valueAt(p,time)]));
    const sum = definitions.actions.reduce((n,id) => n+values[id],0);
    if (sum > 1 || values[definitions.hide] !== sum) throw Error('手势不互斥或基础手臂显隐不同步');
    return { time, values };
  });
  return { duration, frames };
}

export function createLegacyController(parameters) {
  const definitions = legacyDefinitions(parameters);
  const neutral = Object.fromEntries(definitions.ids.map(id => [id,0]));
  let active = null;
  return {
    definitions,
    compile: clip => compileLegacyClip(clip, definitions),
    reset() { active = null; },
    start(clip, now) { if (!clip || !Number.isFinite(now)) throw Error('动作控制器输入无效'); active = { clip, began: now }; },
    sample(now) {
      if (!active) return new Map(Object.entries(neutral));
      const elapsed = Math.max(0, (now - active.began) / 1000);
      if (elapsed >= active.clip.duration) { active = null; return new Map(Object.entries(neutral)); }
      let frame = active.clip.frames[0];
      for (const next of active.clip.frames) { if (next.time > elapsed) break; frame = next; }
      return new Map(Object.entries(frame.values));
    },
  };
}
