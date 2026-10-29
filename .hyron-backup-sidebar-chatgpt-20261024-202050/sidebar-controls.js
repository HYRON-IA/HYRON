/* HYRON_SIDEBAR_CONTROLS_V2 - additive module, no changes to conversations */
(() => {
 const run = () => {
  const sidebar=document.getElementById('hyron-sidebar');
  const app=document.getElementById('app');
  const history=document.getElementById('sidebar-conversations');
  if(!sidebar||!app||!history||sidebar.dataset.hyronControlsV2)return;
  sidebar.dataset.hyronControlsV2='1';
  const key='hyron.sidebar.controls.v2';
  let saved={};try{saved=JSON.parse(localStorage.getItem(key)||'{}')||{}}catch{}
  let width=Number.isFinite(Number(saved.width))?Math.max(250,Math.min(520,Number(saved.width))):340;
  let collapsed=Boolean(saved.collapsed);
  let expanded=Boolean(saved.historyExpanded);
  const persist=()=>{try{localStorage.setItem(key,JSON.stringify({width,collapsed,historyExpanded:expanded}))}catch{}};
  const narrow=()=>window.matchMedia('(max-width:850px)').matches;
  const brand=sidebar.querySelector('.sidebar-brand');
  if(!brand)return;
  const collapse=document.createElement('button');collapse.type='button';collapse.id='hyron-sidebar-collapse';collapse.className='hyron-sidebar-collapse';collapse.title='Recolher barra lateral';collapse.setAttribute('aria-label','Recolher barra lateral');
  brand.append(collapse);
  const grip=document.createElement('div');grip.className='hyron-sidebar-resizer';grip.title='Arraste para ajustar a largura da barra lateral';grip.setAttribute('role','separator');grip.setAttribute('aria-orientation','vertical');grip.setAttribute('aria-label','Ajustar largura da barra lateral');grip.tabIndex=0;
  sidebar.append(grip);
  let header=sidebar.querySelector('.sidebar-section-head');
  if(!header){
    const label=sidebar.querySelector('.sidebar-title');
    if(label){header=document.createElement('div');header.className='sidebar-section-head';label.before(header);header.append(label)}
  }
  let toggle=document.getElementById('sidebar-history-toggle');
  if(!toggle&&header){toggle=document.createElement('button');toggle.id='sidebar-history-toggle';toggle.type='button';header.append(toggle)}
  const apply=()=>{
    if(narrow()){
      app.style.removeProperty('--hyron-sidebar-width');
      sidebar.classList.remove('hyron-collapsed');
      sidebar.classList.toggle('hyron-history-expanded',expanded);
    }else{
      app.style.setProperty('--hyron-sidebar-width',collapsed?'70px':width+'px');
      sidebar.classList.toggle('hyron-collapsed',collapsed);
      sidebar.classList.toggle('hyron-history-expanded',expanded);
    }
    collapse.textContent=collapsed&&!narrow()?'›':'‹';
    collapse.title=collapsed&&!narrow()?'Expandir barra lateral':'Recolher barra lateral';
    collapse.setAttribute('aria-label',collapse.title);
    collapse.setAttribute('aria-expanded',String(!collapsed||narrow()));
    if(toggle){toggle.textContent=expanded?'Recolher':'Expandir';toggle.setAttribute('aria-expanded',String(expanded))}
    grip.setAttribute('aria-valuenow',String(width));
    persist();
  };
  collapse.addEventListener('click',()=>{if(narrow())return;collapsed=!collapsed;apply()});
  // Captura para evitar que um handler antigo reverta imediatamente a expansao.
  if(toggle)toggle.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();expanded=!expanded;apply()},true);
  let dragging=false;
  grip.addEventListener('pointerdown',e=>{
    if(narrow()||collapsed)return;
    dragging=true;grip.setPointerCapture(e.pointerId);e.preventDefault();
    document.documentElement.classList.add('hyron-sidebar-dragging');
  });
  grip.addEventListener('pointermove',e=>{
    if(!dragging)return;
    width=Math.max(250,Math.min(520,Math.min(window.innerWidth-360,e.clientX)));
    apply();
  });
  const end=()=>{dragging=false;document.documentElement.classList.remove('hyron-sidebar-dragging')};
  grip.addEventListener('pointerup',end);grip.addEventListener('pointercancel',end);grip.addEventListener('lostpointercapture',end);
  grip.addEventListener('keydown',e=>{
    if(narrow()||collapsed||!['ArrowLeft','ArrowRight'].includes(e.key))return;
    e.preventDefault();width=Math.max(250,Math.min(520,width+(e.key==='ArrowLeft'?-20:20)));apply();
  });
  window.addEventListener('resize',apply);
  apply();
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});
 else run();
})();
