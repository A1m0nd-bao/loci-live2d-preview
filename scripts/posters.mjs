import { writeFile, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, json } from './common.mjs';
import { serve } from './serve.mjs';
import { launchBrowser } from './browser.mjs';
import { generateManifest } from './generate-manifest.mjs';
export async function generatePosters(){
  const manifest=await json(join(root,'manifest.json'));
  const missing=[];for(const item of manifest.items){if(item.hidden||item.poster)continue;try{await stat(join(root,'posters',`${item.id}.png`));}catch{missing.push(item);}}
  if(!missing.length)return;
  const server=serve(0);await new Promise(resolve=>server.once('listening',resolve));let browser;const failures=[];
  try{
    browser=await launchBrowser();const page=await browser.newPage({viewport:{width:480,height:600},deviceScaleFactor:1});
    await page.goto(`http://127.0.0.1:${server.address().port}/render.html`);await page.waitForFunction(()=>typeof window.captureModel==='function');
    await mkdir(join(root,'posters'),{recursive:true});
    for(const item of missing){try{const data=await page.evaluate(item=>window.captureModel(item),item);await writeFile(join(root,'posters',`${item.id}.png`),Buffer.from(data.split(',')[1],'base64'));console.log(`[posters] ${item.name}`);}catch(e){failures.push(item.name);console.error(`[posters] ${item.name}: ${e.message}`);}}
    await generateManifest();
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
  if(failures.length)throw Error(`封面渲染失败：${failures.join(', ')}。请核对运行模型与 Web SDK 兼容性。`);
}
if(import.meta.url===pathToFileURL(process.argv[1]).href)await generatePosters();
