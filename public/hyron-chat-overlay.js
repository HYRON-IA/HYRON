/* HYRON 0.8.3 - area rolavel prolongada; nao usa scaleY. */
(()=>{
 'use strict';
 const KEY='HYRON_CHAT_OVERLAY_083';
 if(window[KEY]) return;
 const app={active:false,cleanup:[],syncing:false};
 window[KEY]=app;
 function start(){
   const main=document.getElementById('hyron-main');
   const chat=document.getElementById('chat');
   const form=document.getElementById('form');
   if(!main||!chat||!form||chat.parentElement!==main||form.parentElement!==main) return false;
   if(document.getElementById('hyron-chat-spacekeeper')) return false;
   const keeper=document.createElement('div');
   keeper.id='hyron-chat-spacekeeper';
   keeper.setAttribute('aria-hidden','true');
   const css=document.createElement('style');
   css.id='hyron-chat-overlay-css';
   css.textContent=`
     #hyron-main{position:relative!important}
     #hyron-main #hyron-chat-spacekeeper{display:block!important;flex:1 1 0px!important;min-height:0!important;min-width:0!important;pointer-events:none!important;visibility:hidden!important;margin:0!important;padding:0!important}
     #hyron-main #chat.hyron-overlay-scroll{position:absolute!important;display:block!important;flex:none!important;min-height:0!important;max-height:none!important;overflow-y:auto!important;overflow-x:hidden!important;transform:none!important;inset:auto!important;box-sizing:border-box!important;z-index:1!important;overscroll-behavior:contain}
     #hyron-main #form{position:relative;z-index:3}
     #hyron-main #chat.hyron-overlay-scroll{-webkit-mask-image:linear-gradient(to bottom,#000 0%,#000 calc(100% - 18px),transparent 100%);mask-image:linear-gradient(to bottom,#000 0%,#000 calc(100% - 18px),transparent 100%)}
   `;
   const previous={};
   for(const k of ['top','left','width','height','bottom','right']) previous[k]=[chat.style.getPropertyValue(k),chat.style.getPropertyPriority(k)];
   const scrollPrevious=chat.scrollTop;
   chat.before(keeper);document.head.appendChild(css);
   chat.classList.add('hyron-overlay-scroll');
   app.active=true;
   function layout(){
     if(app.syncing||!keeper.isConnected||!main.isConnected) return;
     if(main.getClientRects().length===0||form.getClientRects().length===0||keeper.getClientRects().length===0) return;
     app.syncing=true;
     try{
       const m=main.getBoundingClientRect(), k=keeper.getBoundingClientRect(), f=form.getBoundingClientRect();
       const top=k.top-m.top, left=k.left-m.left;
       const height=f.top-k.top;
       if(height<50||k.width<80) return;
       chat.style.setProperty('top',`${top}px`,'important');
       chat.style.setProperty('left',`${left}px`,'important');
       chat.style.setProperty('width',`${k.width}px`,'important');
       chat.style.setProperty('height',`${height}px`,'important');
       chat.style.setProperty('bottom','auto','important');
       chat.style.setProperty('right','auto','important');
     }finally{app.syncing=false}
   }
   const ro=new ResizeObserver(layout);
   ro.observe(main);ro.observe(keeper);ro.observe(form);
   window.addEventListener('resize',layout);
   const mo=new MutationObserver(()=>{
     if(!main.isConnected||!chat.isConnected||!form.isConnected){app.revert();return;}
     layout();
   });
   mo.observe(main,{attributes:true,attributeFilter:['hidden','style','class']});
   app.cleanup.push(()=>ro.disconnect(),()=>mo.disconnect(),()=>window.removeEventListener('resize',layout));
   app.revert=()=>{
     app.cleanup.forEach(fn=>fn());app.cleanup=[];
     css.remove();keeper.remove();chat.classList.remove('hyron-overlay-scroll');
     for(const [k,[v,p]] of Object.entries(previous)) v?chat.style.setProperty(k,v,p):chat.style.removeProperty(k);
     app.active=false;window[KEY]=null;
   };
   app.measure=()=>{
     const c=chat.getBoundingClientRect(), f=form.getBoundingClientRect(), k=keeper.getBoundingClientRect();
     console.table({'Topo do historico':c.top,'Topo preservado (referencia)':k.top,'Fundo historico':c.bottom,'Topo composer':f.top,'Distancia restante':f.top-c.bottom,'Escala':getComputedStyle(chat).transform});
   };
   layout();
   chat.scrollTop=scrollPrevious;
   console.info('HYRON: extensao estrutural ativada. Reverter: HYRON_CHAT_OVERLAY_083.revert()');
   return true;
 }
 function boot(){if(start())return;const obs=new MutationObserver(()=>{if(start())obs.disconnect()});obs.observe(document.body,{subtree:true,childList:true});setTimeout(()=>obs.disconnect(),30000)}
 if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
