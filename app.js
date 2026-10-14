import { ModelPlayer } from './player.js';
import { unzipPackage, inspectModel } from './model-files.js';

const $ = id => document.getElementById(id);
let remoteItems = [], localItems = [], view = localStorage.getItem('live2d-view') || 'grid';
let detailPlayer, hoverPlayer, detailItem, detailGeneration = 0, hoverGeneration = 0, hoverTarget, hoverTimer, toastTimer;
let playbackGeneration = 0, motionPending = false;
const posters = new Map();
const sceneBackgrounds = new Map();
let sceneGeneration = 0;
const layerInspector = new LayerInspector(() => detailPlayer?.render());
const options = (el, entries) => el.replaceChildren(...entries.map(([value, label]) => new Option(label, value)));
function icons() { lucide.createIcons(); }
function icon(name) { const el = document.createElement('i'); el.dataset.lucide = name; return el; }
function toast(text) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 4200); }
function allItems() { return [...localItems, ...remoteItems]; }
function labelSize(bytes) { return bytes ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : ''; }
async function loadSceneBackgrounds() {
  try {
    const response=await fetch('scene-backgrounds.json');if(!response.ok)throw Error('场景清单读取失败');
    const data=await response.json();if(!Array.isArray(data.items))throw Error('场景清单格式无效');
    for(const scene of data.items){const url=new URL(scene.image,location.href);if(url.origin!==location.origin)throw Error('场景资源必须位于本站');sceneBackgrounds.set(scene.id,{...scene,image:url.href});}
    options($('detailScene'),[['','无场景'],...Array.from(sceneBackgrounds.values(),scene=>[scene.id,scene.name])]);$('detailScene').disabled=false;
  }catch(error){$('detailScene').title=error.message;}
}
function clearSceneBackground(){++sceneGeneration;$('detailScene').value='';$('sceneImage').hidden=true;$('sceneImage').removeAttribute('src');}
async function applySceneBackground(){
  const scene=sceneBackgrounds.get($('detailScene').value),ticket=++sceneGeneration;
  if(!scene){clearSceneBackground();return;}
  try{
    const image=new Image();image.src=scene.image;await image.decode();if(ticket!==sceneGeneration)return;
    $('sceneImage').src=scene.image;$('sceneImage').alt=scene.name;$('sceneImage').hidden=false;
    $('stage').classList.remove('checker');$('checker').setAttribute('aria-pressed','false');
  }catch{if(ticket===sceneGeneration){clearSceneBackground();toast('场景图片加载失败，请重试。');}}
}
function filtered() {
  const query = $('search').value.trim().toLocaleLowerCase();
  const result = allItems().filter(item => (!$('category').value || item.category === $('category').value) && (!$('source').value || (item.localFiles ? 'local' : 'remote') === $('source').value) && (!query || [item.name, item.category, item.modelPath, item.modelUrl, ...(item.tags || [])].join(' ').toLocaleLowerCase().includes(query)));
  return result.sort($('sort').value === 'name' ? (a, b) => a.name.localeCompare(b.name, 'zh-CN') : (a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

async function loadManifest() {
  $('refresh').disabled = true;
  try {
    const response = await fetch(`manifest.json?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw Error(`清单读取失败（${response.status}）`);
    const data = await response.json(); if (!Array.isArray(data.items)) throw Error('角色清单格式无效');
    remoteItems = data.items.filter(x => !x.hidden);
    $('sheetLink').href = data.sheetUrl || $('sheetLink').href;
    $('syncTime').textContent = data.updatedAt ? `更新于 ${new Date(data.updatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}` : '等待首批模型';
    $('pageError').hidden = true; $('libraryStatus').textContent = '资源清单已就绪';
    updateCategories(); render();
    const id = new URL(location.href).searchParams.get('model'); const target = remoteItems.find(x => x.id === id); if (target && !$('detailDialog').open) void openDetail(target);
  } catch (e) { $('pageError').textContent = e.message; $('pageError').hidden = false; $('libraryStatus').textContent = '清单读取失败'; render(); }
  finally { $('refresh').disabled = false; }
}

function updateCategories() {
  const value = $('category').value;
  const counts = new Map(); for (const item of allItems()) counts.set(item.category || '未分类', (counts.get(item.category || '未分类') || 0) + 1);
  options($('category'), [['', '全部分类'], ...[...counts].sort((a,b) => a[0].localeCompare(b[0], 'zh-CN')).map(([name, count]) => [name, `${name} (${count})`])]);
  if (counts.has(value)) $('category').value = value;
}

function render() {
  stopHover(); const items = filtered(), total = allItems().length;
  $('count').textContent = total; $('resultCount').textContent = `${items.length} 个角色`; $('footerCount').textContent = `${total} Characters / Live2D`;
  $('gallery').className = `gallery ${view}`;
  document.querySelectorAll('[data-view]').forEach(b => { b.classList.toggle('active', b.dataset.view === view); b.setAttribute('aria-pressed', String(b.dataset.view === view)); });
  $('gallery').replaceChildren(...items.map(createCard));
  $('empty').hidden = !!items.length;
  $('emptyTitle').textContent = total ? '没有找到匹配的角色' : '等待第一位角色';
  $('emptyCopy').textContent = total ? '试试其他名称或分类。' : '模型准备好后，就在这里见面。';
  $('emptyImport').hidden = !!total;
  $('recentSection').hidden = !total;
  const recent = [...allItems()].sort((a,b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0,6);
  $('recentCount').textContent = `${recent.length} 个角色`;
  $('recentRail').replaceChildren(...recent.map(item => {
    const button = document.createElement('button'); button.className = 'recent-card';
    const img = document.createElement('img'); img.alt = item.name; img.src = posters.get(item.id) || item.poster || 'assets/character-placeholder.svg'; img.loading = 'lazy';
    const copy = document.createElement('span'), title = document.createElement('strong'), desc = document.createElement('small'); title.textContent = item.name; desc.textContent = item.category || '未分类'; copy.append(title, desc); button.append(img, copy); button.onclick = () => openDetail(item); return button;
  })); icons();
}

function createCard(item) {
  const card = document.createElement('article'); card.className = 'model-card'; card.dataset.id = item.id;
  const preview = document.createElement('button'); preview.className = 'preview'; preview.setAttribute('aria-label', `预览 ${item.name}`);
  const img = document.createElement('img'); img.loading = 'lazy'; img.decoding = 'async'; img.alt = item.name; img.src = posters.get(item.id) || item.poster || 'assets/character-placeholder.svg'; preview.append(img);
  const badge = document.createElement('span'); badge.className = 'preview-badge'; badge.textContent = item.localFiles ? 'LOCAL' : 'LIVE2D'; preview.append(badge);
  const hint = document.createElement('span'); hint.className = 'preview-hint'; hint.append(icon('maximize-2')); preview.append(hint);
  preview.onclick = () => openDetail(item);
  preview.onpointerenter = e => { if (e.pointerType === 'mouse' && $('hoverPlay').checked && !matchMedia('(prefers-reduced-motion: reduce)').matches) { hoverTarget = preview; clearTimeout(hoverTimer); hoverTimer = setTimeout(() => startHover(item, preview), 230); } };
  preview.onpointerleave = () => { if (hoverTarget === preview) stopHover(); };
  preview.onfocus = () => { hoverTarget = preview; };
  const body = document.createElement('div'); body.className = 'card-body';
  const titleRow = document.createElement('div'); titleRow.className = 'card-title-row';
  const title = document.createElement('h2'); title.textContent = item.name; title.title = item.name;
  const actions = document.createElement('div'); actions.className = 'card-actions';
  const detail = document.createElement('button'); detail.className = 'icon-button'; detail.title = '查看详情'; detail.setAttribute('aria-label', `查看 ${item.name} 详情`); detail.append(icon('arrow-up-right')); detail.onclick = () => openDetail(item); actions.append(detail);
  titleRow.append(title, actions);
  const category = document.createElement('p'); category.className = 'card-category'; category.textContent = item.category || '未分类';
  const tags = document.createElement('div'); tags.className = 'card-tags'; for (const t of (item.tags || []).slice(0,3)) { const span = document.createElement('span'); span.textContent = t; tags.append(span); }
  const stats = document.createElement('div'); stats.className = 'card-stats'; for (const text of [`${item.motionCount || 0} 动作`, `${item.expressionCount || 0} 表情`, labelSize(item.size)]) { if (text) { const span = document.createElement('span'); span.textContent = text; stats.append(span); } }
  body.append(titleRow, category, tags, stats); card.append(preview, body); return card;
}

async function startHover(item, host) {
  if ($('detailDialog').open || hoverTarget !== host) return;
  stopHover(false); hoverTarget = host; const ticket = ++hoverGeneration;
  try {
    if (!hoverPlayer) hoverPlayer = new ModelPlayer($('hoverCanvas'), host, { onError: () => stopHover() });
    else hoverPlayer.setHost(host);
    $('hoverCanvas').hidden = true;
    const manifest = await hoverPlayer.load(item);
    if (!manifest || ticket !== hoverGeneration || hoverTarget !== host) return;
    const group = defaultGroup(item, manifest); if (group) await hoverPlayer.play(group, defaultMotion(item, manifest, group));
    if (ticket !== hoverGeneration || hoverTarget !== host) return;
    $('hoverCanvas').hidden = false;
  } catch (e) { if (ticket === hoverGeneration) { stopHover(); toast(e.message); } }
}
function stopHover(clearTarget = true) { clearTimeout(hoverTimer); ++hoverGeneration; hoverPlayer?.release(); $('hoverCanvas').hidden = true; if (clearTarget) hoverTarget = null; }
function defaultGroup(item, manifest) { const groups = Object.keys(manifest.FileReferences.Motions || {}).filter(g => manifest.FileReferences.Motions[g].length); return groups.includes(item.defaultGroup) ? item.defaultGroup : groups.includes('Action') ? 'Action' : groups.includes('Idle') ? 'Idle' : groups[0]; }
function defaultMotion(item, manifest, group) { const list = manifest.FileReferences.Motions[group] || []; const named = list.findIndex(m => m.Name === item.defaultMotion || m.File === item.defaultMotion); return named >= 0 ? named : Math.min(Math.max(0, Number(item.defaultMotion) || 0), Math.max(0,list.length - 1)); }

async function openDetail(item) {
  stopHover(); ++playbackGeneration; motionPending = false; const ticket = ++detailGeneration; detailItem = item;
  $('detailTitle').textContent = item.name; $('detailCategory').textContent = [item.category, ...(item.tags || [])].filter(Boolean).join(' / ');
  $('characterLinks').hidden=!!item.localFiles;
  $('personaLink').href=`personas/100-character-personas.html?character=${encodeURIComponent(item.id)}`;
  $('artworkLink').href=`personas/artwork/illustrations.html?character=${encodeURIComponent(item.id)}`;
  $('detailError').hidden = true; $('stageMessage').textContent = '正在加载角色'; $('stageMessage').hidden = false; $('stageState').textContent = 'LOADING'; $('stageResolution').textContent = ''; $('details').replaceChildren();
  enableControls(false); options($('group'), [['','加载中']]); options($('motion'), [['','加载中']]); options($('expression'), [['','默认表情']]);
  $('download').hidden = !item.packageUrl; if (item.packageUrl) { $('download').href = item.packageUrl; $('download').download = item.packageName || `${item.name}.zip`; }
  if (!$('detailDialog').open) $('detailDialog').showModal();
  const url = new URL(location.href); if (item.localFiles) url.searchParams.delete('model'); else url.searchParams.set('model', item.id); history.replaceState(null, '', url);
  try {
    if (!detailPlayer) detailPlayer = new ModelPlayer($('detailCanvas'), $('stage'), { layerInspector, onFinish: () => { if ($('loop').checked && !detailPlayer.paused && !motionPending && $('detailDialog').open) void playSelected(); }, onError: showDetailError });
    const manifest = await detailPlayer.load(item); if (!manifest || ticket !== detailGeneration) return;
    const groups = Object.entries(manifest.FileReferences.Motions || {}).filter(([,a]) => a.length);
    options($('group'), groups.length ? groups.map(([g,a]) => [g, `${g} · ${a.length}`]) : [['','无动作']]);
    const group = defaultGroup(item, manifest); if (group) $('group').value = group;
    enableControls(true); setMotions(); $('motion').value = String(group ? defaultMotion(item,manifest,group) : 0);
    $('speed').value = '1'; detailPlayer.speed = 1; $('zoom').value = '100'; $('zoomValue').textContent = '100%'; setPause(false);
    $('interaction').checked = true; detailPlayer.interaction = true; $('physics').checked = true; $('physics').disabled = !manifest.FileReferences.Physics;
    const expressions = manifest.FileReferences.Expressions || [];
    options($('expression'), [['','默认表情'], ...expressions.map((e,i) => [String(i), e.Name || `表情 ${i+1}`])]); $('expression').disabled = !expressions.length;
    $('stageMessage').hidden = true; $('stageState').textContent = 'LIVE2D';
    const internal = detailPlayer.model.internalModel; $('stageResolution').textContent = `${Math.round(internal.width)} × ${Math.round(internal.height)}`;
    const entries = [['纹理',manifest.FileReferences.Textures.length],['动作',groups.reduce((n,[,a])=>n+a.length,0)],['表情',expressions.length],['网格',internal.coreModel.getDrawableCount()],['物理',manifest.FileReferences.Physics?'有':'无'],['Pose',manifest.FileReferences.Pose?'有':'无'],['资源大小',labelSize(item.size)||'本地目录']];
    for (const [key,value] of entries) { const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=key;dd.textContent=value;$('details').append(dt,dd); }
    if (!item.poster && !posters.has(item.id)) { const image = detailPlayer.poster(); posters.set(item.id,image); const card = [...$('gallery').children].find(c=>c.dataset.id===item.id); if (card) card.querySelector('img').src=image; }
    if (group) await playSelected();
  } catch (e) { if (ticket === detailGeneration) showDetailError(e); }
}
function enableControls(enabled) { for (const id of ['pause','replay','speed','loop','zoom','fit','group','motion','expression','interaction','physics']) $(id).disabled = !enabled; }
function showDetailError(e) { $('detailError').textContent = e.message || String(e); $('detailError').hidden = false; $('stageMessage').textContent = '角色加载失败'; $('stageMessage').hidden = false; $('stageState').textContent = 'ERROR'; enableControls(false); }
function setMotions() { const list = detailPlayer?.manifest?.FileReferences.Motions?.[$('group').value] || []; options($('motion'),list.length ? list.map((m,i)=>[String(i),m.Name || m.File.split('/').pop()]) : [['','无动作']]); $('motion').disabled=!list.length; $('group').disabled=!list.length; $('replay').disabled=!list.length; $('loop').disabled=!list.length; $('playing').textContent=list.length ? `${list.length} 个动作` : '静态模型'; }
async function playSelected({ resume = false } = {}) {
  const target = detailPlayer, model = target?.model; if (!model) return;
  const ticket = ++playbackGeneration, group = $('group').value, index = Number($('motion').value), label = $('motion').selectedOptions[0]?.textContent || '';
  const current = () => ticket === playbackGeneration && model === target.model;
  motionPending = true; $('detailError').hidden = true; $('playing').textContent = '正在加载动作';
  if (resume) setPause(false);
  try {
    const ok = await target.play(group, index);
    if (ok && current()) { $('playing').textContent = label; if (target.paused) target.render(); }
  } catch (e) {
    if (current()) { $('detailError').textContent = e.message || String(e); $('detailError').hidden = false; $('playing').textContent = '动作加载失败'; }
  } finally { if (current()) motionPending = false; }
}
function setPause(value) { detailPlayer.pause(value); $('pause').replaceChildren(icon(value?'play':'pause')); $('pause').title=value?'播放':'暂停'; $('pause').setAttribute('aria-label',value?'播放':'暂停'); icons(); $('stageState').textContent=value?'PAUSED':'LIVE2D'; }
function closeDetail() { $('detailDialog').close(); }
$('detailDialog').addEventListener('close',()=>{++detailGeneration;++playbackGeneration;motionPending=false;detailPlayer?.release();detailItem=null;const url=new URL(location.href);url.searchParams.delete('model');history.replaceState(null,'',url);});
$('detailClose').onclick=closeDetail;
$('pause').onclick=()=>{const resume=detailPlayer.paused;setPause(!resume);if(resume&&!motionPending&&detailPlayer.model.internalModel.motionManager.isFinished())void playSelected();};
$('replay').onclick=()=>void playSelected({resume:true});
$('group').onchange=()=>{setMotions();void playSelected({resume:true});};$('motion').onchange=()=>void playSelected({resume:true});
$('speed').onchange=()=>detailPlayer.speed=Number($('speed').value);
$('expression').onchange=async()=>{const model=detailPlayer?.model;if(!model)return;try {if($('expression').value==='')model.internalModel.motionManager.expressionManager?.resetExpression();else await model.expression(Number($('expression').value));detailPlayer.render();}catch(e){toast(e.message);}};
$('interaction').onchange=()=>detailPlayer.interaction=$('interaction').checked;
$('physics').onchange=()=>detailPlayer.setPhysics($('physics').checked);
$('zoom').oninput=()=>{detailPlayer.zoom=Number($('zoom').value)/100;detailPlayer.fit();detailPlayer.render();$('zoomValue').textContent=`${$('zoom').value}%`;};
$('fit').onclick=()=>{$('zoom').value='100';$('zoom').oninput();};
$('previewBg').oninput=()=>{document.documentElement.style.setProperty('--preview-bg',$('previewBg').value);$('previewBgLabel').textContent=$('previewBg').value.toUpperCase();};
$('detailScene').onchange=()=>void applySceneBackground();
$('detailBg').oninput=()=>{clearSceneBackground();$('stage').style.backgroundColor=$('detailBg').value;$('detailBgLabel').textContent=$('detailBg').value.toUpperCase();$('stage').classList.remove('checker');$('checker').setAttribute('aria-pressed','false');};
$('checker').onclick=()=>{clearSceneBackground();$('stage').classList.toggle('checker');$('checker').setAttribute('aria-pressed',String($('stage').classList.contains('checker')));};
$('hoverPlay').onchange=()=>{if(!$('hoverPlay').checked)stopHover();};
for(const id of ['search','category','source','sort'])$(id).addEventListener(id==='search'?'input':'change',render);
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;localStorage.setItem('live2d-view',view);render();});
$('refresh').onclick=loadManifest;
for(const id of ['importButton','emptyImport'])$(id).onclick=()=>$('zipInput').click();
$('folderButton').onclick=()=>$('directoryInput').click();
$('zipInput').onchange=async e=>{const files=[...e.target.files];e.target.value='';await importZIPs(files);};
$('directoryInput').onchange=async e=>{const files=[...e.target.files];e.target.value='';try{await addLocalModels(new Map(files.map(f=>[f.webkitRelativePath,f])),'本地目录');}catch(error){toast(error.message);}};

async function importZIPs(files) {
  for(const file of files) {
    try {
      if(!/\.zip$/i.test(file.name))throw Error('请导入完整的模型 ZIP 包，或使用“选择模型目录”。');
      if(file.size>256*1024*1024)throw Error('单个 ZIP 超过 256MB，请按角色拆分。');
      $('libraryStatus').textContent=`正在读取 ${file.name}`;
      const unpacked=unzipPackage(new Uint8Array(await file.arrayBuffer()),fflate.unzipSync);
      const map=new Map([...unpacked].map(([name,data])=>[name,new File([data],name)]));
      await addLocalModels(map,file.name,file);
    }catch(e){toast(`${file.name}：${e.message}`);}
  }
  $('libraryStatus').textContent='资源清单已就绪';
}
async function addLocalModels(files, packageName, zipFile) {
  const paths=[...files.keys()].filter(p=>/\.model3\.json$/i.test(p));if(!paths.length)throw Error('未找到 .model3.json。需要导出的完整运行资源，不能使用 .cmo3 工程。');
  const items=[]; const errors=[];
  for(const path of paths){try{const manifest=JSON.parse(await files.get(path).text());const meta=inspectModel(path,manifest,files);items.push({...meta,id:crypto.randomUUID(),name:path.split('/').pop().replace(/\.model3\.json$/i,''),category:'本地导入',tags:[],modelPath:path,localFiles:files,size:[...files.values()].reduce((n,f)=>n+f.size,0),packageName,packageUrl:zipFile?URL.createObjectURL(zipFile):null,updatedAt:new Date().toISOString()});}catch(e){errors.push(e.message);}}
  localItems.push(...items);updateCategories();render();toast(`已导入 ${items.length} 个角色${errors.length?`，${errors.length} 个资源不完整`:''}`);
  if(errors.length){$('pageError').textContent=errors.join('\n');$('pageError').hidden=false;}
  if(items.length) await generateLocalPosters(items);
}
async function generateLocalPosters(items){
  // Use the same hover renderer sequentially so bulk imports never create one WebGL context per card.
  for(const item of items){if($('detailDialog').open||hoverTarget)break;const host=document.querySelector(`[data-id="${item.id}"] .preview`);if(!host)continue;try{if(!hoverPlayer)hoverPlayer=new ModelPlayer($('hoverCanvas'),host);else hoverPlayer.setHost(host);const m=await hoverPlayer.load(item);if(m&&!$('detailDialog').open&&!hoverTarget){const poster=hoverPlayer.poster();posters.set(item.id,poster);host.querySelector('img').src=poster;hoverPlayer.release();}else break;}catch{hoverPlayer?.release();}await new Promise(resolve=>requestAnimationFrame(resolve));}
}
let dragDepth=0;
document.addEventListener('dragenter',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();dragDepth++;document.body.classList.add('dragging');}});
document.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();});
document.addEventListener('dragleave',()=>{if(--dragDepth<=0){dragDepth=0;document.body.classList.remove('dragging');}});
document.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;document.body.classList.remove('dragging');void importZIPs([...e.dataTransfer.files]);});
window.addEventListener('pagehide',()=>{hoverPlayer?.release();detailPlayer?.release();for(const item of localItems)if(item.packageUrl)URL.revokeObjectURL(item.packageUrl);});
icons();void loadManifest();void loadSceneBackgrounds();
