import { readFile, mkdir, writeFile, rename, rm, cp } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';
import { unzipPackage, inspectModel } from '../model-files.js';
import { root, json, save, urlPath } from './common.mjs';

export async function importPackage(zipPath, metadata={}) {
  const bytes = await readFile(zipPath);
  if(bytes.length>256*1024*1024)throw Error('模型 ZIP 超过 256MB，请按角色拆分。');
  const hash=createHash('sha256').update(bytes).digest('hex');
  const id=createHash('sha256').update(`${metadata.sourceId||''}:${hash}`).digest('hex').slice(0,16);
  const files=unzipPackage(bytes,unzipSync), models=[];
  const manifestPaths=[...files.keys()].filter(x=>/\.model3\.json$/i.test(x));
  if(!manifestPaths.length)throw Error('ZIP 中未找到 .model3.json。请打包 Cubism 导出的运行资源。');
  for(const path of manifestPaths){
    const manifest=JSON.parse(new TextDecoder().decode(files.get(path))), stats=inspectModel(path,manifest,files);
    const suffix=manifestPaths.length>1?` / ${basename(path).replace(/\.model3\.json$/i,'')}`:'';
    models.push({...stats,id:`${id}-${createHash('sha256').update(path).digest('hex').slice(0,8)}`,name:(metadata.name||basename(path).replace(/\.model3\.json$/i,''))+suffix,modelUrl:`./models/${id}/${urlPath(path)}`,modelPath:path,packageUrl:`./packages/${id}.zip`,packageName:metadata.fileName||basename(zipPath),category:metadata.category||'未分类',tags:metadata.tags||[],defaultGroup:metadata.defaultGroup||'',defaultMotion:metadata.defaultMotion||'',hidden:!!metadata.hidden,notes:metadata.notes||'',updatedAt:metadata.updatedAt||new Date().toISOString(),size:bytes.length,packageId:id});
  }
  const target=join(root,'models',id), staging=join(root,'.sync/staging',id);
  await rm(staging,{recursive:true,force:true});await mkdir(staging,{recursive:true});
  try {
    for(const [path,data]of files){const output=join(staging,path);await mkdir(dirname(output),{recursive:true});await writeFile(output,data);}
    const storedMetadata={...metadata};delete storedMetadata.sourceId;
    await save(join(staging,'.package.json'),{id,hash,metadata:storedMetadata,items:models});
    await mkdir(join(root,'models'),{recursive:true});await rm(target,{recursive:true,force:true});await rename(staging,target);
    await mkdir(join(root,'packages'),{recursive:true});await cp(zipPath,join(root,'packages',`${id}.zip`));
  }catch(error){await rm(staging,{recursive:true,force:true});throw error;}
  return {id,hash,items:models};
}

export async function updateMetadata(packageId, metadata) {
  const file=join(root,'models',packageId,'.package.json'), pkg=await json(file);
  const multiple=pkg.items.length>1;
  pkg.metadata={...metadata};delete pkg.metadata.sourceId;
  for(const item of pkg.items){item.name=(metadata.name||basename(item.modelPath).replace(/\.model3\.json$/i,''))+(multiple?` / ${basename(item.modelPath).replace(/\.model3\.json$/i,'')}`:'');for(const key of ['category','tags','defaultGroup','defaultMotion','hidden','notes','updatedAt'])item[key]=metadata[key]??item[key];}
  await save(file,pkg);return pkg.items;
}

export async function removePackage(id){
  if(!/^[a-f0-9]{16}$/.test(id))throw Error('无效的包标识');
  await rm(join(root,'models',id),{recursive:true,force:true});await rm(join(root,'packages',`${id}.zip`),{force:true});
}
