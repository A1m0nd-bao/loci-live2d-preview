import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { zipSync } from 'fflate';
import { root, run, json, save } from './common.mjs';

const gh='/opt/homebrew/bin/gh',repo='A1m0nd-bao/loci-live2d-preview';
process.env.GODEBUG=[process.env.GODEBUG,'http2client=0'].filter(Boolean).join(',');
const modelCount=(await json(join(root,'manifest.json'))).items.filter(x=>!x.hidden).length;
const files={};
const htmlFiles=['index.html','styles.css','app.js','player.js','model-files.js','layers.js','manifest.json','scene-backgrounds.json','.nojekyll'];
for(const name of htmlFiles)files[name]=await readFile(join(root,name));
async function collect(dir){for(const entry of await readdir(join(root,dir),{withFileTypes:true})){if(entry.name.startsWith('.'))continue;const name=`${dir}/${entry.name}`;if(entry.isDirectory())await collect(name);else files[name]=await readFile(join(root,name));}}
for(const dir of ['vendor','assets','packages','posters','personas'])await collect(dir);
const bundle=zipSync(files,{level:0,mtime:new Date('2026-10-12T00:00:00Z')});
const hash=createHash('sha256').update(bundle).digest('hex').slice(0,12);
const tag=`library-${hash}`,archive=join(root,'.sync/live2d-site.zip');await mkdir(join(root,'.sync'),{recursive:true});await writeFile(archive,bundle);
console.log(`Release bundle: ${(bundle.length/1024/1024).toFixed(1)} MB, ${tag}`);

const checkpointFile=join(root,'.sync/release-publish.json');const checkpoint=await json(checkpointFile,{});
if(checkpoint.tag!==tag){checkpoint.tag=tag;checkpoint.source=false;checkpoint.upload=false;await save(checkpointFile,checkpoint);}
if(!checkpoint.source){
  // Publish source in one commit on the current remote history; large model binaries stay in the release artifact.
  const sourceNames=['index.html','styles.css','app.js','player.js','model-files.js','layers.js','render.html','render.js','manifest.json','scene-backgrounds.json','README.md','package.json','package-lock.json','lark-sync.config.json','.gitignore','.nojekyll','.github/workflows/pages.yml'];
  for(const path of Object.keys(files))if(path.startsWith('personas/')&&!/\.(png|webp|jpg|jpeg|zip)$/i.test(path))sourceNames.push(path);
  for(const dir of ['scripts','tests'])for(const file of await readdir(join(root,dir)))if(!file.startsWith('.'))sourceNames.push(`${dir}/${file}`);
  const head=JSON.parse(await run(gh,['api',`repos/${repo}/git/ref/heads/main`])).object.sha;
  const commit=JSON.parse(await run(gh,['api',`repos/${repo}/git/commits/${head}`]));
  const tree=sourceNames.map(path=>({path,mode:'100644',type:'blob',content:null}));for(const entry of tree)entry.content=await readFile(join(root,entry.path),'utf8');
  const newTree=JSON.parse(await run(gh,['api','--method','POST',`repos/${repo}/git/trees`,'--input','-'],{input:JSON.stringify({base_tree:commit.tree.sha,tree})}));
  const newCommit=JSON.parse(await run(gh,['api','--method','POST',`repos/${repo}/git/commits`,'--input','-'],{input:JSON.stringify({message:`Publish ${modelCount} Live2D models with profiles, illustrations and scene backgrounds`,tree:newTree.sha,parents:[head]})}));
  await run(gh,['api','--method','PATCH',`repos/${repo}/git/refs/heads/main`,'--input','-'],{input:JSON.stringify({sha:newCommit.sha,force:false})});
  await run(gh,['api','--method','PUT',`repos/${repo}/pages`,'-f','build_type=workflow']);
  checkpoint.source=true;await save(checkpointFile,checkpoint);console.log('Source and Pages workflow published');
}
let release=JSON.parse(await run(gh,['api',`repos/${repo}/releases?per_page=100`])).find(x=>x.tag_name===tag);
if(!release){await run(gh,['release','create',tag,'--repo',repo,'--draft','--title',`Live2D Library: ${modelCount} characters`,'--notes',`${modelCount} complete Live2D runtime bundles and matching static covers synced from the Live2D Feishu sheet.`]);release=JSON.parse(await run(gh,['api',`repos/${repo}/releases?per_page=100`])).find(x=>x.tag_name===tag);}
if(!release)throw Error('Release creation did not return the requested tag');
const partSize=16*1024*1024,chunkSize=2*1024*1024,parts=[];
for(let offset=0,index=0;offset<bundle.length;offset+=partSize,index++){
  const name=`live2d-site.zip.part-${String(index).padStart(3,'0')}`,bytes=bundle.subarray(offset,offset+partSize);
  const complete=release.assets.some(a=>a.name===name&&a.size===bytes.length&&a.state==='uploaded');
  for(const asset of release.assets.filter(a=>complete?a.name.startsWith(`${name}.chunk-`):a.name===name))await run(gh,['api','--method','DELETE',`repos/${repo}/releases/assets/${asset.id}`]);
  if(complete)continue;
  for(let start=0,chunk=0;start<bytes.length;start+=chunkSize,chunk++){
    const chunkName=`${name}.chunk-${String(chunk).padStart(3,'0')}`,file=join(root,'.sync',chunkName),data=bytes.subarray(start,start+chunkSize);
    await writeFile(file,data);
    if(!release.assets.some(a=>a.name===chunkName&&a.size===data.length&&a.state==='uploaded'))parts.push({name:chunkName,file});
  }
}
let nextPart=0;
const results=await Promise.allSettled(Array.from({length:Math.min(4,parts.length)},async()=>{
  while(nextPart<parts.length){const part=parts[nextPart++];console.log(`Uploading ${part.name}`);
    for(let attempt=1;attempt<=3;attempt++){
      try{await run(gh,['release','upload',tag,part.file,'--repo',repo,'--clobber'],{env:{...process.env,GODEBUG:'http2client=0'}});break;}
      catch(error){if(attempt===3)throw error;console.log(`Retry ${attempt}: ${part.name}`);await new Promise(resolve=>setTimeout(resolve,2000*attempt));}
    }
    console.log(`Uploaded ${part.name}`);
  }
}));
const failures=results.filter(result=>result.status==='rejected');if(failures.length)throw new AggregateError(failures.map(result=>result.reason),'Release uploads failed; completed chunks are resumable');
checkpoint.upload=true;await save(checkpointFile,checkpoint);console.log('Asset archive uploaded');
if(release.draft)await run(gh,['release','edit',tag,'--repo',repo,'--draft=false']);
await run(gh,['workflow','run','pages.yml','--repo',repo,'--ref','main','-f',`release_tag=${tag}`]);
console.log(`Pages deployment triggered from ${tag}`);
