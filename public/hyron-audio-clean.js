/* HYRON_AUDIO_FINAL_082 - HYRON audio final 0.8.2: só player + data/hora real da mensagem */
(()=>{
 'use strict';
 const PANEL='[data-hyron-dm-v2="panel"]';
 const PLAYER='.hyron-dm-v2-audio';
 const CLASS='hyron-audio-clean-hidden';
 const TIME=/\b\d{1,2}\/\d{1,2}\/\d{4}\s*,?\s*\d{1,2}:\d{2}(?::\d{2})?\b/;
 const namePattern=/\b[^\s<>]+\.(?:webm|ogg|mp3|wav|m4a|opus|aac)\b/i;
 function directText(el){return [...el.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent||'').join(' ').trim()}
 function process(){
  for(const panel of document.querySelectorAll(PANEL))for(const player of panel.querySelectorAll(PLAYER)){
   // HYRON_AUDIO_SOURCE_RENDER_FIX_082 - Renderizador novo ja trata texto e horario da mensagem.
   if(player.closest('.hyron-dm-audio-only'))continue;
   const shell=player.closest('.hyron-audio-bubble-transparent');
   if(!shell||shell.querySelectorAll(PLAYER).length!==1)continue;
   const text=shell.querySelector(':scope > .dm-text,:scope > .message-text,:scope > .hyron-dm-text');
   if(text?.textContent.trim())continue;
   const inside=player.contains.bind(player);
   const nodes=[...shell.querySelectorAll('*')].filter(e=>e!==player&&!inside(e)&&!e.contains(player));
   // Data e hora originais, prioritariamente no elemento com aparência de timestamp.
   const dates=nodes.filter(e=>e.children.length===0&&TIME.test(e.textContent||''));
   const dateEl=dates.find(e=>/time|date|meta/i.test(e.className||''))||dates.at(-1);
   const date=dateEl?.textContent?.match(TIME)?.[0]||'';
   // O cabeçalho do arquivo fica fora do grupo do player em algumas versões.
   for(const el of nodes){
    if(el.closest('.hyron-dm-v2-audio')||el.closest('.hyron-audio-clean-time'))continue;
    if(el.tagName==='A'&&namePattern.test(el.textContent||'')){el.classList.add(CLASS);continue;}
    if(el.children.length>0)continue;
    const label=(el.textContent||'').trim();
    if(namePattern.test(label)||/^Dura[cç][aã]o:\s*/i.test(label))el.classList.add(CLASS);
   }
   // Oculta o relógio original somente quando pudermos mostrar cópia junto ao player.
   let footer=shell.querySelector(':scope > .hyron-audio-clean-time');
   if(!footer){footer=document.createElement('div');footer.className='hyron-audio-clean-time';footer.setAttribute('aria-label','Data e hora da mensagem');shell.append(footer)}
   if(date){footer.textContent=date;if(dateEl)dateEl.classList.add(CLASS);footer.hidden=false;}
   else{footer.hidden=true;}
  }
 }
 let pending=false;
 function schedule(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;process()})}
 function init(){new MutationObserver(schedule).observe(document.body,{subtree:true,childList:true});schedule()}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
