import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, unzipSync, strToU8 } from 'fflate';
import { safePath, resourcePath, inspectModel, unzipPackage } from '../model-files.js';
import { fileRefs } from '../scripts/sheet-cells.mjs';

const manifest={Version:3,FileReferences:{Moc:'body.moc3',Textures:['textures/0.png'],Motions:{Idle:[{File:'motions/idle.motion3.json'}]},Physics:'physics.json'}};
test('complete nested model bundle preserves relative resources',()=>{
  const files=unzipPackage(zipSync({'Role/model.model3.json':strToU8(JSON.stringify(manifest)),'Role/body.moc3':strToU8('MOC3'),'Role/textures/0.png':new Uint8Array([0]),'Role/motions/idle.motion3.json':strToU8('{}'),'Role/physics.json':strToU8('{}'),'__MACOSX/._Role':strToU8('ignored')}),unzipSync);
  const meta=inspectModel('Role/model.model3.json',manifest,files);assert.equal(meta.motionCount,1);assert.equal(meta.hasPhysics,true);assert.equal(files.size,5);
});
test('incomplete model reports the missing dependency before import',()=>{assert.throws(()=>inspectModel('Role/model.model3.json',manifest,new Map([['Role/body.moc3',true]])),/textures\/0.png/);});
test('relative parent references stay inside selected model package',()=>{assert.equal(resourcePath('Role/sub/model.model3.json','../body.moc3'),'Role/body.moc3');assert.throws(()=>resourcePath('model.model3.json','../escape.moc3'),/超出/);});
test('archive traversal and external dependencies are rejected',()=>{for(const name of ['../escape','/etc/escape','C:\\escape','folder/../../escape'])assert.throws(()=>safePath(name));assert.throws(()=>resourcePath('Role/model.model3.json','https://example.com/model.moc3'));assert.throws(()=>unzipPackage(zipSync({'../escape.moc3':strToU8('x')}),unzipSync));});
test('Feishu rich-text attachment survives displayed filename conversion',()=>{
  const cell={value:'角色.zip',rich_text:[{type:'attachment',attachment_token:'boxFixture123',file_size:1234,mime_type:'application/zip',text:'角色.zip'}]};
  assert.deepEqual(fileRefs(cell),[{token:'boxFixture123',name:'角色.zip',size:1234,modified:'',mime:'application/zip'}]);
});
