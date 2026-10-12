import { mkdir, rm, readdir, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { root, json, save, run, statePath } from './common.mjs';
import { importPackage, updateMetadata, removePackage } from './packages.mjs';
import { generateManifest } from './generate-manifest.mjs';
import { generatePosters } from './posters.mjs';
import { cellText, fileRefs } from './sheet-cells.mjs';

async function readRows(config){
  const workbook=JSON.parse(await run('lark-cli',['sheets','+workbook-info','--spreadsheet-token',config.spreadsheetToken,'--as',config.identity]));
  if(!workbook.ok)throw Error('工作簿读取失败');const sheet=workbook.data.sheets.find(s=>s.sheet_id===config.sheetId);if(!sheet)throw Error('Live2D 子表不存在');
  const rows=[];
  for(let start=1;start<=sheet.row_count;start+=config.pageSize){
    const end=Math.min(sheet.row_count,start+config.pageSize-1);
    const data=JSON.parse(await run('lark-cli',['sheets','+cells-get','--spreadsheet-token',config.spreadsheetToken,'--sheet-id',config.sheetId,'--as',config.identity,'--range',`A${start}:L${end}`,'--include','value']));
    if(!data.ok||data.data.has_more||data.data.ranges.some(r=>r.truncated))throw Error('飞书返回截断数据，同步已停止，避免误删素材');
    for(const range of data.data.ranges)for(let i=0;i<range.cells.length;i++)rows.push({number:range.row_indices[i],cells:range.cells[i]});
  }
  const header=rows.find(r=>r.number===1)?.cells.map(cellText)||[];
  for(const title of Object.values(config.columns))if(!header.includes(title))throw Error(`子表缺少列：${title}`);
  return rows.filter(r=>r.number>1).map(r=>({row:r.number,...Object.fromEntries(Object.entries(config.columns).map(([key,title])=>[key,r.cells[header.indexOf(title)]]))}));
}
async function download(config,ref,destination){await mkdir(join(root,'.sync/downloads'),{recursive:true});await run('lark-cli',['api','GET',`/open-apis/drive/v1/medias/${ref.token}/download`,'--as',config.identity,'--output',destination]);}

export async function syncOnce(){
  const config=await json(join(root,'lark-sync.config.json'));
  const state=await json(statePath,{sources:{}}), rows=await readRows(config), active=new Set(),retired=new Set();let changed=false;
  // Complete the read and all downloads before pruning anything referenced by the previous successful sync.
  for(const row of rows){
    const refs=fileRefs(row.file);if(cellText(row.file)&&!refs.length)throw Error(`第 ${row.row} 行：模型文件需要完整 ZIP 飞书附件`);
    for(const ref of refs){
    const key=ref.token;active.add(key);const previous=state.sources[key];
    const metadata={sourceId:key,name:cellText(row.name),category:cellText(row.category)||'未分类',tags:cellText(row.tags).split(/[,，、;；\s]+/).filter(Boolean),defaultGroup:cellText(row.defaultGroup),defaultMotion:cellText(row.defaultMotion),hidden:/^(隐藏|下架|不显示|hide|hidden)$/i.test(cellText(row.status)),notes:cellText(row.notes),fileName:ref.name||'model.zip'};
    const signature=createHash('sha256').update(JSON.stringify({metadata,size:ref.size,modified:ref.modified,poster:fileRefs(row.poster)})).digest('hex');
    if(previous?.signature===signature)continue;
    let pkg;
    if(!previous||previous.size!==ref.size||previous.modified!==ref.modified){
      const temp=join('.sync/downloads',`${createHash('sha256').update(key).digest('hex').slice(0,16)}.zip`);
      await download(config,ref,temp);metadata.updatedAt=new Date().toISOString();pkg=await importPackage(join(root,temp),metadata);await rm(join(root,temp),{force:true});
      console.log(`[live2d-sync] Row ${row.row}: imported ${pkg.items.length} models`);
    }else{metadata.updatedAt=new Date().toISOString();pkg={id:previous.packageId,items:await updateMetadata(previous.packageId,metadata)};console.log(`[live2d-sync] Row ${row.row}: updated metadata`);}
    const posterRef=fileRefs(row.poster)[0];
    if(posterRef){
      const temp=join('.sync/downloads',`${pkg.id}.poster`);await download(config,posterRef,temp);
      const {fileTypeFromFile}=await import('./poster-type.mjs');const extension=await fileTypeFromFile(join(root,temp));
      await mkdir(join(root,'posters'),{recursive:true});
      for(const item of pkg.items){await copyFile(join(root,temp),join(root,'posters',`${item.id}.${extension}`));const p=await json(join(root,'models',pkg.id,'.package.json'));p.items.find(x=>x.id===item.id).poster=`./posters/${item.id}.${extension}`;await save(join(root,'models',pkg.id,'.package.json'),p);}
      await rm(join(root,temp),{force:true});
    }else{
      const p=await json(join(root,'models',pkg.id,'.package.json'));
      for(const item of p.items){delete item.poster;for(const ext of ['png','jpg','webp'])await rm(join(root,'posters',`${item.id}.${ext}`),{force:true});}
      await save(join(root,'models',pkg.id,'.package.json'),p);
    }
    state.sources[key]={packageId:pkg.id,signature,size:ref.size,modified:ref.modified,updatedAt:metadata.updatedAt};changed=true;
    if(previous&&previous.packageId!==pkg.id)retired.add(previous.packageId);
  }}
  for(const [key,value]of Object.entries(state.sources)){if(!active.has(key)){retired.add(value.packageId);delete state.sources[key];changed=true;console.log(`[live2d-sync] Removed replaced/deleted package ${value.packageId}`);}}
  const kept=new Set(Object.values(state.sources).map(x=>x.packageId));for(const id of retired)if(!kept.has(id))await removePackage(id);
  await save(statePath,state);await generateManifest();
  const manifest=await json(join(root,'manifest.json'));const referenced=new Set(manifest.items.flatMap(x=>[`${x.id}.png`,x.poster?.split('/').pop()].filter(Boolean)));
  try{for(const file of await readdir(join(root,'posters')))if(!file.startsWith('.')&&!referenced.has(file))await rm(join(root,'posters',file),{force:true});}catch(e){if(e.code!=='ENOENT')throw e;}
  console.log(`[live2d-sync] ${changed?'Sync completed':'No new models'}; ${manifest.items.filter(x=>!x.hidden).length} visible models`);
  return changed;
}
let running=false;
async function tick(){if(running)return;running=true;try{const changed=await syncOnce();if(process.argv.includes('--publish')){await generatePosters();await run(process.execPath,['scripts/publish.mjs']);}}finally{running=false;}}
if(process.argv.includes('--watch')){const config=await json(join(root,'lark-sync.config.json'));await tick();setInterval(()=>tick().catch(e=>console.error(e.message)),config.pollSeconds*1000);}else{await tick();}
