(() => {
  const siteRoot=document.currentScript.dataset.siteRoot;
  const nav=document.querySelector('header nav');
  if(nav){
    nav.classList.add('collection-pages-nav');
    const home=document.createElement('a');home.href=siteRoot;home.textContent='Live2D';nav.prepend(home);
    if(!location.pathname.includes('/backgrounds/')){
      const scenes=document.createElement('a');scenes.href=siteRoot+'personas/backgrounds/common-scenes-v1/';scenes.textContent='场景背景';nav.append(scenes);
    }else{
      const download=document.createElement('a');download.href='common-scenes.zip';download.download='loci-common-scenes.zip';download.textContent='整套下载';nav.append(download);
    }
  }
  const id=new URL(location.href).searchParams.get('character');
  const search=document.getElementById('search'),data=document.getElementById('data');
  if(id&&search&&data){
    const payload=JSON.parse(data.textContent),items=Array.isArray(payload)?payload:payload.zh;
    const character=items?.find(c=>c.modelId===id);
    if(character){search.value=character.nameZh||character.name;search.dispatchEvent(new Event('input'));}
  }
})();
