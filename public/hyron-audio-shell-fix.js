/* HYRON v0.8.2 - Corrige fundo externo das mensagens que contem audio. */
(()=>{
 'use strict';
 const panelSelector='[data-hyron-dm-v2="panel"]';
 const playerSelector='.hyron-dm-v2-audio';
 const candidates='.hyron-dm-message,.hyron-dm-bubble,.dm-msg,.dm-message,.dm-bubble,.message-outgoing,.message-incoming,.dm-message--outgoing,.dm-message--incoming';
 const realText=(node)=>Array.from(node.childNodes).filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join('').trim();
 function findShell(player,panel){
   let node=player.parentElement;
   let fallback=null;
   for(let depth=0;node&&node!==panel&&depth<8;depth++,node=node.parentElement){
     if(node.querySelectorAll(playerSelector).length!==1)break;
     if(node.matches(candidates))return node;
     // First wrapper with colored background outside the custom player.
     const style=getComputedStyle(node),color=style.backgroundColor;
     if(!fallback&&color&&color!=='transparent'&&color!=='rgba(0, 0, 0, 0)'&&style.display!=='none')fallback=node;
     // Do not climb into message list or conversation column.
     if(node.hasAttribute('data-hyron-dm-v2'))break;
   }
   return fallback;
 }
 function refresh(){
   for(const panel of document.querySelectorAll(panelSelector)){
     for(const p of panel.querySelectorAll(playerSelector)){
       const shell=findShell(p,panel);if(!shell)continue;
       // The message bubble may contain filename/duration/download/timestamp; those are not a separate typed message.
       // If there is a textual sibling explicitly tagged as message content, keep ordinary message styling.
       const typed=shell.querySelector(':scope > .dm-text,:scope > .message-text,:scope > .hyron-dm-text');
       const hasTyped=!!(typed&&typed.textContent.trim());
       shell.classList.toggle('hyron-audio-bubble-transparent',!hasTyped);
     }
   }
 }
 let pending=false;const schedule=()=>{if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;refresh();});};
 const observer=new MutationObserver(schedule);
 observer.observe(document.body,{childList:true,subtree:true});
 schedule();
})();
