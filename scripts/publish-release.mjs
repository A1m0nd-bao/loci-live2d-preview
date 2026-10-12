import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { zipSync } from 'fflate';
import { root, run, json, save } from './common.mjs';

const gh='/opt/homebrew/bin/gh',repo='A1m0nd-bao/loci-live2d-preview';
const files={};
const htmlFiles=['index.html','styles.css','app.js','player.js','model-files.js','layers.js','manifest.json','.nojekyll'];
for(const name of htmlFiles)files[name]=await readFile(join(root,name));
async function collect(dir){for(const entry of await readdir(join(root,dir),{withFileTypes:true})){if(entry.name.startsWith('.'))continue;const name=`${dir}/${entry.name}`;if(entry.isDirectory())await collect(name);else files[name]=await readFile(join(root,name));}}
for(const dir of ['vendor','assets','packages','posters'])await collect(dir);
const bundle=zipSync(files,{level:0,mtime:new Date('2026-10-12T00:00:00Z')});
const hash=createHash('sha256').update(bundle).digest('hex').slice(0,12);
const tag=`library-${hash}`,archive=join(root,'.sync/live2d-site.zip');await mkdir(join(root,'.sync'),{recursive:true});await writeFile(archive,bundle);
console.log(`Release bundle: ${(bundle.length/1024/1024).toFixed(1)} MB, ${tag}`);

const checkpointFile=join(root,'.sync/release-publish.json');const checkpoint=await json(checkpointFile,{});
if(checkpoint.tag!==tag){checkpoint.tag=tag;checkpoint.source=false;checkpoint.upload=false;await save(checkpointFile,checkpoint);}
if(!checkpoint.source){
  // Publish source in one commit on the current remote history; large model binaries stay in the release artifact.
  const sourceNames=['index.html','styles.css','app.js','player.js','model-files.js','layers.js','render.html','render.js','manifest.json','README.md','package.json','package-lock.json','lark-sync.config.json','.gitignore','.nojekyll','.github/workflows/pages.yml'];
  for(const dir of ['scripts','tests'])for(const file of await readdir(join(root,dir)))if(!file.startsWith('.'))sourceNames.push(`${dir}/${file}`);
  const head=JSON.parse(await run(gh,['api',`repos/${repo}/git/ref/heads/main`])).object.sha;
  const commit=JSON.parse(await run(gh,['api',`repos/${repo}/git/commits/${head}`]));
  const tree=sourceNames.map(path=>({path,mode:'100644',type:'blob',content:null}));for(const entry of tree)entry.content=await readFile(join(root,entry.path),'utf8');
  const newTree=JSON.parse(await run(gh,['api','--method','POST',`repos/${repo}/git/trees`,'--input','-'],{input:JSON.stringify({base_tree:commit.tree.sha,tree})}));
  const newCommit=JSON.parse(await run(gh,['api','--method','POST',`repos/${repo}/git/commits`,'--input','-'],{input:JSON.stringify({message:'Publish 79 Live2D models via release-backed Pages deployment',tree:newTree.sha,parents:[head]})}));
  await run(gh,['api','--method','PATCH',`repos/${repo}/git/refs/heads/main`,'--input','-'],{input:JSON.stringify({sha:newCommit.sha,force:false})});
  await run(gh,['api','--method','PUT',`repos/${repo}/pages`,'-f','build_type=workflow']);
  checkpoint.source=true;await save(checkpointFile,checkpoint);console.log('Source and Pages workflow published');
}
let release;
try{release=JSON.parse(await run(gh,['api',`repos/${repo}/releases/tags/${tag}`]));}catch(error){if(!/404|Not Found/.test(error.message))throw error;}
if(!release){await run(gh,['release','create',tag,'--repo',repo,'--draft','--title','Live2D Library: 79 characters','--notes','79 complete Live2D runtime bundles and matching static covers synced from the Live2D Feishu sheet.']);release=JSON.parse(await run(gh,['api',`repos/${repo}/releases/tags/${tag}`]));}
if(!release.assets.some(a=>a.name==='live2d-site.zip'&&a.size===bundle.length)){
  await run(gh,['release','upload',tag,archive,'--repo',repo,'--clobber']);
}
checkpoint.upload=true;await save(checkpointFile,checkpoint);console.log('Asset archive uploaded');
if(release.draft)await run(gh,['release','edit',tag,'--repo',repo,'--draft=false']);
else await run(gh,['workflow','run','pages.yml','--repo',repo,'-f',`release_tag=${tag}`]);
console.log(`Pages deployment triggered from ${tag}`);
