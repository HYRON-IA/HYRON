// Acoes sempre dirigidas ao ID da linha, independentemente da conversa aberta.
export function createHistoryActions({api,getConversations,getCurrentId,clearCurrent,reload,confirm,prompt}){
 const pending=new Set();
 async function run(id,fn){
  const conversation=getConversations().find(c=>c.id===id);
  if(!conversation||pending.has(id))return false;
  pending.add(id);try{return await fn(conversation);}finally{pending.delete(id);}
 }
 return {
  rename:id=>run(id,async c=>{
   const value=await prompt('Novo título:',c.title);
   if(value===null)return false;
   const title=value.trim().slice(0,80);if(!title||title===c.title)return false;
   await api('/api/conversations','PATCH',{id:c.id,title});await reload();return true;
  }),
  delete:id=>run(id,async c=>{
   if(!await confirm('Excluir a conversa “'+c.title+'”? Esta ação não pode ser desfeita. Os arquivos no Drive serão mantidos.'))return false;
   // O Worker exige Content-Type JSON tambem para DELETE. {} aciona esse header.
   await api('/api/history?id='+encodeURIComponent(c.id),'DELETE',{});
   if(getCurrentId()===c.id)clearCurrent();
   await reload();return true;
  })
 };
}
export function bindHistoryActions(document,actions,getCurrentId,onError){
 const perform=(action,id)=>actions[action](id).catch(onError);
 document.querySelector('#rename')?.addEventListener('click',()=>perform('rename',getCurrentId()));
 document.querySelector('#clear')?.addEventListener('click',()=>perform('delete',getCurrentId()));
 document.addEventListener('hyron:conversation-action',event=>{
  const {action,id}=event.detail||{};
  if((action==='rename'||action==='delete')&&typeof id==='string')void perform(action,id);
 });
}
