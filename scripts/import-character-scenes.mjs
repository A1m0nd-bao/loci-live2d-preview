import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, copyFile, stat } from 'node:fs/promises';
import { join, dirname, relative, resolve, basename } from 'node:path';
import { root, json, save } from './common.mjs';
import { launchBrowser } from './browser.mjs';
import { zipSync } from 'fflate';

const source=resolve(process.argv[2]||'/Users/baotianrong/Downloads/live2d-100-characters-20261013/personas');
const destination=join(root,'personas');
const profiles=await json(join(source,'100-character-personas.json'));
const artworks=await json(join(source,'artwork/reviewed-artworks.json'));
const backgrounds=await json(join(source,'backgrounds/common-scenes-v1/selected-backgrounds.json'));
const models=await json(join(root,'manifest.json'));
assert.equal(profiles.characters.length,100);assert.equal(artworks.reviewed,100);
assert.equal(backgrounds.items.length,8);
const modelIds=new Set(models.items.map(item=>item.id));
assert(profiles.characters.every(c=>modelIds.has(c.modelId)),'Profile points to a missing model');
assert.equal(new Set(profiles.characters.map(c=>c.modelId)).size,100);
let bytes=0;
async function copy(name){
  const from=resolve(source,name);assert(from.startsWith(source+'/'),'Asset outside source');
  const to=join(destination,name);await mkdir(dirname(to),{recursive:true});await copyFile(from,to);bytes+=(await stat(to)).size;
}
for(const name of ['100-character-personas.json','100-character-personas.en.json','100-character-personas.md','100-character-personas.en.md','lucide.js','LICENSE-lucide'])await copy(name);
for(const c of profiles.characters)await copy(c.portrait);
for(const art of artworks.records){
  const name=relative(source,art.selectedOutput);await copy(name);
  for(const doc of ['character-bible.md','generation-prompt.txt'])await copy(join(dirname(name),doc));
}
for(const bg of backgrounds.items)await copy(relative(source,bg.selectedOutput));
for(const name of ['artwork/ARTWORK-INDEX.md','backgrounds/common-scenes-v1/INDEX.md','backgrounds/common-scenes-v1/01-clean-signage-prompt.txt'])await copy(name);
const backgroundDir='backgrounds/common-scenes-v1';
const plan=await json(join(source,backgroundDir,'generation-plan.json'));
await save(join(destination,backgroundDir,'generation-plan.json'),{tool:plan.tool,count:8,format:plan.format,items:plan.items.map(({id,name,category,scene,prompt})=>({id,name,category,scene,prompt,output:backgrounds.items.find(bg=>bg.id===id).image}))});
const archive={};
for(const bg of backgrounds.items)archive[bg.image]=await readFile(bg.selectedOutput);
for(const name of ['INDEX.md','generation-plan.json','01-clean-signage-prompt.txt'])archive[name]=await readFile(join(destination,backgroundDir,name));
await writeFile(join(destination,backgroundDir,'common-scenes.zip'),zipSync(archive,{level:0,mtime:new Date('2026-10-14T00:00:00Z')}));
const catalog=backgrounds.items.map(bg=>({id:bg.id,name:bg.name,category:bg.category,image:'./personas/'+relative(source,bg.selectedOutput),width:bg.width,height:bg.height}));
await save(join(root,'scene-backgrounds.json'),{version:1,items:catalog});
await save(join(destination,'collection.json'),{version:1,profiles:100,illustrations:100,backgrounds:8,characters:profiles.characters.map(c=>({index:c.index,modelId:c.modelId,name:c.name,portrait:c.portrait,artwork:c.artwork})),scenes:catalog});

// DOMParser edits the exported documents without executing their embedded scripts.
const browser=await launchBrowser();
try{
  const page=await browser.newPage();
  for(const name of ['100-character-personas.html','100-character-personas.en.html','artwork/illustrations.html','backgrounds/common-scenes-v1/index.html']){
    const html=await readFile(join(source,name),'utf8');
    const depth=name.split('/').length,siteRoot='../'.repeat(depth),shared=relative(dirname(name),'shared-navigation.js');
    const rendered=await page.evaluate(({html,siteRoot,shared,name})=>{
      const doc=new DOMParser().parseFromString(html,'text/html'),data=doc.getElementById('data');
      if(name==='artwork/illustrations.html'){
        const items=JSON.parse(data.textContent).map(({index,modelId,name,nameZh,image,role,genre,previewUrl})=>({index,modelId,name,nameZh,image,role,genre,previewUrl}));
        data.textContent=JSON.stringify(items).replaceAll('<','\\u003c');
      }else if(name.startsWith('backgrounds/')){
        const payload=JSON.parse(data.textContent);
        payload.items=payload.items.map(({id,name,category,image,width,height})=>({id,name,category,image,width,height}));
        data.textContent=JSON.stringify(payload).replaceAll('<','\\u003c');
      }
      const script=doc.createElement('script');script.src=shared;script.dataset.siteRoot=siteRoot;doc.body.append(script);
      const style=doc.createElement('link');style.rel='stylesheet';style.href=shared.replace(/\.js$/,'.css');doc.head.append(style);
      return '<!doctype html>\n'+doc.documentElement.outerHTML+'\n';
    },{html,siteRoot,shared,name});
    assert(!rendered.includes('/Users/'),'Local filesystem path leaked into public page');
    const file=join(destination,name);await mkdir(dirname(file),{recursive:true});await writeFile(file,rendered);
  }
}finally{await browser.close();}
console.log(JSON.stringify({profiles:100,illustrations:100,backgrounds:8,assetMB:Number((bytes/1024/1024).toFixed(1))}));
