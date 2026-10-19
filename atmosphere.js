/* Image-space lighting and GPU bloom. All assets stay in this browser. */
'use strict';
const AtmosphereMath = (() => {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const luminance = c => c[0]*.2126+c[1]*.7152+c[2]*.0722;
  function profile(sample, aspect, focus = 0) {
    const {width, height, data} = sample, ratio = width/height;
    const crop = [Math.min(1,aspect/ratio),Math.min(1,ratio/aspect)].map(v=>v*(.96-.17*focus));
    const center = [.5+.012*focus,.5-.025*focus], colors=[], positions=[], values=[], total=[0,0,0];
    for (let y=0;y<height;y++) for(let x=0;x<width;x++) {
      const screen=[((x+.5)/width-center[0])/crop[0]+.5,((y+.5)/height-center[1])/crop[1]+.5];
      if(screen.some(v=>v<0||v>1))continue;
      const i=(y*width+x)*4, alpha=data[i+3]/255;
      const color=[data[i],data[i+1],data[i+2]].map(v=>v/255*alpha);
      colors.push(color);positions.push(screen);values.push(luminance(color));color.forEach((v,j)=>total[j]+=v);
    }
    if(!colors.length) {
      const i=(Math.floor(height/2)*width+Math.floor(width/2))*4;
      const c=[data[i],data[i+1],data[i+2]].map(v=>v/255*data[i+3]/255);
      colors.push(c);positions.push([.5,.5]);values.push(luminance(c));c.forEach((v,j)=>total[j]=v);
    }
    const count=colors.length, meanColor=total.map(v=>v/count), mean=values.reduce((a,b)=>a+b,0)/count;
    const sorted=[...values].sort((a,b)=>a-b), percentile=sorted[Math.floor((count-1)*.7)];
    const bright=[0,0,0], pos=[0,0];let mass=0, variance=0;
    colors.forEach((color,i)=>{
      const weight=Math.max(0,values[i]-percentile)**2;
      color.forEach((v,j)=>bright[j]+=v*weight);pos.forEach((v,j)=>pos[j]+=(positions[i][j]-.5)*weight);
      mass+=weight;variance+=(values[i]-mean)**2;
    });
    const brightColor=mass>.0001?bright.map(v=>v/mass):meanColor;
    const centroid=mass>.0001?pos.map(v=>v/mass):[0,0], distance=Math.hypot(...centroid), contrast=Math.min(1,Math.sqrt(variance/count)*3);
    const directional=distance>.07&&contrast>.08, direction=directional?centroid.map(v=>v/distance):[0,-1];
    const scale=.52+.52*Math.sqrt(mean), tint=meanColor.map(v=>clamp(v/Math.max(.08,mean),.6,1.35));
    const ambient=tint.map(v=>clamp((1+(v-1)*.38)*scale,.35,1.08));
    const light=brightColor.map(v=>v/Math.max(.08,...brightColor));
    const low=clamp(.13+mean*.36+percentile*.08,.13,.55);
    const level=mean<.28?'暗环境':mean>.57?'明亮环境':'柔和环境';
    const color=ambient[0]-ambient[2]>.035?'偏暖':ambient[0]-ambient[2]<-.035?'偏冷':'中性';
    const side=(direction[0]>.3?'右':direction[0]<-.3?'左':'')+(direction[1]>.3?'下':direction[1]<-.3?'上':'');
    return {ambient,key:light.map(v=>v*(directional?.035+.12*contrast:0)),light,direction,rim:directional?.02+.035*contrast:0,
      threshold:[low,Math.min(.95,low+.26+.12*mean)],brightness:mean,summary:`${level} · ${color} · ${directional?'主光'+side:'均匀光'}`};
  }
  function sampleImage(image) {
    const scale=Math.min(1,128/Math.max(image.width,image.height));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,canvas.width,canvas.height);
    return {width:canvas.width,height:canvas.height,data:ctx.getImageData(0,0,canvas.width,canvas.height).data};
  }
  return {clamp, profile, sampleImage};
})();

// Cubism parameter probes run once on load, never in the animation loop.
function locateFace(model, body) {
  const internal=model.internalModel, core=internal.coreModel, params=core.getModel().parameters;
  const make=()=>({left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity});
  const add=(b,x,y)=>{b.left=Math.min(b.left,x);b.right=Math.max(b.right,x);b.top=Math.min(b.top,y);b.bottom=Math.max(b.bottom,y);};
  const valid=b=>Number.isFinite(b.left)&&b.right>b.left&&b.bottom>b.top;
  const center=b=>[(b.left+b.right)/2,(b.top+b.bottom)/2];
  const meshBounds=index=>{
    const b=make(), vertices=internal.getDrawableVertices(index);
    for(let j=0;j<vertices.length;j+=2) {const p=internal.localTransform.apply(new PIXI.Point(vertices[j],vertices[j+1]));add(b,p.x,p.y);}
    return b;
  };
  const baseline=Array.from({length:core.getDrawableCount()},(_,i)=>new Float32Array(core.getDrawableVertices(i)));
  const opacities=baseline.map((_,i)=>core.getDrawableOpacity(i)), boxes=baseline.map((_,i)=>meshBounds(i));
  const saved=new Float32Array(params.values);
  const influenced=names=>{
    const b=make();
    try {
      for(const name of new Set(names)) {
        const index=params.ids.indexOf(name);if(index<0)continue;
        for(const value of [params.minimumValues[index],params.maximumValues[index]]) {
          params.values[index]=value;core.update();
          baseline.forEach((vertices,i)=>{
            const now=core.getDrawableVertices(i);
            const changed=Math.abs(core.getDrawableOpacity(i)-opacities[i])>.05||vertices.some((v,j)=>Math.abs(v-now[j])>.0001);
            if(changed) {add(b,boxes[i].left,boxes[i].top);add(b,boxes[i].right,boxes[i].bottom);}
          });
        }
        params.values[index]=saved[index];core.update();
      }
    } finally {params.values.set(saved);core.update();}
    return b;
  };
  const eyes=influenced(['ParamEyeLOpen','ParamEyeROpen','ParamEyeLeftOpen','ParamEyeRightOpen','ParamEyeBallX','ParamEyeBallY',...(internal.settings.getEyeBlinkParameters()||[])]);
  const mouth=influenced(['ParamMouthOpenY','ParamMouthOpen','MouthOpen','ParamMouthForm',...(internal.settings.getLipSyncParameters()||[])]);
  let head=influenced(['ParamAngleY','ParamHeadPitch','HeadPitch']);
  if(!valid(head))head=influenced(['ParamAngleX','ParamHeadYaw','HeadYaw']);
  let x,y,summary;
  if(valid(eyes)&&valid(mouth)&&center(eyes)[1]<center(mouth)[1]&&eyes.right-eyes.left<body.width*.7) {
    const eye=center(eyes), lip=center(mouth);x=eye[0];y=eye[1]+(lip[1]-eye[1])*.4;
    const unit=Math.max(eyes.right-eyes.left,(lip[1]-eye[1])*1.5);
    const local={left:x-unit*1.15,right:x+unit*1.15,top:y-unit*1.55,bottom:y+unit*.9};
    head=valid(head)?{left:Math.max(head.left,local.left),right:Math.min(head.right,local.right),top:Math.max(head.top,local.top),bottom:Math.min(head.bottom,local.bottom)}:local;
    if(!valid(head))head=local;
    summary='已根据眼睛与嘴部自动居中';
  } else {
    head=make();
    for(const area of internal.getHitAreaDefs())if(/head|face/i.test(area.name)&&area.index>=0) {
      const b=boxes[area.index];if(b){add(head,b.left,b.top);add(head,b.right,b.bottom);}
    }
    summary=valid(head)?'已根据头部区域自动居中':'估算角色上部，可用大小滑杆调整';
    if(!valid(head))head={left:body.left+body.width/2-body.height*.1,right:body.left+body.width/2+body.height*.1,top:body.top,bottom:body.top+body.height*.22};
    [x,y]=center(head);
  }
  return {x,y,head,summary};
}

class AtmosphereStage {
  constructor(app, callbacks = {}) {
    this.app=app;this.callbacks=callbacks;this.focus=0;this.focusTarget=0;this.time=0;this.gaze=[0,0];this.smoothGaze=[0,0];
    this.bloom=.55;this.settings={enabled:true,strength:1,exposure:0,warmth:0,direction:0};this.backgroundTicket=0;
    this.scene='moon';this.profile=null;this.profileKey='';this.texture=PIXI.Texture.WHITE;this.blurredBackground=PIXI.Texture.WHITE;this.sample=null;this.resetSize();
    const vertex=`precision highp float;attribute vec2 aVertexPosition;attribute vec2 aTextureCoord;uniform mat3 translationMatrix;uniform mat3 projectionMatrix;varying vec2 vUV;void main(){vUV=aTextureCoord;gl_Position=vec4((projectionMatrix*translationMatrix*vec3(aVertexPosition,1.)).xy,0.,1.);}`;
    const header=`precision highp float;varying vec2 vUV;uniform sampler2D person;uniform sampler2D background;uniform sampler2D blurredBackground;uniform sampler2D source;uniform sampler2D glow;uniform vec2 resolution;uniform vec2 bgSize;uniform vec2 gaze;uniform float focus;uniform float time;uniform float bloom;uniform vec3 ambient;uniform vec3 key;uniform vec3 light;uniform vec2 direction;uniform vec2 threshold;uniform float rim;uniform float strength;uniform float gain;uniform float warmth;uniform vec3 solid;uniform float isSolid;uniform vec2 stepUV;`;
    this.uniforms={person:PIXI.Texture.WHITE,background:PIXI.Texture.WHITE,blurredBackground:PIXI.Texture.WHITE,source:PIXI.Texture.WHITE,glow:PIXI.Texture.WHITE,resolution:[1,1],bgSize:[1,1],gaze:[0,0],focus:0,time:0,bloom:.55,ambient:[1,1,1],key:[0,0,0],light:[1,1,1],direction:[1,0],threshold:[.19,.52],rim:.045,strength:1,gain:1,warmth:0,solid:[.063,.075,.082],isSolid:0,stepUV:[0,0]};
    const scene=`
      float hash(float x){return fract(sin(x*127.1)*43758.5453);}
      void main(){
        vec2 uv=vUV;float aspect=resolution.x/resolution.y;float imageAspect=bgSize.x/bgSize.y;
        vec2 crop=vec2(min(1.,aspect/imageAspect),min(1.,imageAspect/aspect));
        vec2 bgUV=.5+(uv-.5)*crop*mix(.96,.79,focus)+vec2(.012,-.025)*focus+gaze*vec2(.012,-.008);
        vec3 color=mix(texture2D(background,clamp(bgUV,.001,.999)).rgb,
          texture2D(blurredBackground,clamp(bgUV,.001,.999)).rgb,focus);
        color=mix(color,solid,isSolid);
        for(int i=0;i<12;i++){
          float seed=float(i)+3.;vec2 pos=vec2(hash(seed),fract(hash(seed+4.)-time*.004));pos.x+=sin(time*.2+seed)*.009;
          float d=length((uv-pos)*vec2(aspect,1.));float radius=.0006+hash(seed+7.)*.001;
          color+=light*exp(-d*d/(radius*radius))*.1;
        }
        vec4 p=texture2D(person,uv);float side=smoothstep(.30,.67,.5+dot(uv-.5,direction));
        vec3 temp=vec3(1.+warmth*.12,1.-abs(warmth)*.025,1.-warmth*.12);
        vec3 lit=p.rgb*max(vec3(.15),mix(vec3(1.),ambient+side*key,strength))*gain*temp;
        float neighbor=texture2D(person,clamp(uv+direction*2.5/resolution,vec2(0.),vec2(1.))).a;
        lit+=light*max(0.,p.a-neighbor)*rim*strength;
        color=color*(1.-p.a)+lit;
        color*=1.-smoothstep(.28,.77,length((uv-.5)*vec2(1.05,1.)))*.19;
        float heading=(1.-smoothstep(.16,.29,uv.y))*(1.-smoothstep(.50,.95,uv.x));
        gl_FragColor=vec4(color*(1.-heading*.26),1.);
      }`;
    const extract=`void main(){vec3 c=texture2D(source,vUV).rgb;float brightness=mix(dot(c,vec3(.2126,.7152,.0722)),max(c.r,max(c.g,c.b)),.4);float mask=smoothstep(threshold.x,threshold.y,brightness);gl_FragColor=vec4(c*mask*mix(1.,.48,texture2D(person,vUV).a),1.);}`;
    const blur=`void main(){vec3 c=texture2D(source,vUV).rgb*.227027;c+=texture2D(source,clamp(vUV+stepUV*1.384615,vec2(0.),vec2(1.))).rgb*.316216;c+=texture2D(source,clamp(vUV-stepUV*1.384615,vec2(0.),vec2(1.))).rgb*.316216;c+=texture2D(source,clamp(vUV+stepUV*3.230769,vec2(0.),vec2(1.))).rgb*.070270;c+=texture2D(source,clamp(vUV-stepUV*3.230769,vec2(0.),vec2(1.))).rgb*.070270;gl_FragColor=vec4(c,1.);}`;
    const finish=`void main(){vec3 base=texture2D(source,vUV).rgb;vec3 diffusion=1.-exp(-texture2D(glow,vUV).rgb*bloom*2.2);gl_FragColor=vec4(min(vec3(1.),base+diffusion*(1.-base)),1.);}`;
    this.shaders=[scene,extract,blur,finish].map(fragment=>PIXI.Shader.from(vertex,header+fragment,{...this.uniforms}));
    this.geometry=new PIXI.Geometry().addAttribute('aVertexPosition',new Float32Array([0,0,1,0,1,1,0,1]),2).addAttribute('aTextureCoord',new Float32Array([0,0,1,0,1,1,0,1]),2).addIndex([0,1,2,0,2,3]);
    this.quad=new PIXI.Mesh(this.geometry,this.shaders[0]);this.quad.state.blend=false;
  }
  resetSize(){this.width=0;this.height=0;}
  resize() {
    const {width,height}=this.app.screen;if(this.width===width&&this.height===height)return;
    this.width=width;this.height=height;
    if(this.targets)Object.values(this.targets).forEach(t=>t.destroy(true));
    const resolution=Math.min(devicePixelRatio||1,1.5,1600/Math.max(width,height));
    const make=low=>PIXI.RenderTexture.create({width:low?Math.max(1,Math.ceil(width/4)):width,height:low?Math.max(1,Math.ceil(height/4)):height,resolution,scaleMode:PIXI.SCALE_MODES.LINEAR});
    this.targets={person:make(false),scene:make(false),bright:make(true),blurX:make(true),blurY:make(true)};
    this.geometry.getBuffer('aVertexPosition').update(new Float32Array([0,0,width,0,width,height,0,height]));
    this.profileKey='';
    this.callbacks.resolution?.(`${Math.round(width*resolution)} × ${Math.round(height*resolution)}`);
  }
  async loadBackground(source, scene, title, ownedURL=false) {
    const ticket=++this.backgroundTicket;let texture;
    try {
      const image=new Image();image.src=source;await image.decode();
      if(ticket!==this.backgroundTicket)return false;
      const canvas=document.createElement('canvas'), factor=Math.min(1,3072/Math.max(image.naturalWidth,image.naturalHeight));
      canvas.width=Math.max(1,Math.round(image.naturalWidth*factor));canvas.height=Math.max(1,Math.round(image.naturalHeight*factor));
      canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
      const sample=AtmosphereMath.sampleImage(canvas);texture=PIXI.Texture.from(canvas);texture.baseTexture.mipmap=PIXI.MIPMAP_MODES.ON;
      const blurred=this.blurBackground(texture);
      if(this.texture!==PIXI.Texture.WHITE)this.texture.destroy(true);
      if(this.blurredBackground!==PIXI.Texture.WHITE)this.blurredBackground.destroy(true);
      this.blurredBackground=blurred;
      this.texture=texture;this.sample=sample;this.scene=scene;this.profileKey='';this.profile=null;
      this.settings={enabled:true,strength:1,exposure:0,warmth:0,direction:0};
      this.callbacks.title?.(title);
      this.callbacks.background?.(title);
      return true;
    } catch(error) {
      if(texture&&texture!==this.texture)texture.destroy(true);
      if(ticket!==this.backgroundTicket)return false;
      throw error;
    } finally {if(ownedURL)URL.revokeObjectURL(source);}
  }
  blurBackground(texture) {
    const scale=Math.min(1,512/Math.max(texture.width,texture.height));
    const width=Math.max(1,Math.round(texture.width*scale)),height=Math.max(1,Math.round(texture.height*scale));
    const target=PIXI.RenderTexture.create({width,height,resolution:1});
    const sprite=new PIXI.Sprite(texture);sprite.width=width;sprite.height=height;
    const blur=new PIXI.filters.BlurFilter(4,4,1);blur.repeatEdgePixels=true;
    sprite.filters=[blur];sprite.filterArea=new PIXI.Rectangle(0,0,width,height);
    this.app.renderer.render(sprite,{renderTexture:target,clear:true});
    sprite.filters=null;sprite.destroy();blur.destroy();return target;
  }
  solid(hex) {
    ++this.backgroundTicket;this.scene='solid';this.uniforms.solid=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
    this.sample={width:1,height:1,data:new Uint8ClampedArray([...this.uniforms.solid.map(v=>v*255),255])};this.profileKey='';this.profile=null;
    this.callbacks.title?.('纯色舞台');this.callbacks.background?.('纯色背景 · '+hex);
  }
  update(dt) {
    this.time+=dt;const change=Math.min(1,dt/.7);this.focus+=Math.sign(this.focusTarget-this.focus)*Math.min(Math.abs(this.focusTarget-this.focus),change);
    this.smoothGaze=this.smoothGaze.map((v,i)=>v+(this.gaze[i]-v)*Math.min(1,dt*7));
  }
  get progress(){return this.focus*this.focus*(3-2*this.focus);}
  updateLighting() {
    const preset={moon:{ambient:[.66,.70,.86],key:[.06,.085,.12],light:[.61,.70,1],threshold:[.19,.52]},dawn:{ambient:[.98,.91,.81],key:[.04,.04,.025],light:[1,.83,.61],threshold:[.43,.83]},rain:{ambient:[.68,.75,.79],key:[.14,.08,.025],light:[.55,.76,.83],threshold:[.19,.52]}};
    const key=`${this.width}/${this.height}/${Math.round(this.progress*4)}/${this.scene}`;
    if(key!==this.profileKey) {
      this.profileKey=key;
      this.targetProfile=preset[this.scene]?{...preset[this.scene],direction:[1,0],rim:.045,summary:'场景预设 · '+({moon:'冷色月光',dawn:'暖色晨光',rain:'雨夜柔光'}[this.scene])}:
        this.sample?AtmosphereMath.profile(this.sample,this.width/Math.max(1,this.height),Math.round(this.progress*4)/4):{...preset.moon,direction:[1,0],rim:.045,summary:'正在准备场景…'};
      this.callbacks.lighting?.(this.settings.enabled?this.targetProfile.summary:'环境光匹配已关闭');
    }
    if(!this.profile)this.profile=structuredClone(this.targetProfile);
    for(const name of ['ambient','key','light','direction','threshold'])this.profile[name]=this.profile[name].map((v,i)=>v+(this.targetProfile[name][i]-v)*.14);
    this.profile.rim+=(this.targetProfile.rim-this.profile.rim)*.14;
    const s=this.settings, angle=s.direction*Math.PI/180, d=this.profile.direction;
    Object.assign(this.uniforms,this.profile,{direction:[d[0]*Math.cos(angle)-d[1]*Math.sin(angle),d[0]*Math.sin(angle)+d[1]*Math.cos(angle)],strength:s.enabled?s.strength:0,gain:s.enabled?2**s.exposure:1,warmth:s.enabled?s.warmth:0});
  }
  destroy() {
    ++this.backgroundTicket;
    for(const texture of [this.texture,this.blurredBackground])if(texture!==PIXI.Texture.WHITE)texture.destroy(true);
    if(this.targets)Object.values(this.targets).forEach(texture=>texture.destroy(true));
    this.quad.destroy();this.shaders.forEach(shader=>shader.destroy());
  }
  render() {
    this.resize();this.updateLighting();const r=this.app.renderer,t=this.targets;
    r.render(this.app.stage,{renderTexture:t.person,clear:true});
    Object.assign(this.uniforms,{person:t.person,background:this.texture,blurredBackground:this.blurredBackground,bgSize:[this.texture.width,this.texture.height],resolution:[this.width,this.height],focus:this.progress,time:this.time,gaze:this.smoothGaze,bloom:this.bloom,isSolid:this.scene==='solid'?1:0});
    const pass=(shader,source,target,step=[0,0])=>{
      this.quad.shader=this.shaders[shader];Object.assign(this.quad.shader.uniforms,this.uniforms,{source,stepUV:step});
      this.quad.scale.set(target?target.width/this.width:1,target?target.height/this.height:1);
      r.render(this.quad,{renderTexture:target,clear:true});
    };
    pass(0,PIXI.Texture.WHITE,t.scene);
    if(this.bloom>0) {
      pass(1,t.scene,t.bright);
      pass(2,t.bright,t.blurX,[2/t.bright.width,0]);
      pass(2,t.blurX,t.blurY,[0,2/t.bright.height]);
      this.uniforms.glow=t.blurY;
    } else this.uniforms.glow=PIXI.Texture.WHITE;
    pass(3,t.scene,null);
  }
}

export { AtmosphereMath, AtmosphereStage, locateFace };
