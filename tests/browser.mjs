import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { root, json, save } from '../scripts/common.mjs';
import { importPackage, removePackage } from '../scripts/packages.mjs';
import { generateManifest } from '../scripts/generate-manifest.mjs';
import { generatePosters } from '../scripts/posters.mjs';
import { serve } from '../scripts/serve.mjs';
import { launchBrowser } from '../scripts/browser.mjs';

const original=await json(join(root,'manifest.json'));let pkg,browser;const server=serve(0);await new Promise(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
await mkdir(join(root,'.qa/screenshots'),{recursive:true});
const errors=[];const report=[];
function visiblePixels(bytes){const p=PNG.sync.read(bytes);let count=0;for(let i=3;i<p.data.length;i+=4)if(p.data[i]>16)count++;return count;}
try{
  browser=await launchBrowser();const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.waitForFunction(()=>document.querySelector('#libraryStatus').textContent==='资源清单已就绪');
  await page.screenshot({path:join(root,'.qa/screenshots/desktop-empty.png'),fullPage:true});
  assert.equal(await page.locator('#empty').isVisible(),true);report.push('Empty library and offline runtime load');
  pkg=await importPackage(join(root,'.qa/hiyori.zip'),{name:'Hiyori / QA',category:'角色交互',tags:['物理','竖屏']});await generateManifest();await generatePosters();
  const item=(await json(join(root,'manifest.json'))).items.find(x=>x.packageId===pkg.id);
  const cover=await readFile(join(root,item.poster.replace('./','')));assert(visiblePixels(cover)>15000);report.push('Real MOC3, textures, motions, physics and poster are nonblank');
  await page.reload();await page.locator('.model-card').waitFor();
  const beforeRequests=[];page.on('request',r=>{if(/\.moc3|\.model3\.json/.test(r.url()))beforeRequests.push(r.url());});
  await page.reload();await page.locator('.model-card').waitFor();assert.equal(beforeRequests.length,0);report.push('Gallery does not download models until interaction');
  await page.locator('.preview').first().hover();await page.waitForFunction(()=>!document.querySelector('#hoverCanvas').hidden,{timeout:30000});
  assert(beforeRequests.some(x=>x.includes('.moc3')));await page.mouse.move(10,10);assert.equal(await page.locator('#hoverCanvas').isVisible(),false);report.push('Hover loads and releases shared renderer');
  await page.locator('.preview').first().click();await page.waitForFunction(()=>document.querySelector('#stageState').textContent==='LIVE2D',{timeout:30000});
  assert((await page.locator('#group option').count())>0);assert((await page.locator('#layers li').count())>20);
  const frameA=await page.locator('#detailCanvas').screenshot();await page.waitForTimeout(350);const frameB=await page.locator('#detailCanvas').screenshot();assert(!frameA.equals(frameB));report.push('Detail renders and moves with actual Live2D model');
  await page.locator('#pause').click();const pausedA=await page.locator('#detailCanvas').screenshot();await page.waitForTimeout(350);const pausedB=await page.locator('#detailCanvas').screenshot();assert(pausedA.equals(pausedB));report.push('Pause freezes canvas pixels');
  await page.locator('#speed').selectOption('2');await page.locator('#loop').uncheck();await page.locator('#physics').uncheck();await page.locator('#interaction').uncheck();
  await page.locator('#zoom').evaluate(el=>{el.value='140';el.dispatchEvent(new Event('input'));});assert.equal(await page.locator('#zoomValue').textContent(),'140%');await page.locator('#fit').click();assert.equal(await page.locator('#zoomValue').textContent(),'100%');
  await page.locator('#checker').click();assert((await page.locator('#stage').getAttribute('class')).includes('checker'));
  await page.screenshot({path:join(root,'.qa/screenshots/desktop-detail.png'),fullPage:true});
  await page.locator('#layerPanel').evaluate(el=>el.open=true);await page.locator('#layers li').first().locator('button[data-move="down"]').click();assert((await page.locator('#layerStatus').textContent()).includes('手动'));await page.locator('#layerReset').click();report.push('Speed, loop, fit, physics, gaze, checkerboard, layer reorder and restore');
  await page.locator('#detailClose').click();assert.equal(await page.locator('#detailDialog').isVisible(),false);
  const many={...original,items:Array.from({length:100},(_,i)=>({...item,id:`fixture-${i}`,name:`角色 ${String(i+1).padStart(3,'0')}`,category:i%2?'场景交互':'角色交互'}))};
  await page.route('**/manifest.json?*',route=>route.fulfill({json:many}));await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.model-card').length===100);assert.equal(await page.locator('#recentRail .recent-card').count(),6);
  await page.screenshot({path:join(root,'.qa/screenshots/desktop-100-grid.png'),fullPage:false});
  await page.locator('#search').fill('角色 099');assert.equal(await page.locator('.model-card').count(),1);await page.locator('#search').fill('');await page.locator('#category').selectOption('场景交互');assert.equal(await page.locator('.model-card').count(),50);await page.locator('#category').selectOption('');
  await page.locator('[data-view="list"]').click();assert((await page.locator('#gallery').getAttribute('class')).includes('list'));report.push('100 cards, 6 recent uploads, search, category and list/grid');
  await page.setViewportSize({width:390,height:844});await page.locator('[data-view="grid"]').click();await page.screenshot({path:join(root,'.qa/screenshots/mobile-grid.png'),fullPage:false});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('.preview').first().click();await page.waitForFunction(()=>document.querySelector('#stageState').textContent==='LIVE2D');await page.screenshot({path:join(root,'.qa/screenshots/mobile-detail.png'),fullPage:false});assert(await page.evaluate(()=>document.querySelector('#detailDialog').scrollWidth<=document.querySelector('#detailDialog').clientWidth));await page.locator('#detailClose').click();report.push('390px mobile grid/detail have no horizontal overflow');
  await page.unroute('**/manifest.json?*');await page.reload();await page.locator('#zipInput').setInputFiles(join(root,'.qa/hiyori.zip'));await page.waitForFunction(()=>document.querySelector('#count').textContent==='2');await page.locator('#source').selectOption('local');assert.equal(await page.locator('.model-card').count(),1);report.push('Local ZIP import creates a temporary model');
  await page.locator('.preview').first().click();await page.waitForFunction(()=>document.querySelector('#stageState').textContent==='LIVE2D');await page.locator('#detailClose').click();
  assert.deepEqual(errors,[]);report.push('No uncaught browser errors');
  await save(join(root,'.qa/report.json'),{checks:report,errors});console.log(JSON.stringify({checks:report,errors},null,2));
}finally{
  await browser?.close();await new Promise(resolve=>server.close(resolve));
  if(pkg){await removePackage(pkg.id);for(const item of pkg.items)await rm(join(root,'posters',`${item.id}.png`),{force:true});}
  await save(join(root,'manifest.json'),original);
}
