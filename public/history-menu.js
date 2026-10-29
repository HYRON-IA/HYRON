export function installHistoryMenu({document,historyList,select,onConversationOpen}){
 let popup=null,trigger=null;
 function close(restoreFocus=false){
  const previous=trigger;popup?.remove();popup=null;
  previous?.setAttribute('aria-expanded','false');trigger=null;
  if(restoreFocus&&previous?.isConnected)previous.focus();
 }
 function show(button,option){
  if(trigger===button){close();return;}
  close();trigger=button;button.setAttribute('aria-expanded','true');
  popup=document.createElement('div');popup.className='hyron-history-menu';popup.id='hyron-history-options';popup.setAttribute('role','menu');popup.setAttribute('aria-label','Opções de '+option.textContent);
  for(const [action,label] of [['rename','Renomear'],['delete','Excluir conversa']]){
   const item=document.createElement('button');item.type='button';item.textContent=label;item.setAttribute('role','menuitem');item.className=action==='delete'?'history-delete':'';
   item.addEventListener('click',event=>{event.stopPropagation();close(true);document.dispatchEvent(new CustomEvent('hyron:conversation-action',{detail:{action,id:option.value}}));});popup.append(item);
  }
  document.body.append(popup);
  const rect=button.getBoundingClientRect(),menu=popup.getBoundingClientRect(),view=document.defaultView;
  popup.style.left=Math.max(8,Math.min(rect.right-menu.width,view.innerWidth-menu.width-8))+'px';
  popup.style.top=(rect.bottom+menu.height+8>view.innerHeight?Math.max(8,rect.top-menu.height-4):rect.bottom+4)+'px';
  popup.querySelector('button').focus();
 }
 function row(option){
  const container=document.createElement('div');container.className='sidebar-history-row';container.setAttribute('role','listitem');
  const item=document.createElement('button');item.type='button';item.className='sidebar-conversation';item.textContent=option.textContent;item.title=option.textContent;item.dataset.conversationId=option.value;
  if(option.value===select.value){item.classList.add('active');item.setAttribute('aria-current','page');}
  item.addEventListener('click',()=>{close();if(select.value!==option.value){select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));}onConversationOpen();});
  const more=document.createElement('button');more.type='button';more.className='history-more';more.textContent='⋯';more.title='Opções da conversa';more.setAttribute('aria-label','Opções de '+option.textContent);more.setAttribute('aria-haspopup','menu');more.setAttribute('aria-controls','hyron-history-options');more.setAttribute('aria-expanded','false');
  more.addEventListener('click',event=>{event.stopPropagation();show(more,option);});
  more.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();show(more,option);}});
  container.append(item,more);return container;
 }
 document.addEventListener('pointerdown',event=>{if(popup&&!popup.contains(event.target)&&!trigger?.contains(event.target))close();});
 document.addEventListener('keydown',event=>{
  if(!popup)return;
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);return;}
  if(event.key==='Tab'){close(true);return;}
  const buttons=[...popup.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
   event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next].focus();
  }
 });
 document.defaultView.addEventListener('resize',()=>close());
 document.addEventListener('scroll',event=>{if(popup&&!popup.contains(event.target))close();},true);
 return {row,close};
}
