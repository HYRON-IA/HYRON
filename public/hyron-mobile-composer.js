/* HYRON_083_MOBILE_COMPOSER_SINGLE_ROW_V1 */
(()=>{
 'use strict';
 const form=document.getElementById('form');
 const prompt=document.getElementById('prompt');
 const provider=document.getElementById('provider');
 if(!form||!prompt||!provider)return;
 const small=window.matchMedia('(max-width: 650px)');
 let placeholder=null;
 let label=null;
 let moved=false;
 function sync(){
   form.classList.toggle('hyron-mobile-has-text',!!prompt.value.trim());
 }
 function ensure(){
   const menu=document.getElementById('hyron-tools-menu');
   label=provider.closest('.provider-label');
   if(!menu||!label)return false;
   if(small.matches && !moved){
     placeholder=document.createComment('HYRON_083_PROVIDER_DESKTOP_POSITION');
     label.parentNode.insertBefore(placeholder,label);
     const item=document.createElement('div');item.className='hyron-mobile-provider-item hyron-tool-item';
     item.append(label);menu.prepend(item);
     moved=true;
   }else if(!small.matches && moved){
     const item=label.parentNode;
     if(placeholder?.parentNode)placeholder.replaceWith(label);
     else form.querySelector('.hyron-compact-actions')?.insertBefore(label,document.getElementById('mic'));
     item?.remove();placeholder=null;moved=false;
     const toggle=document.getElementById('hyron-tools-toggle');
     menu.hidden=true;toggle?.setAttribute('aria-expanded','false');
   }
   return true;
 }
 let tries=0;
 const setup=()=>{
   sync();
   if(ensure())return;
   if(++tries<35)setTimeout(setup,120);
 };
 prompt.addEventListener('input',sync);
 prompt.addEventListener('change',sync);
 form.addEventListener('reset',()=>setTimeout(sync,0));
 form.addEventListener('submit',()=>setTimeout(sync,0));
 if(small.addEventListener)small.addEventListener('change',()=>{ensure();sync()});
 else small.addListener(()=>{ensure();sync()});
 setup();
})();
