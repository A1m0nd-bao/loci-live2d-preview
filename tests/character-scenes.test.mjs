import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { root, json } from '../scripts/common.mjs';

test('profiles, selected illustrations and runtime models have the same 100 stable identities',async()=>{
  const profiles=await json(join(root,'personas/100-character-personas.json'));
  const english=await json(join(root,'personas/100-character-personas.en.json'));
  const manifest=await json(join(root,'manifest.json'));
  const identities=new Set(manifest.items.map(item=>item.id));
  assert.equal(profiles.characters.length,100);assert.equal(english.characters.length,100);
  assert.equal(new Set(profiles.characters.map(c=>c.modelId)).size,100);
  for(const c of profiles.characters){
    assert(identities.has(c.modelId));const en=english.characters.find(item=>item.index===c.index);
    assert.equal(en.modelId,c.modelId);assert.equal(en.artwork,c.artwork);
    await access(join(root,'personas',c.artwork));await access(join(root,'personas',c.portrait));
  }
});
test('all eight scene backgrounds are local PNGs and exist in the published tree',async()=>{
  const catalog=await json(join(root,'scene-backgrounds.json'));
  assert.equal(catalog.items.length,8);assert.equal(new Set(catalog.items.map(item=>item.id)).size,8);
  for(const scene of catalog.items){
    assert(scene.image.startsWith('./personas/backgrounds/'));
    const bytes=await readFile(join(root,scene.image));assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16),scene.width);assert.equal(bytes.readUInt32BE(20),scene.height);
  }
});
test('public pages do not retain private generation filesystem paths',async()=>{
  for(const path of ['index.html','character-archive.js','100-character-personas.html','100-character-personas.en.html','artwork/illustrations.html','backgrounds/common-scenes-v1/index.html','backgrounds/common-scenes-v1/generation-plan.json']){
    const text=await readFile(join(root,'personas',path),'utf8');assert(!text.includes('/Users/'));
  }
});
test('old resource links redirect to one archive, preserving English and illustration intent',async()=>{
  for(const [path,target,attribute] of [
    ['100-character-personas.html','index.html','data-locale="zh"'],
    ['100-character-personas.en.html','index.html','data-locale="en"'],
    ['artwork/illustrations.html','../index.html','data-view="illustration"']
  ]){
    const html=await readFile(join(root,'personas',path),'utf8');
    assert(html.includes(`data-target="${target}"`));assert(html.includes(attribute));
    assert(!html.includes('id="data"'),'Legacy page must not retain a separate catalog');
  }
  const redirect=await readFile(join(root,'personas/archive-redirect.js'),'utf8');
  assert(redirect.includes('location.replace'));assert(redirect.includes('target.search=params.toString()'));
});
