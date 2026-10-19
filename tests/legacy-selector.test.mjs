import test from 'node:test';
import assert from 'node:assert/strict';
import { createLegacyController } from '../legacy-selector.js';

const parameters = ['ParamHideBaseArms','ParamAction_1','ParamAction_2'].map(id=>({id,min:0,max:1,defaultValue:0}));
function clip(action=1) {
  return { Meta:{Duration:2.1}, Curves:parameters.map(p=>({Target:'Parameter',Id:p.id,Segments:
    p.id==='ParamHideBaseArms'||p.id===`ParamAction_${action}` ? [0,0,2,.28,1,2,1.92,0,2,2.1,0] : [0,0,2,2.1,0]})) };
}
const plain = map => Object.fromEntries(map);
test('legacy action and hide switch in the same frame with exclusive ownership',()=>{
  const c=createLegacyController(parameters); c.start(c.compile(clip(1)),0);
  assert.deepEqual(plain(c.sample(279)),{ParamHideBaseArms:0,ParamAction_1:0,ParamAction_2:0});
  assert.deepEqual(plain(c.sample(280)),{ParamHideBaseArms:1,ParamAction_1:1,ParamAction_2:0});
  assert.deepEqual(plain(c.sample(1920)),{ParamHideBaseArms:0,ParamAction_1:0,ParamAction_2:0});
});
test('interruptions clear the previous action rather than blending two arms',()=>{
  const c=createLegacyController(parameters); c.start(c.compile(clip(1)),0); c.sample(900);
  c.start(c.compile(clip(2)),900);
  assert.equal(c.sample(900).get('ParamAction_1'),0);
  assert.deepEqual(plain(c.sample(1180)),{ParamHideBaseArms:1,ParamAction_1:0,ParamAction_2:1});
  for(const v of c.sample(3100).values()) assert.equal(v,0);
});
test('neutral clips and reset clear all hidden base arms',()=>{
  const c=createLegacyController(parameters), idle=clip();
  for(const curve of idle.Curves) curve.Segments=[0,0,2,2.1,0];
  c.start(c.compile(clip()),0); c.sample(900); c.start(c.compile(idle),900);
  for(const v of c.sample(1000).values())assert.equal(v,0);
  c.start(c.compile(clip()),0); c.reset(); for(const v of c.sample(900).values())assert.equal(v,0);
});
test('linear fades, incomplete tracks, overlap, mismatched hide, and non-neutral endings are rejected',()=>{
  const c=createLegacyController(parameters);
  for(const mutate of [
    x=>x.Curves[0].Segments[2]=0,
    x=>x.Curves.pop(),
    x=>x.Curves[2].Segments=[...x.Curves[1].Segments],
    x=>x.Curves[0].Segments=[0,0,2,2.1,0],
    x=>x.Curves[1].Segments[x.Curves[1].Segments.length-1]=1,
  ]) {const x=clip();mutate(x);assert.throws(()=>c.compile(x));}
});
test('unsupported model ranges fail closed',()=>{
  assert.throws(()=>createLegacyController(parameters.map(p=>({...p,max:2}))));
  assert.throws(()=>createLegacyController(parameters.slice(1)));
});
