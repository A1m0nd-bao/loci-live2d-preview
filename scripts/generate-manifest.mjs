import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, json, save } from './common.mjs';

export async function generateManifest() {
  const config=await json(join(root,'lark-sync.config.json'));
  let dirs=[];try{dirs=await readdir(join(root,'models'),{withFileTypes:true});}catch(e){if(e.code!=='ENOENT')throw e;}
  const items=[];
  for(const dir of dirs){if(!dir.isDirectory()||!/^[a-f0-9]{16}$/.test(dir.name))continue;const pkg=await json(join(root,'models',dir.name,'.package.json'));for(const item of pkg.items){
    const copy={...item};
    const poster=`posters/${item.id}.png`;
    try{await stat(join(root,poster));copy.poster=`./${poster}`;}catch{}
    items.push(copy);
  }}
  items.sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''));
  const previous=await json(join(root,'manifest.json'),{items:[]});
  const unchanged=JSON.stringify(previous.items)===JSON.stringify(items)&&previous.sheetUrl===config.spreadsheetUrl;
  const manifest={version:1,updatedAt:unchanged?previous.updatedAt:items.length?new Date().toISOString():null,sheetUrl:config.spreadsheetUrl,items};
  await save(join(root,'manifest.json'),manifest);return manifest;
}
if(import.meta.url===pathToFileURL(process.argv[1]).href){const m=await generateManifest();console.log(`Live2D manifest: ${m.items.filter(x=>!x.hidden).length} visible models`);}
