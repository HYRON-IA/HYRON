/* HYRON_083_MOBILE_HEADER_CHAT_FIX_V1 */
(()=>{
 'use strict';
 const bell=document.getElementById('hyron-notification-bell');
 const panel=document.getElementById('hyron-notification-popover');
 if(bell&&panel){
   document.addEventListener('pointerdown',event=>{
     if(panel.hidden)return;
     if(!panel.contains(event.target)&&!bell.contains(event.target))panel.hidden=true;
   },{passive:true});
   document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){panel.hidden=true;bell.focus();}});
 }
 // Ajusta apenas o scroll do histórico quando o campo cresce ou o teclado muda de tamanho.
 const chat=document.getElementById('chat');
 const prompt=document.getElementById('prompt');
 if(chat&&prompt&&window.ResizeObserver){
   const form=document.getElementById('form');
   if(form){let lastHeight=form.getBoundingClientRect().height;
     const observer=new ResizeObserver(()=>{
       const h=form.getBoundingClientRect().height;
       const nearEnd=chat.scrollHeight-chat.scrollTop-chat.clientHeight<100;
       if(h>lastHeight&&nearEnd)chat.scrollTop=chat.scrollHeight;
       lastHeight=h;
     });observer.observe(form);
   }
 }
})();
