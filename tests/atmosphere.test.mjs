import test from 'node:test';
import assert from 'node:assert/strict';
import { AtmosphereMath } from '../atmosphere.js';
import { ModelPlayer } from '../player.js';
function sample(width,height,pixel){const data=[];for(let y=0;y<height;y++)for(let x=0;x<width;x++)data.push(...pixel(x,y));return{width,height,data};}
test('background direction and skin tint follow warm-left / cool-right light',()=>{
  const warm=AtmosphereMath.profile(sample(64,64,(x,y)=>x<20&&y<20?[255,180,80,255]:[20,10,5,255]),1);
  const cool=AtmosphereMath.profile(sample(64,64,(x,y)=>x>44&&y>44?[70,180,255,255]:[5,10,25,255]),1);
  assert(warm.ambient[0]>warm.ambient[2]);assert(warm.direction[0]<0&&warm.direction[1]<0);
  assert(cool.ambient[2]>cool.ambient[0]);assert(cool.direction[0]>0&&cool.direction[1]>0);
});
test('bright objects outside the visible portrait crop do not light the character',()=>{
  const data=sample(128,32,x=>x<20?[255,255,255,255]:[0,0,0,255]);
  const visible=AtmosphereMath.profile(data,.2);assert.equal(visible.brightness,0);assert.match(visible.summary,/暗环境/);
});
test('one-pixel, black, white and transparent backgrounds produce finite shader inputs',()=>{
  for(const color of [[0,0,0,255],[255,255,255,255],[255,0,0,0]]){
    const p=AtmosphereMath.profile(sample(1,1,()=>color),.1,1);
    for(const key of ['ambient','key','light','direction','threshold'])assert(p[key].every(Number.isFinite));
    assert.match(p.summary,/均匀光/);
  }
});
test('focus centers an offset face across portrait, square and wide stages',()=>{
  for(const [width,height] of [[390,600],[800,800],[1200,700]]){
    const model={x:0,y:0,scale:{x:1,set(v){this.x=v;}},position:{set(x,y){model.x=x;model.y=y;}}};
    const player=Object.assign(Object.create(ModelPlayer.prototype),{model,zoom:1,focusSize:1,atmosphere:{progress:1},app:{screen:{width,height}},
      bounds:{left:335,top:126,width:360,height:768},face:{x:513.5,y:195.9,head:{left:469,right:557,top:126,bottom:228}}});
    player.fit();assert(Math.abs(model.x+player.face.x*model.scale.x-width/2)<.001);
    assert(Math.abs(model.y+player.face.y*model.scale.x-height*.46)<.001);
    assert(model.y+player.face.head.top*model.scale.x>0);
    assert(model.x+player.face.head.left*model.scale.x>0);
    assert(model.x+player.face.head.right*model.scale.x<width);
  }
});
