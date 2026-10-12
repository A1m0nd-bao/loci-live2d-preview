/* Render-order overrides are local to this player; never mutate Core arrays. */
'use strict';
class LayerInspector {
  constructor(redraw) {
    this.redraw = redraw;
    this.list = document.getElementById('layers');
    this.status = document.getElementById('layerStatus');
    this.error = document.getElementById('layerError');
    this.rows = new Map();
    document.getElementById('layerReset').onclick = () => { this.manual = null; this.error.textContent = ''; this.refresh(true); this.redraw(); };
    document.getElementById('layerExport').onclick = () => this.export();
    document.getElementById('layerImportButton').onclick = () => document.getElementById('layerImport').click();
    document.getElementById('layerImport').onchange = async event => {
      const file = event.target.files[0], model = this.model;
      event.target.value = '';
      if (!file || !model) return;
      try {
        const data = JSON.parse(await file.text());
        if (model !== this.model) return;
        this.applyConfig(data);
        this.error.textContent = '';
      } catch (error) { if (model === this.model) this.error.textContent = error.message; }
    };
    this.list.addEventListener('click', event => {
      const button = event.target.closest('button[data-move]');
      if (!button || !this.model) return;
      const order = this.order(), from = order.indexOf(Number(button.closest('li').dataset.index));
      const to = {up: from - 1, down: from + 1, first: 0, last: order.length - 1}[button.dataset.move];
      this.move(from, to);
    });
    this.list.addEventListener('dragstart', event => {
      const row = event.target.closest('li');
      if (!row) return;
      this.dragged = Number(row.dataset.index);
      event.dataTransfer.setData('text/plain', String(this.dragged));
      event.dataTransfer.effectAllowed = 'move';
    });
    this.list.addEventListener('dragover', event => { if (this.dragged != null) event.preventDefault(); });
    this.list.addEventListener('drop', event => {
      const row = event.target.closest('li');
      if (!row || this.dragged == null) return;
      event.preventDefault();
      const order = this.order();
      this.move(order.indexOf(this.dragged), order.indexOf(Number(row.dataset.index)));
      this.dragged = null;
    });
    this.list.addEventListener('dragend', () => { this.dragged = null; });
    this.detach();
  }
  detach() {
    if (this.model) {
      this.core.getDrawableRenderOrders = this.originalOrders;
      this.model.internalModel.draw = this.originalDraw;
    }
    this.model = null; this.core = null; this.manual = null; this.dragged = null;
    this.rows.clear(); this.list.replaceChildren(); this.error.textContent = '';
    this.status.textContent = '载入模型后显示实际渲染顺序';
    for (const id of ['layerReset','layerExport','layerImportButton']) document.getElementById(id).disabled = true;
  }
  attach(model, fingerprint, manifest, resolveURL) {
    this.detach();
    this.model = model; this.core = model.internalModel.coreModel; this.fingerprint = fingerprint;
    this.ids = this.core.getDrawableIds();
    this.originalOrders = this.core.getDrawableRenderOrders;
    this.originalDraw = model.internalModel.draw;
    this.lastRefresh = 0; this.lastOrder = '';
    const self = this;
    this.core.getDrawableRenderOrders = function () {
      return self.manual ? self.overrideOrders : self.originalOrders.call(this);
    };
    model.internalModel.draw = function (...args) {
      const result = self.originalDraw.apply(this, args);
      self.refresh();
      return result;
    };
    this.ids.forEach((id, index) => {
      const row = document.createElement('li'); row.dataset.index = index; row.draggable = true;
      const preview = document.createElement('img');
      const texture = this.core.getDrawableTextureIndices(index);
      preview.src = resolveURL(manifest.FileReferences.Textures[texture]);
      preview.alt = `纹理 ${texture}（可能由多个网格共用）`; preview.draggable = false;
      const info = document.createElement('div'); info.className = 'layer-info';
      const title = document.createElement('strong'); title.textContent = id;
      const stats = document.createElement('small');
      info.append(title, stats);
      const controls = document.createElement('div'); controls.className = 'layer-controls';
      for (const [action, text, label] of [['first','⇈','置顶'],['up','↑','上移'],['down','↓','下移'],['last','⇊','置底']]) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = text;
        button.dataset.move = action; button.title = label; button.setAttribute('aria-label', `${id} ${label}`);
        controls.append(button);
      }
      row.append(preview, info, controls); this.rows.set(index, {row, stats, controls, texture});
      this.list.append(row);
    });
    for (const id of ['layerReset','layerExport','layerImportButton']) document.getElementById(id).disabled = false;
    this.refresh(true);
  }
  order() {
    if (this.manual) return [...this.manual];
    const orders = this.originalOrders.call(this.core);
    return this.ids.map((_,i) => i).sort((a,b) => orders[b] - orders[a] || a-b);
  }
  move(from, to) {
    if (!this.model) return;
    const order = this.order();
    if (from < 0 || to < 0 || to >= order.length || from === to) return;
    order.splice(to, 0, order.splice(from, 1)[0]);
    this.setOrder(order);
  }
  setOrder(order) {
    this.error.textContent = '';
    this.manual = order;
    this.overrideOrders = new Int32Array(order.length);
    order.forEach((index, rank) => { this.overrideOrders[index] = order.length - 1 - rank; });
    this.refresh(true); this.redraw();
  }
  refresh(force = false) {
    if (!this.model || (!force && performance.now() - this.lastRefresh < 160)) return;
    this.lastRefresh = performance.now();
    const order = this.order(), signature = order.join(',');
    const focused = document.activeElement;
    if (signature !== this.lastOrder) {
      order.forEach(index => this.list.append(this.rows.get(index).row));
      this.lastOrder = signature;
      if (focused && this.list.contains(focused)) focused.focus({preventScroll:true});
    }
    const nativeOrders = this.originalOrders.call(this.core);
    const drawOrders = this.core._model.drawables.drawOrders;
    order.forEach((index, rank) => {
      const {row, stats, controls, texture} = this.rows.get(index);
      const opacity = this.core.getDrawableOpacity(index);
      const visible = this.core.getDrawableDynamicFlagIsVisible(index) && opacity > 0;
      stats.textContent = `前→后 ${rank+1} · 纹理 ${texture} · 模型绘制值 ${drawOrders?.[index] ?? '—'} · 原位次 ${nativeOrders[index]} · 透明度 ${Math.round(opacity*100)}%${visible ? '' : ' · 当前隐藏'}`;
      row.classList.toggle('layer-hidden', !visible);
      for (const button of controls.children) button.disabled = ['first','up'].includes(button.dataset.move) ? rank === 0 : rank === order.length-1;
    });
    this.status.textContent = `${this.manual ? '手动排序 · 已覆盖当前预览' : '跟随模型 · 实时排序'} · ${order.length} 个网格`;
    document.getElementById('layerReset').disabled = !this.manual;
  }
  export() {
    if (!this.model) return;
    const data = {version:1, modelSha256:this.fingerprint, direction:'front-to-back', drawableIds:this.order().map(i=>this.ids[i])};
    const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
    const a = document.createElement('a'); a.href=url; a.download='live2d-layer-order.json'; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  applyConfig(data) {
    if (data.version !== 1 || data.modelSha256 !== this.fingerprint || data.direction !== 'front-to-back') throw Error('配置版本或模型不匹配，请使用当前模型导出的排序配置。');
    const ids = data.drawableIds;
    if (!Array.isArray(ids) || ids.length !== this.ids.length || new Set(ids).size !== this.ids.length || ids.some(id=>!this.ids.includes(id))) throw Error('配置必须包含全部网格 ID，且不能重复或遗漏。');
    this.setOrder(ids.map(id=>this.ids.indexOf(id)));
  }
}
