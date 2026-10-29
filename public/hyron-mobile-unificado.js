/* HYRON 0.8.5 - Mobile navigation enhancements; no backend changes. */
(()=>{'use strict';
 const mobile=()=>matchMedia('(max-width:700px)').matches;
 const dm=document.querySelector('.hyron-dm-panel');
 function initDm(){
  const panel=document.querySelector('.hyron-dm-panel');if(!panel||panel.dataset.hyronMobileReady)return;
  panel.dataset.hyronMobileReady='1';panel.dataset.hyronMobileView='list';
  const title=panel.querySelector('.hyron-dm-title');
  if(title){const back=document.createElement('button');back.type='button';back.className='hyron-mobile-dm-back';back.textContent='←';back.setAttribute('aria-label','Voltar às conversas');back.addEventListener('click',()=>{panel.dataset.hyronMobileView='list';});title.prepend(back);}
  const threads=panel.querySelector('.hyron-dm-threads');
  if(threads)threads.addEventListener('click',e=>{if(!mobile()||!e.target.closest('.hyron-dm-thread'))return;panel.dataset.hyronMobileView='chat';});
  const ob=new MutationObserver(()=>{if(panel.hidden)panel.dataset.hyronMobileView='list';});ob.observe(panel,{attributes:true,attributeFilter:['hidden']});
 }
 function initGroups(){
  const panel=document.querySelector('.hyron-groups-panel');if(!panel||panel.dataset.hyronMobileReady)return;
  panel.dataset.hyronMobileReady='1';const head=panel.querySelector('.hyron-groups-row');if(!head)return;
  const trigger=document.createElement('button');trigger.type='button';trigger.className='hyron-mobile-actions-trigger';trigger.textContent='⋮';trigger.setAttribute('aria-label','Mais opções da Ala Coletiva');trigger.setAttribute('aria-expanded','false');
  const menu=document.createElement('div');menu.className='hyron-mobile-actions-menu';menu.hidden=true;
  head.append(trigger,menu);
  function rebuild(){menu.replaceChildren();const controls=[...head.querySelectorAll('button')].filter(b=>b!==trigger&&!b.classList.contains('hyron-mobile-actions-proxy'));
   controls.forEach(b=>{if(/fechar/i.test(b.textContent||''))return;const c=document.createElement('button');c.type='button';c.className='hyron-mobile-actions-proxy';c.textContent=(b.textContent||b.getAttribute('aria-label')||'Opção').trim();c.addEventListener('click',()=>{menu.hidden=true;trigger.setAttribute('aria-expanded','false');b.click();});menu.append(c);});
   const del=panel.querySelector('.hyron-groups-chat-heading .hyron-groups-danger-action');if(del&&panel.classList.contains('has-group')){const c=document.createElement('button');c.type='button';c.textContent='Excluir grupo';c.addEventListener('click',()=>{menu.hidden=true;trigger.setAttribute('aria-expanded','false');del.click();});menu.append(c);}
  }
  trigger.addEventListener('click',()=>{if(!mobile())return;rebuild();menu.hidden=!menu.hidden;trigger.setAttribute('aria-expanded',String(!menu.hidden));});
  document.addEventListener('click',e=>{if(!menu.hidden&&!menu.contains(e.target)&&e.target!==trigger){menu.hidden=true;trigger.setAttribute('aria-expanded','false');}});
  panel.addEventListener('click',e=>{if(e.target.closest('.hyron-groups-card')){menu.hidden=true;}});
 }
 const style=document.createElement('style');style.textContent='@media(min-width:701px){.hyron-mobile-dm-back,.hyron-mobile-actions-trigger,.hyron-mobile-actions-menu{display:none!important}}@media(max-width:700px){.hyron-groups-row>.hyron-surto-toggle,.hyron-groups-row>.hyron-export-txt-toggle{display:none!important}.hyron-groups-row>.hyron-mobile-actions-trigger{display:block!important}}';document.head.append(style);
 function boot(){initDm();initGroups();}
 boot();const observer=new MutationObserver(()=>{if(!document.querySelector('.hyron-groups-panel[data-hyron-mobile-ready]')||!document.querySelector('.hyron-dm-panel[data-hyron-mobile-ready]'))boot();});observer.observe(document.body,{childList:true,subtree:true});
})();
