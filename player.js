import { resourcePath, references } from './model-files.js';
import { AtmosphereStage, locateFace } from './atmosphere.js?v=20261019';

// Fit the actual render surface inside its available area without stretching.
export function stageViewportSize(width, height, orientation = 'portrait') {
  if (!(width > 0 && height > 0)) return null;
  const ratio = orientation === 'landscape' ? 16 / 9 : 9 / 16;
  const fittedWidth = Math.min(width, height * ratio);
  return { width: fittedWidth, height: fittedWidth / ratio };
}

export class ModelPlayer {
  constructor(canvas, host, { layerInspector, onFinish, onError, atmosphere = false, onLighting } = {}) {
    if (!window.PIXI?.live2d || !window.Live2DCubismCore) throw Error('Live2D 运行库加载失败。');
    PIXI.live2d.config.sound = false;
    this.canvas = canvas; this.host = host; this.layerInspector = layerInspector;
    this.onFinish = onFinish; this.onError = onError;
    this.app = new PIXI.Application({ view: canvas, backgroundAlpha: 0, antialias: true, resolution: Math.min(devicePixelRatio, 2), autoDensity: true, autoStart: false, preserveDrawingBuffer: true });
    this.app.stop(); this.app.ticker.maxFPS = 30;
    if(atmosphere) {
      this.atmosphere=new AtmosphereStage(this.app,{lighting:onLighting});
      this.app.ticker.remove(this.app.render,this.app);
      this.app.render=()=>this.checker?this.app.renderer.render(this.app.stage):this.atmosphere.render();
      this.app.ticker.add(this.app.render,this.app,PIXI.UPDATE_PRIORITY.LOW);
    }
    this.focusSize=1;
    this.speed = 1; this.zoom = 1; this.paused = true; this.interaction = true; this.generation = 0; this.motionGeneration = 0;
    this.app.ticker.add(() => {
      if(document.hidden)return;
      if(this.atmosphere) {this.atmosphere.update(Math.min(this.app.ticker.deltaMS,80)/1000);this.fit();}
      if (!this.model || this.paused) return;
      try { this.model.update(Math.min(this.app.ticker.deltaMS, 80) * this.speed); }
      catch (e) { this.pause(true); this.onError?.(e); }
    });
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(host);
    this.visibility = () => { if (document.hidden) this.app.stop(); else if ((!this.paused||this.atmosphere) && this.model) this.app.start(); };
    document.addEventListener('visibilitychange', this.visibility);
    this.pointer = e => { if (this.model && this.interaction) { const r=this.canvas.getBoundingClientRect(); this.model.focus((e.clientX-r.left)*this.app.screen.width/r.width,(e.clientY-r.top)*this.app.screen.height/r.height);
      if(this.atmosphere)this.atmosphere.gaze=[(e.clientX-r.left)/r.width*2-1,(e.clientY-r.top)/r.height*2-1]; } };
    this.pointerLeave = () => { if(this.atmosphere)this.atmosphere.gaze=[0,0]; if (this.model) this.model.internalModel.focusController.focus(0,0); };
    host.addEventListener('pointermove', this.pointer); host.addEventListener('pointerleave', this.pointerLeave);
  }

  setHost(host) {
    this.host.removeEventListener('pointermove', this.pointer); this.host.removeEventListener('pointerleave', this.pointerLeave);
    this.resizeObserver.disconnect(); this.host = host;
    host.append(this.canvas); this.resizeObserver.observe(host);
    host.addEventListener('pointermove', this.pointer); host.addEventListener('pointerleave', this.pointerLeave); this.resize();
  }

  async load(item) {
    this.release(); const ticket = this.generation;
    const blobURLs = []; let candidate;
    try {
      const manifest = item.localFiles ? JSON.parse(await item.localFiles.get(item.modelPath).text()) : await fetchJSON(item.modelUrl);
      if (ticket !== this.generation) return null;
      const base = item.localFiles ? item.modelPath : item.modelUrl;
      const settings = new PIXI.live2d.Cubism4ModelSettings({ ...manifest, url: base });
      const urls = new Map();
      for (const relative of references(manifest)) {
        const encodedReference=relative.replaceAll('\\','/').split('/').map(p=>p==='.'||p==='..'?p:encodeURIComponent(p)).join('/');
        const resolved = item.localFiles ? resourcePath(base, relative) : new URL(encodedReference, new URL(base, location.href)).href;
        if (item.localFiles) {
          const file = item.localFiles.get(resolved); if (!file) throw Error(`缺少文件：${resolved}`);
          const url = URL.createObjectURL(file); blobURLs.push(url); urls.set(relative, url);
        } else {
          if (new URL(resolved).origin !== location.origin) throw Error('模型资源必须位于本站目录内。');
          urls.set(relative, resolved);
        }
      }
      settings.resolveURL = ref => { if (!urls.has(ref)) throw Error(`资源未注册：${ref}`); return urls.get(ref); };
      const moc = item.localFiles ? await item.localFiles.get(resourcePath(base, manifest.FileReferences.Moc)).arrayBuffer() : await fetchBuffer(urls.get(manifest.FileReferences.Moc));
      const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', moc)), x => x.toString(16).padStart(2, '0')).join('');
      if (ticket !== this.generation) { blobURLs.forEach(URL.revokeObjectURL); return null; }
      await new Promise((resolve, reject) => { candidate = PIXI.live2d.Live2DModel.fromSync(settings, { autoUpdate: false, autoInteract: false, motionPreload: 'NONE', idleMotionGroup: '__none__', onLoad: resolve, onError: reject }); });
      if (ticket !== this.generation) { candidate.destroy({ texture: true, baseTexture: true }); blobURLs.forEach(URL.revokeObjectURL); return null; }
      this.model = candidate; this.manifest = manifest; this.urls = blobURLs; this.resources = urls;
      this.app.stage.addChild(candidate); this.physics = candidate.internalModel.physics;
      this.bounds = measure(candidate); this.face = this.atmosphere ? locateFace(candidate,this.bounds) : null; this.zoom = 1; this.resize();
      this.layerInspector?.attach(candidate, fingerprint, manifest, ref => urls.get(ref));
      candidate.internalModel.motionManager.on('motionFinish', () => this.onFinish?.());
      this.pause(false); this.render();
      return manifest;
    } catch (error) {
      if (candidate && candidate !== this.model) { try { candidate.destroy({ texture: true, baseTexture: true }); } catch {} }
      blobURLs.forEach(URL.revokeObjectURL);
      if (ticket === this.generation) { this.release(); throw error; }
      return null;
    }
  }

  async play(group, index = 0) {
    if (!this.model || !this.manifest.FileReferences.Motions?.[group]?.[index]) return false;
    const model = this.model, manager = model.internalModel.motionManager, ticket = ++this.motionGeneration;
    const current = () => model === this.model && ticket === this.motionGeneration;
    // Clear both failure caches in the bundled runtime before an explicit retry.
    if (manager.motionGroups[group][index] === null) {
      delete manager.motionGroups[group][index];
      const tasks = PIXI.live2d.Live2DFactory.motionTasksMap.get(manager)?.[group];
      if (tasks) delete tasks[index];
    }
    const motion = await manager.loadMotion(group,index);
    if (!current()) return false;
    if (!motion) throw Error(`动作加载失败：${this.manifest.FileReferences.Motions[group][index].File}`);
    motion.setIsLoop(false);
    // FORCE still rejects an already-current motion unless its reservation is reset.
    manager.stopAllMotions(); manager.playing = false;
    // Some clips animate only a subset of parameters, so an interrupted pose must not leak into the next clip.
    const core = model.internalModel.coreModel;
    for (let i = 0; i < core.getParameterCount(); i++) core.setParameterValueByIndex(i, core.getParameterDefaultValue(i));
    core.saveParameters();
    const started = await model.motion(group, index, PIXI.live2d.MotionPriority.FORCE);
    if (!current()) return false;
    if (!started) throw Error('动作无法播放，请检查动作文件。');
    return true;
  }

  pause(value) { this.paused = value; if ((value&&!this.atmosphere) || document.hidden || !this.model) this.app.stop(); else this.app.start(); this.render(); }
  setPhysics(enabled) { if (this.model) this.model.internalModel.physics = enabled ? this.physics : undefined; }
  resize() { const w = this.host.clientWidth, h = this.host.clientHeight; if (w > 0 && h > 0) this.app.renderer.resize(w, h); this.fit(); this.render(); }
  fit() {
    if (!this.model || !this.bounds) return;
    const { width: w, height: h } = this.app.screen, b = this.bounds;
    const full = Math.min(w * .86 / b.width, h * .87 / b.height), f=this.atmosphere?.progress||0;
    const centerX=b.left+b.width/2,centerY=b.top+b.height/2;
    let close=full,x=centerX,y=centerY;
    if(this.face) {
      const face=this.face,rx=Math.max(face.x-face.head.left,face.head.right-face.x,1),ry=Math.max(face.y-face.head.top,face.head.bottom-face.y,1);
      close=Math.min(w*.28/rx,h*.225/ry)*this.focusSize;x=face.x;y=face.y;
    }
    const scale=(full+(close-full)*f)*this.zoom;
    this.model.scale.set(scale);
    this.model.position.set((w/2-centerX*full*this.zoom)*(1-f)+(w/2-x*close*this.zoom)*f,
      (h/2-centerY*full*this.zoom)*(1-f)+(h*.46-y*close*this.zoom)*f);
  }
  setFocus(enabled) { if(this.atmosphere)this.atmosphere.focusTarget=enabled?1:0; }

  render() { if (this.model) this.app.render(); }
  poster() { this.render(); return this.canvas.toDataURL('image/png'); }
  release() {
    ++this.generation; ++this.motionGeneration; if(this.atmosphere)++this.atmosphere.backgroundTicket; this.app.stop(); this.paused = true; this.layerInspector?.detach();
    if (this.model) { this.app.stage.removeChild(this.model); this.model.destroy({ children: true, texture: true, baseTexture: true }); }
    this.model = null; this.bounds = null; this.face = null; this.manifest = null; this.physics = null;
    (this.urls || []).forEach(URL.revokeObjectURL); this.urls = []; this.app.renderer.clear();
  }
  destroy() { this.release(); this.resizeObserver.disconnect(); document.removeEventListener('visibilitychange', this.visibility); this.host.removeEventListener('pointermove', this.pointer); this.host.removeEventListener('pointerleave', this.pointerLeave); this.atmosphere?.destroy(); this.app.destroy(false, { children: true }); }
}

function measure(model) {
  const internal = model.internalModel, core = internal.coreModel;
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (let i = 0; i < core.getDrawableCount(); i++) {
    if (core.getDrawableOpacity(i) <= 0) continue;
    const v = internal.getDrawableVertices(i);
    for (let j = 0; j < v.length; j += 2) {
      const p = internal.localTransform.apply(new PIXI.Point(v[j], v[j + 1]));
      left = Math.min(left, p.x); right = Math.max(right, p.x); top = Math.min(top, p.y); bottom = Math.max(bottom, p.y);
    }
  }
  return right > left && bottom > top ? { left, top, width: right - left, height: bottom - top } : { left: 0, top: 0, width: internal.width, height: internal.height };
}
async function fetchJSON(url) { const response = await fetch(url); if (!response.ok) throw Error(`模型文件读取失败（${response.status}）。`); return response.json(); }
async function fetchBuffer(url) { const response = await fetch(url); if (!response.ok) throw Error(`模型资源读取失败（${response.status}）。`); return response.arrayBuffer(); }
