const $=id=>document.getElementById(id),params=new URL(location.href).searchParams;
let locale=params.get('lang')==='en'?'en':'zh',view=params.get('view')==='portrait'?'portrait':'illustration',datasets,selectedId;
const genres={zh:{urban:'都市',fantasy:'奇幻',youth:'青春',historical:'古风',stage:'舞台'},en:{urban:'Urban',fantasy:'Fantasy',youth:'Youth',historical:'Historical',stage:'Stage'}};
const genreKeys={'都市':'urban','奇幻':'fantasy','青春':'youth','古风':'historical','舞台':'stage'};
const labels={zh:{title:'角色档案',search:'人物检索',placeholder:'姓名、编号、身份或文件名',genre:'题材',source:'来源',all:'全部题材',batch:'全部 100 位',original:'原批次 79',new:'新增批次 21',opening:'开场白',reference:'形象与文件对应',image:'打开原图',model:'Live2D 预览',empty:'没有匹配的角色',detail:'打开角色档案'},en:{title:'Character Archive',search:'Find a character',placeholder:'Name, number, role or source file',genre:'Genre',source:'Source',all:'All genres',batch:'All 100',original:'Original 79',new:'New 21',opening:'Opening',reference:'Appearance & source',image:'Open original image',model:'Live2D preview',empty:'No matching characters',detail:'Open character profile'}};
function el(tag,cls,text){const node=document.createElement(tag);if(cls)node.className=cls;if(text)node.textContent=text;return node;}
function icon(name){const node=el('i');node.dataset.lucide=name;return node;}
function items(){return datasets[locale].characters;}
function imagePath(item){return view==='portrait'?item.portrait:item.artwork;}
function tags(item){return item.tags.map(tag=>el('span','',tag));}
function syncLabels(){
  const t=labels[locale],genre=$('genre').value,batch=$('batch').value;
  document.documentElement.lang=locale==='en'?'en':'zh-CN';document.title='Loci · '+t.title;
  for(const [id,value] of [['title',t.title],['searchLabel',t.search],['genreLabel',t.genre],['batchLabel',t.source],['empty',t.empty]])$(id).textContent=value;
  $('search').placeholder=t.placeholder;$('language').value=locale;$('detailLanguage').value=locale;
  $('genre').replaceChildren(new Option(t.all,''),...Object.entries(genres[locale]).map(([value,text])=>new Option(text,value)));$('genre').value=genre;
  $('batch').replaceChildren(new Option(t.batch,''),new Option(t.original,'original-79'),new Option(t.new,'new-21'));$('batch').value=batch;
  $('note').textContent=datasets[locale].note;
  const suffix=locale==='en'?'.en':'';$('markdown').href='100-character-personas'+suffix+'.md';$('json').href='100-character-personas'+suffix+'.json';
  document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===view)));
}
function card(item){
  const article=el('article','character');article.dataset.index=item.index;article.dataset.modelId=item.modelId;
  const visual=el('button','visual');visual.type='button';visual.setAttribute('aria-label',labels[locale].detail+' · '+item.name);
  const img=el('img');img.src=imagePath(item);img.alt=item.name;img.loading='lazy';img.decoding='async';visual.append(img);visual.onclick=()=>show(item.modelId);
  const copy=el('div','card-copy'),top=el('div','card-top');top.append(el('span','number',String(item.index).padStart(3,'0')+' / '+item.genre));
  const button=el('button','icon');button.title=labels[locale].detail;button.setAttribute('aria-label',button.title+' · '+item.name);button.append(icon('book-open'));button.onclick=()=>show(item.modelId);top.append(button);
  const name=el('h2','',item.name);name.append(el('span','alias',locale==='en'?item.nameZh:datasets.en.characters.find(c=>c.modelId===item.modelId).name));
  const tagList=el('div','tags');tagList.append(...tags(item));copy.append(top,name,el('p','role',item.role),tagList);article.append(visual,copy);return article;
}
function render(){
  const query=$('search').value.trim().toLowerCase(),genre=$('genre').value,batch=$('batch').value;
  const filtered=items().filter(item=>(!genre||(item.genreKey||genreKeys[item.genre])===genre)&&(!batch||item.batch===batch)&&(!query||[item.index,String(item.index).padStart(3,'0'),item.modelId,item.name,item.nameZh,datasets.en.characters.find(c=>c.modelId===item.modelId).name,item.role,item.visualObservation,item.originalFilename,...item.tags].join(' ').toLowerCase().includes(query)));
  $('grid').replaceChildren(...filtered.map(card));$('count').textContent=filtered.length+' / '+items().length;$('empty').hidden=!!filtered.length;lucide.createIcons();
}
function renderDetail(){
  const item=items().find(c=>c.modelId===selectedId);if(!item)return;
  const t=labels[locale];$('profileTitle').textContent=item.name;$('profileNumber').textContent=String(item.index).padStart(3,'0')+' / '+item.genre;
  $('profileImage').src=imagePath(item);$('profileImage').alt=item.name;$('profileRole').textContent=item.role;$('profileTags').replaceChildren(...tags(item));
  for(const [id,value] of [['profileTagline',item.tagline],['profileDescription',item.description],['openingLabel',t.opening],['profileGreeting',item.greeting],['sourceLabel',t.reference],['observation',item.visualObservation],['sourceFile',item.originalFilename]])$(id).textContent=value;
  const model='../?model='+encodeURIComponent(item.modelId);$('live2d').href=model;$('modelLink').href=model;$('modelLink').textContent=t.model;
  $('downloadImage').href=imagePath(item);$('downloadImage').download=String(item.index).padStart(3,'0')+'-'+view+'.png';$('originalImage').href=imagePath(item);$('originalImage').textContent=t.image;
}
function show(id){selectedId=id;renderDetail();if(!$('profile').open)$('profile').showModal();}
function changeLanguage(value){locale=value;const url=new URL(location.href);url.searchParams.set('lang',locale);history.replaceState(null,'',url);syncLabels();render();if($('profile').open)renderDetail();}
$('language').onchange=()=>changeLanguage($('language').value);$('detailLanguage').onchange=()=>changeLanguage($('detailLanguage').value);
$('search').oninput=render;$('genre').onchange=render;$('batch').onchange=render;$('close').onclick=()=>$('profile').close();
document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>{view=button.dataset.view;syncLabels();render();});
try{
  const responses=await Promise.all(['100-character-personas.json','100-character-personas.en.json'].map(file=>fetch(file)));
  if(responses.some(r=>!r.ok))throw Error('角色档案读取失败，请刷新重试。');
  const [zh,en]=await Promise.all(responses.map(r=>r.json()));datasets={zh,en};
  if(zh.characters.length!==100||en.characters.length!==100)throw Error('角色档案数量不完整。');
  const character=items().find(c=>c.modelId===params.get('character'));
  if(params.has('character'))$('search').value=character?String(character.index).padStart(3,'0'):params.get('character');
  syncLabels();render();if(character)show(character.modelId);
}catch(error){$('error').textContent=error.message;$('error').hidden=false;}
