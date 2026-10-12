import { ModelPlayer } from './player.js';
const player = new ModelPlayer(document.getElementById('canvas'), document.getElementById('host'));
window.captureModel = async item => {
  try {
    const manifest = await player.load(item); if (!manifest) throw Error('模型加载被中断');
    player.pause(true);
    const groups = Object.keys(manifest.FileReferences.Motions || {}).filter(g => manifest.FileReferences.Motions[g].length);
    const group = groups.includes(item.defaultGroup) ? item.defaultGroup : groups.includes('Action') ? 'Action' : groups.includes('Idle') ? 'Idle' : groups[0];
    if (group) {
      const list=manifest.FileReferences.Motions[group];const named=list.findIndex(x=>x.File===item.defaultMotion||x.Name===item.defaultMotion);
      await player.play(group,named>=0?named:Math.min(Math.max(0,Number(item.defaultMotion)||0),list.length-1));
    }
    for (let i = 0; i < 30; i++) { player.model.update(1000 / 30);player.render(); }
    return player.poster();
  } finally { player.release(); }
};
