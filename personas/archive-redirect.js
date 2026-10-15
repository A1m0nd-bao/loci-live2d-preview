(() => {
  const script=document.currentScript,target=new URL(script.dataset.target,location.href);
  const params=new URL(location.href).searchParams;
  if(script.dataset.locale&&!params.has('lang'))params.set('lang',script.dataset.locale);
  if(script.dataset.view&&!params.has('view'))params.set('view',script.dataset.view);
  target.search=params.toString();target.hash=location.hash;location.replace(target.href);
})();
