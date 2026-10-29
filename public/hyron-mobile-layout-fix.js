/* HYRON_083_MOBILE_LAYOUT_STABLE_V2 */
(()=>{
 'use strict';
 const chat=document.getElementById('chat');
 const form=document.getElementById('form');
 const bell=document.getElementById('hyron-notification-bell');
 const panel=document.getElementById('hyron-notification-popover');
 if(bell&&panel){
   document.addEventListener('pointerdown',event=>{
     if(!panel.hidden && !panel.contains(event.target) && !bell.contains(event.target)) panel.hidden=true;
   },{passive:true});
   document.addEventListener('keydown',event=>{
     if(event.key==='Escape'&&!panel.hidden){panel.hidden=true;bell.focus();}
   });
 }
 if(!chat||!form)return;
 let wasAtBottom=true;
 const nearBottom=()=>chat.scrollHeight-chat.scrollTop-chat.clientHeight < 100;
 chat.addEventListener('scroll',()=>{wasAtBottom=nearBottom();},{passive:true});
 function fit(){
   if(!matchMedia('(max-width:650px)').matches)return;
   if(wasAtBottom) chat.scrollTop=chat.scrollHeight;
 }
 if(window.ResizeObserver){
   const observer=new ResizeObserver(fit);
   observer.observe(form);
 }
 if(window.visualViewport){
   let raf=0;
   const adjust=()=>{
     if(!matchMedia('(max-width:650px)').matches)return;
     cancelAnimationFrame(raf);
     raf=requestAnimationFrame(()=>{
       // Compensa teclado virtual que diminui o visual viewport sem reduzir 100dvh.
       const viewport=window.visualViewport;
       const available=Math.max(260,Math.min(window.innerHeight, viewport.height+viewport.offsetTop));
       const main=document.getElementById('hyron-main');
       if(main) main.style.setProperty('--hyron-mobile-visible-height',available+'px');
       fit();
     });
   };
   window.visualViewport.addEventListener('resize',adjust,{passive:true});
   window.visualViewport.addEventListener('scroll',adjust,{passive:true});
   adjust();
 }
})();
