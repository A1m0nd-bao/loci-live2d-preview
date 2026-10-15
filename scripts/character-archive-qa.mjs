import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import { join } from 'node:path';
import { serve } from './serve.mjs';
import { launchBrowser } from './browser.mjs';
import { json, root } from './common.mjs';

// Browser plugin is unavailable; exercise the same deployed paths with Playwright.
const server=serve(0);await once(server,'listening');
const prefix='/loci-live2d-preview/';
const proxy=createServer((req,res)=>{
  if(!req.url.startsWith(prefix)){res.writeHead(404);res.end();return;}
  const upstream=request({hostname:'127.0.0.1',port:server.address().port,path:'/'+req.url.slice(prefix.length),method:req.method},response=>{
    res.writeHead(response.statusCode,response.headers);response.pipe(res);
  });upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);
});proxy.listen(0,'127.0.0.1');await once(proxy,'listening');
const base=process.env.QA_URL||`http://127.0.0.1:${proxy.address().port}${prefix}`;
const output=join(root,'.qa','character-archive');await mkdir(output,{recursive:true});
const profiles=(await json(join(root,'personas/100-character-personas.json'))).characters;
const english=(await json(join(root,'personas/100-character-personas.en.json'))).characters;
const first=profiles[0],last=profiles[99],errors=[],failed=[],checks=[];
const browser=await launchBrowser();
async function canvasPixels(page){return page.locator('#detailCanvas').evaluate(canvas=>{
  const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');
  const bytes=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
  gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
  let visible=0,hash=0;for(let i=0;i<bytes.length;i+=4){if(bytes[i+3])visible++;hash=(hash+bytes[i]*(i+1)+bytes[i+1]*7+bytes[i+2]*13)>>>0;}
  return {visible,hash};
});}
async function noOverflow(page){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal page overflow');}
try{
  for(const viewport of [{width:1440,height:1000},{width:390,height:844},{width:320,height:720}]){
    const page=await browser.newPage({viewport});page.on('pageerror',error=>errors.push(error.message));
    page.on('response',response=>{if(response.status()>=400&&!response.url().endsWith('favicon.ico'))failed.push(`${response.status()} ${response.url()}`);});
    const goto=path=>page.goto(new URL(path,base).href,{waitUntil:'domcontentloaded'});
    await goto('personas/');await page.waitForFunction(()=>document.querySelectorAll('.character').length===100);
    assert.equal(await page.locator('header nav a').count(),3);await noOverflow(page);
    const identities=await page.locator('.character').evaluateAll(cards=>cards.map(card=>({id:card.dataset.modelId,src:card.querySelector('img').getAttribute('src')})));
    assert.deepEqual(identities,profiles.map(c=>({id:c.modelId,src:c.artwork})));
    await page.locator('.character .visual img').evaluateAll(images=>Promise.all(images.filter(img=>img.getBoundingClientRect().top<innerHeight).map(img=>img.decode())));
    await page.screenshot({path:join(output,`gallery-${viewport.width}.png`)});
    await page.locator('.character .visual').first().click();await page.waitForSelector('#profile[open]');
    assert.equal(await page.locator('#profileTitle').textContent(),first.name);
    assert.equal(await page.locator('#profileDescription').textContent(),first.description);
    assert.equal(await page.locator('#profileImage').getAttribute('src'),first.artwork);
    assert.equal(await page.locator('#live2d').getAttribute('href'),'../?model='+encodeURIComponent(first.modelId));
    await page.locator('#profileImage').evaluate(img=>img.decode());
    assert(await page.locator('#profile').evaluate(dialog=>dialog.scrollWidth<=dialog.clientWidth),'Dialog overflows');
    const header=await page.locator('.dialog-header').boundingBox(),body=await page.locator('.dialog-body').boundingBox();
    assert(body.y>=header.y+header.height-1,'Dialog header overlaps contents');
    await page.screenshot({path:join(output,`profile-${viewport.width}.png`)});
    await page.locator('#detailLanguage').selectOption('en');
    assert.equal(await page.locator('#profileTitle').textContent(),english[0].name);
    assert.equal(await page.locator('#profileDescription').textContent(),english[0].description);
    assert.equal(await page.locator('#profileImage').getAttribute('src'),first.artwork);
    const downloadPromise=page.waitForEvent('download');await page.locator('#downloadImage').click();
    const download=await downloadPromise;assert.equal(await download.failure(),null);assert.equal(download.suggestedFilename(),'001-illustration.png');
    await page.locator('#close').click();await page.locator('#language').selectOption('zh');
    await page.locator('[data-view="portrait"]').click();
    assert.equal(await page.locator('.character img').first().getAttribute('src'),first.portrait);
    await page.locator('.character .visual').first().click();
    assert.equal(await page.locator('#profileImage').getAttribute('src'),first.portrait);await page.keyboard.press('Escape');
    await page.locator('#batch').selectOption('new-21');assert.equal(await page.locator('.character').count(),21);
    await page.locator('#batch').selectOption('original-79');assert.equal(await page.locator('.character').count(),79);
    await page.locator('#batch').selectOption('');await page.locator('#genre').selectOption('fantasy');
    assert.equal(await page.locator('.character').count(),profiles.filter(c=>c.genre==='奇幻').length);
    await page.locator('#genre').selectOption('');await page.locator('#search').fill('zz-no-such-character-zz');
    assert.equal(await page.locator('.character').count(),0);assert(await page.locator('#empty').isVisible());
    await page.locator('#search').fill(last.modelId);assert.equal(await page.locator('.character').count(),1);
    for(const [path,language] of [['100-character-personas.html','zh'],['100-character-personas.en.html','en'],['artwork/illustrations.html','zh']]){
      await goto(`personas/${path}?character=${encodeURIComponent(last.modelId)}`);
      await page.waitForSelector('#profile[open]');assert.equal(await page.locator('#language').inputValue(),language);
      assert.equal(await page.locator('#profileTitle').textContent(),language==='en'?english[99].name:last.name);
      assert.equal(await page.locator('#profileImage').getAttribute('src'),last.artwork);
    }
    await goto('personas/backgrounds/common-scenes-v1/');await page.waitForSelector('.item');
    assert.equal(await page.locator('.item').count(),8);
    assert.equal(await page.locator('header nav a', {hasText:'角色档案'}).count(),1);
    assert.equal(await page.locator('header nav a', {hasText:'角色插画'}).count(),0);await noOverflow(page);
    await goto('?model='+encodeURIComponent(first.modelId));await page.waitForFunction(()=>document.querySelector('#detailDialog')?.open&&document.querySelector('#stageState')?.textContent==='LIVE2D'&&document.querySelector('#stageMessage')?.hidden,null,{timeout:90000});
    assert.equal(await page.locator('.collection-nav a').count(),3);
    assert.equal(await page.locator('#personaLink').getAttribute('href'),'personas/?character='+encodeURIComponent(first.modelId));
    assert.equal(await page.locator('#detailScene option').count(),9);
    let before=await canvasPixels(page);
    for(let n=0;n<40&&before.visible<15000;n++){await page.waitForTimeout(250);before=await canvasPixels(page);}
    assert(before.visible>15000,'Live2D canvas is blank');
    await page.waitForTimeout(500);const after=await canvasPixels(page);assert.notEqual(before.hash,after.hash,'Live2D is not moving');
    await page.locator('#detailScene').selectOption({index:4});await page.waitForFunction(()=>!document.querySelector('#sceneImage').hidden);
    await page.locator('#sceneImage').evaluate(img=>img.decode());
    assert(await page.locator('#detailError').isHidden());await noOverflow(page);
    await page.screenshot({path:join(output,`live2d-${viewport.width}.png`)});
    await page.locator('#checker').click();assert(await page.locator('#sceneImage').isHidden());
    await page.locator('#personaLink').click();await page.waitForSelector('#profile[open]');
    assert.equal(await page.locator('#profileTitle').textContent(),first.name);
    checks.push({viewport,characters:100,profiles:'zh/en',legacyRedirects:3,backgrounds:8,live2dPixels:before.visible});
    await page.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
  console.log(JSON.stringify({base,checks,errors,failed,screenshots:output},null,2));
}finally{
  await browser.close();proxy.closeAllConnections();server.closeAllConnections();await Promise.all([new Promise(done=>proxy.close(done)),new Promise(done=>server.close(done))]);
}
