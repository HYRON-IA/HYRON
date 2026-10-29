// HYRON v0.8.3 - Ala Coletiva, grupos privados (fase 1).
(()=>{
const make=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e};
async function api(path,method='GET',data){const res=await fetch(path,{method,credentials:'same-origin',headers:data!==undefined?{'content-type':'application/json'}:{},body:data!==undefined?JSON.stringify(data):undefined});const json=await res.json().catch(()=>({error:'Resposta invalida'}));if(!res.ok)throw Error(json.error||('HTTP '+res.status));return json}
const launch=make('button','','👥 Ala Coletiva');launch.type='button';launch.id='hyron-groups-open';
const panel=make('section','hyron-groups-panel');panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Ala Coletiva');panel.setAttribute('aria-modal','true');
const head=make('div','hyron-groups-row');const title=make('h2','','👥 Ala Coletiva · HYRON');title.style.margin='0';const close=make('button','','✕ Fechar');close.type='button';head.append(title,close);head.style.justifyContent='space-between';
const status=make('div','hyron-groups-status');status.setAttribute('role','status');const list=make('div','hyron-groups-list');const workspace=make('div','hyron-groups-workspace hyron-groups-unified');const left=make('aside','hyron-groups-conversations');const right=make('section','hyron-groups-conversation');const create=make('div','hyron-groups-create');const newBtn=make('button','','＋ Criar grupo');newBtn.type='button';
const form=make('form');form.hidden=true;const name=make('input');name.required=true;name.minLength=3;name.maxLength=64;name.placeholder='Nome do grupo';const desc=make('textarea');desc.maxLength=500;desc.placeholder='Descrição (opcional)';const photo=make('input');photo.type='file';photo.accept='image/jpeg,image/png,image/webp';const people=make('div','hyron-groups-people');const submit=make('button','','Criar grupo privado');submit.type='submit';const cancel=make('button','','Cancelar');cancel.type='button';form.append(make('label','','Nome do grupo'),name,make('label','','Descrição'),desc,make('label','','Foto do grupo (opcional)'),photo,make('label','','Integrantes'),people,submit,cancel);create.append(newBtn,form);
const sideTitle=make('h3','','Grupos');const search=make('input');search.type='search';search.placeholder='Pesquisar grupos...';search.setAttribute('aria-label','Pesquisar grupos');left.append(sideTitle,search,create,list);right.append(make('div','hyron-groups-empty','Selecione um grupo para começar a conversar.'));workspace.append(left,right);panel.append(head,status,workspace);document.body.append(panel);const nav=document.querySelector('.history-bar')||document.querySelector('.actions')||document.body;nav.append(launch);
let self=null,users=[],activeGroup=null,refreshTimer=null;const report=t=>{status.textContent=t||''};
function closePanel(){panel.hidden=true;panel.classList.remove('has-group');activeGroup=null;if(refreshTimer){clearInterval(refreshTimer);refreshTimer=null}launch.focus()}
close.onclick=closePanel;panel.addEventListener('click',e=>{if(e.target===panel)closePanel()});
async function selectedUsers(){const result=await api('/api/dm/users?q=');users=result.users||[];people.replaceChildren();for(const u of users){const label=make('label');const cb=make('input');cb.type='checkbox';cb.value=u.id;label.append(cb,make('span','',u.username));people.append(label)}}
let allGroups=[];
function draw(groups){
 allGroups=groups;
 list.replaceChildren();
 const query=(search.value||'').trim().toLocaleLowerCase('pt-BR');
 const shown=groups.filter(g=>String(g.name||'').toLocaleLowerCase('pt-BR').includes(query));
 if(!shown.length)list.append(make('p','hyron-groups-no-results',groups.length?'Nenhum grupo encontrado.':'Você ainda não participa de nenhum grupo.'));
 for(const g of shown){
  const card=make('button','hyron-groups-card'+(activeGroup===g.id?' is-active':''));card.type='button';card.setAttribute('aria-label','Abrir grupo '+g.name);
  const av=make('img');av.alt='';av.src='/api/groups/'+encodeURIComponent(g.id)+'/avatar';av.onerror=()=>{av.replaceWith(make('span','hyron-groups-icon','👥'))};
  const body=make('span','hyron-groups-card-details');body.append(make('strong','',g.name),make('small','',g.memberCount+' participante(s)'));
  card.append(av,body);card.onclick=()=>detail(g.id);list.append(card);
 }
}
search.addEventListener('input',()=>draw(allGroups));
async function refresh(){const data=await api('/api/groups');draw(data.groups||[]);newBtn.hidden=!data.canCreate}
async function detail(id){
 try{
  activeGroup=id;if(refreshTimer){clearInterval(refreshTimer);refreshTimer=null}
  const data=await api('/api/groups/'+encodeURIComponent(id));
  right.replaceChildren();panel.classList.add('has-group');draw(allGroups);
  const layout=make('div','hyron-groups-chat-layout');
  const sidebar=make('div','hyron-groups-chat-members');
  const back=make('button','hyron-groups-mobile-back','← Grupos');back.type='button';back.onclick=()=>{panel.classList.remove('has-group');activeGroup=null;if(refreshTimer){clearInterval(refreshTimer);refreshTimer=null}right.replaceChildren(make('div','hyron-groups-empty','Selecione um grupo para começar a conversar.'));draw(allGroups)};
  const membersHeading=make('h3','','Participantes ('+data.members.length+')');
  sidebar.append(back,membersHeading);
  for(const m of data.members)sidebar.append(make('div','hyron-groups-member',m.username+(m.role==='admin'?' · admin':'')));
  if(data.myRole==='admin'){
   const select=make('select');for(const u of users.filter(u=>!data.members.some(m=>m.id===u.id))){const opt=make('option','',u.username);opt.value=u.id;select.append(opt)}
   const add=make('button','','Adicionar usuário');add.type='button';add.onclick=async()=>{try{if(!select.value)return;await api('/api/groups/'+id+'/members','POST',{userId:select.value});report('Participante adicionado');await detail(id)}catch(e){report(e.message)}};
   sidebar.append(select,add);
  }
  const chat=make('div','hyron-groups-chat');
  const heading=make('div','hyron-groups-chat-heading');heading.append(make('strong','',data.group.name),make('small','',data.group.description||'Grupo privado'));
  const feed=make('div','hyron-groups-chat-feed');feed.setAttribute('aria-live','polite');
  const older=make('button','','Carregar mensagens anteriores');older.type='button';older.hidden=true;
  const composer=make('form');composer.className='hyron-groups-chat-composer';
  const input=make('textarea');input.placeholder='Escreva uma mensagem para o grupo...';input.maxLength=4000;input.required=true;input.rows=2;
  const send=make('button','','Enviar');send.type='submit';composer.append(input,send);
  const info=make('details','hyron-groups-members-info');const summary=make('summary','','Participantes ('+data.members.length+')');info.append(summary,sidebar);heading.append(back,info);
  chat.append(heading,older,feed,composer);layout.append(chat);right.append(layout);
  let cursor=null,firstLoad=true;
  function drawMessages(messages,prepend){
   const wasAtBottom=feed.scrollHeight-feed.scrollTop-feed.clientHeight<80;
   const oldHeight=feed.scrollHeight;
   const fragment=document.createDocumentFragment();
   for(const m of messages){
    const mine=m.senderId===self?.id;
    const row=make('div','hyron-groups-msg'+(mine?' is-me':''));
    const avatar=make('img','hyron-groups-msg-avatar');
    avatar.alt='Foto de perfil de '+m.senderName;
    avatar.loading='lazy';avatar.decoding='async';
    avatar.src='/api/profile/avatar/'+encodeURIComponent(m.senderId);
    avatar.onerror=()=>{const fallback=make('span','hyron-groups-msg-avatar hyron-groups-msg-fallback',String(m.senderName||'?').trim().slice(0,1).toUpperCase());fallback.setAttribute('aria-hidden','true');avatar.replaceWith(fallback)};
    const bubble=make('div','hyron-groups-msg-bubble');
    bubble.append(make('strong','',m.senderName),make('div','hyron-groups-msg-content',m.content));
    const date=new Date(m.createdAt);bubble.append(make('small','',Number.isNaN(date.getTime())?m.createdAt:date.toLocaleString('pt-BR')));
    row.append(avatar,bubble);row.dataset.mid=m.id;fragment.append(row);
   }
   if(prepend){feed.prepend(fragment);feed.scrollTop=feed.scrollHeight-oldHeight+feed.scrollTop}
   else{feed.replaceChildren(fragment);if(firstLoad||wasAtBottom)feed.scrollTop=feed.scrollHeight}
   firstLoad=false;
  }
  async function load(before){
   const url='/api/groups/'+encodeURIComponent(id)+'/messages'+(before?'?before='+encodeURIComponent(before):'');
   const result=await api(url);
   if(activeGroup!==id)return;
   drawMessages(result.messages||[],Boolean(before));cursor=result.nextBefore;older.hidden=!cursor;
  }
  older.onclick=async()=>{older.disabled=true;try{if(cursor)await load(cursor)}catch(e){report(e.message)}finally{older.disabled=false}};
  composer.onsubmit=async e=>{e.preventDefault();const content=input.value.trim();if(!content)return;send.disabled=true;
   try{await api('/api/groups/'+id+'/messages','POST',{content});input.value='';await load(null);input.focus();report('')}
   catch(err){report(err.message)}finally{send.disabled=false}
  };
  input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();composer.requestSubmit()}});
  await load(null);
  refreshTimer=setInterval(async()=>{if(panel.hidden||activeGroup!==id)return;try{if(!cursor)await load(null)}catch{}},10000);
 }catch(e){report(e.message)}
}
function jpegImage(file){return new Promise((resolve,reject)=>{if(!file){resolve(null);return}if(file.size>10*1024*1024){reject(Error('Imagem original acima de 10 MB'));return}const im=new Image(),url=URL.createObjectURL(file);im.onload=()=>{try{const cv=document.createElement('canvas');cv.width=cv.height=192;const side=Math.min(im.naturalWidth,im.naturalHeight),sx=(im.naturalWidth-side)/2,sy=(im.naturalHeight-side)/2;cv.getContext('2d').drawImage(im,sx,sy,side,side,0,0,192,192);resolve(cv.toDataURL('image/jpeg',.72))}catch(e){reject(e)}finally{URL.revokeObjectURL(url)}};im.onerror=()=>{URL.revokeObjectURL(url);reject(Error('Imagem invalida'))};im.src=url})}
launch.onclick=async()=>{panel.hidden=false;panel.classList.remove('has-group');activeGroup=null;right.replaceChildren(make('div','hyron-groups-empty','Selecione um grupo para começar a conversar.')); report('Carregando grupos...');try{const d=await api('/api/auth/me');self=d.user;await Promise.all([refresh(),selectedUsers()]);report('')}catch(e){report(e.message)}};
newBtn.onclick=()=>{form.hidden=!form.hidden};cancel.onclick=()=>{form.hidden=true};form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;report('Criando grupo...');try{const image=await jpegImage(photo.files?.[0]);await api('/api/groups','POST',{name:name.value,description:desc.value,image,members:[...people.querySelectorAll('input:checked')].map(e=>e.value)});form.reset();form.hidden=true;await refresh();report('Grupo privado criado.')}catch(err){report(err.message)}finally{submit.disabled=false}};
})();
