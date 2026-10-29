/* HYRON_DM_INTERNOS_RETRATIL_V1 - somente apresentação, sem alterar as rotas de mensagens. */
(()=>{
 'use strict';
 const PANEL='.hyron-dm-panel';
 const LIST='[data-threads]';
 const NAMES=new Set(['basilisco','garradeprata','bicuco','bunga']);
 const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const KEY='hyron-dm-internos-expanded-v1';
 let expanded=false;
 try{expanded=localStorage.getItem(KEY)==='true';}catch{}
 let scheduled=false;
 function organize(){
  const panel=document.querySelector(PANEL);const list=panel?.querySelector(LIST);
  if(!list)return;
  let section=list.querySelector(':scope > .hyron-internos-section');
  if(!section){
   section=document.createElement('section');section.className='hyron-internos-section';
   const toggle=document.createElement('button');toggle.type='button';toggle.className='hyron-internos-toggle';
   toggle.setAttribute('aria-controls','hyron-internos-items');
   const count=document.createElement('span');count.className='hyron-internos-count';
   const label=document.createElement('span');label.textContent='🐍 Internos do Hospício';
   const arrow=document.createElement('span');arrow.className='hyron-internos-arrow';arrow.setAttribute('aria-hidden','true');
   toggle.append(label,count,arrow);
   const items=document.createElement('div');items.id='hyron-internos-items';items.className='hyron-internos-items';
   toggle.addEventListener('click',()=>{expanded=!expanded;try{localStorage.setItem(KEY,String(expanded));}catch{} sync();});
   section.append(toggle,items);
   list.prepend(section);
  }
  const items=section.querySelector('.hyron-internos-items');
  // Usa o nome exibido no card (primeiro span), não o conteúdo das mensagens.
  const cards=[...list.children].filter(el=>el.matches('button.hyron-dm-thread'));
  for(const card of cards){
   const name=card.querySelector('span:not(.hyron-dm-preview):not(.hyron-dm-pill)')?.textContent||'';
   if(NAMES.has(normalize(name)))items.append(card);
  }
  // A busca filtra antes da organização; internos que não corresponderem continuam ocultos.
  const query=panel.querySelector('#dm-lookup')?.value.trim()||'';
  const matches=query && [...NAMES].some(n=>n.includes(normalize(query)));
  if(matches && items.childElementCount)expanded=true;
  function sync(){
   section.querySelector('.hyron-internos-toggle').setAttribute('aria-expanded',String(expanded));
   items.hidden=!expanded;
   section.querySelector('.hyron-internos-count').textContent=String(items.children.length);
   section.hidden=!items.children.length;
  }
  sync();
 }
 function queue(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;organize();});}
 function init(){
  const list=document.querySelector(`${PANEL} ${LIST}`);if(!list)return false;
  new MutationObserver(muts=>{if(muts.some(m=>m.type==='childList' && m.target===list))queue();}).observe(list,{childList:true});
  queue();return true;
 }
 if(!init()){
  const observer=new MutationObserver(()=>{if(init())observer.disconnect();});
  observer.observe(document.documentElement,{childList:true,subtree:true});
 }
})();
