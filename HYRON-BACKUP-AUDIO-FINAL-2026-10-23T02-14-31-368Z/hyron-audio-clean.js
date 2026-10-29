/* HYRON 0.8.2 - limpeza visual dos audios da Linha Direta. */
(()=>{
 'use strict';
 const PLAYER='.hyron-dm-v2-audio';
 const SHELL='.hyron-audio-bubble-transparent';
 const MARK='hyron-audio-clean-hidden';
 const ONLY='hyron-audio-clean-only';
 function update(){
  for(const shell of document.querySelectorAll(SHELL)){
   const players=[...shell.querySelectorAll(PLAYER)];
   // Protege mensagens com texto ou mais de um arquivo.
   if(players.length!==1){shell.classList.remove(ONLY);continue;}
   const player=players[0];
   const typed=shell.querySelector(':scope > .dm-text,:scope > .message-text,:scope > .hyron-dm-text');
   if(typed?.textContent.trim()){shell.classList.remove(ONLY);continue;}
   const group=player.parentElement;
   if(!group||group===shell)continue;
   // Confirma que o grupo so contem esse player e seus metadados.
   if(group.querySelectorAll(PLAYER).length!==1)continue;
   shell.classList.add(ONLY);
   for(const el of group.children){if(el!==player&&!el.contains(player))el.classList.add(MARK);}
   // Tambem oculta data/hora se for apenas metadado desta mensagem de voz.
   let branch=group;
   while(branch.parentElement && branch.parentElement!==shell){
    const parent=branch.parentElement;
    if(parent.querySelectorAll(PLAYER).length!==1)break;
    for(const sibling of parent.children){
     if(sibling===branch||sibling.contains(player))continue;
     if(sibling.querySelector('audio,video,img,input,textarea,button'))continue;
     if(sibling.querySelector(PLAYER))continue;
     sibling.classList.add(MARK);
    }
    branch=parent;
   }
   for(const sibling of shell.children){
    if(sibling===branch||sibling.contains(player)||sibling.querySelector('audio,video,img,input,textarea,button'))continue;
    sibling.classList.add(MARK);
   }
  }
 }
 let scheduled=false;
 const schedule=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;update();});};
 const init=()=>{new MutationObserver(schedule).observe(document.body,{subtree:true,childList:true});schedule();};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
