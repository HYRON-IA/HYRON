// HYRON v0.8.2 - Linha Direta. Separate from AI chat.
const $=(selector,root=document)=>root.querySelector(selector);
const elt=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
async function api(path,method='GET',data){const r=await fetch(path,{method,credentials:'same-origin',headers:data?{'content-type':'application/json'}:{},body:data?JSON.stringify(data):undefined});let j;try{j=await r.json()}catch{throw Error('Erro na resposta do servidor')}if(!r.ok)throw Error(j.error||`HTTP ${r.status}`);return j;}
let self=null,active=null,visible=false,poll=null,lastId=0,pendingFile=null,recorder=null,recordChunks=[],recordStream=null;
// HYRON_082_AUDIO_TIMER_V1
let audioTimer=null,audioStartedAt=0;
function audioClock(ms){const t=Math.max(0,Math.floor(ms/1000));return String(Math.floor(t/60)).padStart(2,"0")+":"+String(t%60).padStart(2,"0");}
function clearAudioTimer(){if(audioTimer!==null)clearInterval(audioTimer);audioTimer=null;}
function startAudioTimer(){clearAudioTimer();audioStartedAt=performance.now();const tick=()=>{if(recorder?.state==="recording")notice("🔴 Gravando áudio · "+audioClock(performance.now()-audioStartedAt)+" · Clique em Parar para revisar.");};tick();audioTimer=setInterval(tick,250);}

const panel=elt('div','hyron-dm-panel');panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Mensagens privadas HYRON');
panel.innerHTML=`<div class="hyron-dm-dialog"><div class="hyron-dm-head"><h2>💬 Linha Direta · HYRON</h2><button type="button" data-close>✕ Fechar</button></div><div class="hyron-dm-columns"><div class="hyron-dm-left"><label for="dm-lookup">Novo contato</label><div class="hyron-dm-users"><input id="dm-lookup" maxlength="32" placeholder="Nome do usuário" autocomplete="off"><button type="button" data-search>Buscar</button></div><div class="hyron-dm-users-list" data-users></div><h3>Conversas</h3><div class="hyron-dm-threads" data-threads></div></div><div class="hyron-dm-right"><div class="hyron-dm-title" data-title>Selecione uma conversa</div><div class="hyron-dm-messages" data-messages></div><div class="hyron-dm-status" data-status role="status"></div><form class="hyron-dm-compose" data-form><div class="hyron-dm-composer-main"><textarea data-input placeholder="Escreva uma mensagem privada..." maxlength="4000" disabled></textarea><div class="hyron-dm-media-actions"><button type="button" data-file>📎 Arquivo</button><button type="button" data-photo>📷 Foto</button><button type="button" data-video>🎥 Vídeo</button><button type="button" data-audio>🎤 Áudio</button><input type="file" data-picker hidden><input type="file" accept="image/*" capture="environment" data-camera hidden><input type="file" accept="video/*" capture="environment" data-camera-video hidden></div><div class="hyron-dm-pending" data-pending hidden></div></div><button data-send type="submit" disabled>Enviar</button></form></div></div></div>`;
document.body.append(panel);
const toggle=elt('button','hyron-dm-toggle','💬 Mensagens');toggle.type='button';toggle.id='hyron-dm-open';
const nav=$('.history-bar')||$('.actions')||$('#app');nav?.append(toggle);
const users=$('[data-users]',panel),threads=$('[data-threads]',panel),messages=$('[data-messages]',panel),status=$('[data-status]',panel),title=$('[data-title]',panel),input=$('[data-input]',panel),send=$('[data-send]',panel),lookup=$('#dm-lookup',panel);
function notice(message){status.textContent=message||'';}
function showMessage(m){const bubble=elt('div','hyron-dm-message '+(m.senderId===self?.id?'own':'other'));bubble.textContent=m.content;
for(const f of (m.attachments||[])){
 const url='/api/dm/media/'+encodeURIComponent(f.id);
 const group=elt('div','hyron-dm-attachment');
 const mime=String(f.mime||'');
 if(/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(mime)){const im=elt('img');im.src=url;im.alt=f.name;im.loading='lazy';group.append(im);}
 else if(mime.startsWith('audio/')){const audio=elt('audio');audio.controls=true;audio.preload='none';audio.src=url;group.append(audio);}
 else if(mime.startsWith('video/')){const video=elt('video');video.controls=true;video.preload='metadata';video.src=url;group.append(video);}
 const a=elt('a','', '⬇ '+f.name);a.href=url+'?download=1';a.download=f.name;group.append(a);bubble.append(group);
}
const time=elt('small' ,'',new Date(m.createdAt).toLocaleString('pt-BR'));bubble.append(time);messages.append(bubble);}
async function refreshThreads(){const d=await api('/api/dm/threads');const oldScroll=threads.scrollTop;threads.replaceChildren();for(const t of d.threads){const b=elt('button','hyron-dm-thread'+(active?.id===t.id?' active':''));b.type='button';const top=elt('span','',t.partner);if(t.unread)top.append(elt('span','hyron-dm-pill',String(t.unread)));b.append(top,elt('span','hyron-dm-preview',t.last_text||'Conversa sem mensagens'));b.onclick=()=>selectThread({id:t.id,partner:t.partner});threads.append(b);}threads.scrollTop=oldScroll;const unread=d.threads.reduce((n,t)=>n+(Number(t.unread)||0),0);toggle.textContent='💬 Mensagens'+(unread?` (${unread>99?'99+':unread})`:'');}
async function refreshMessages(){if(!active)return;const id=active.id;const d=await api(`/api/dm/threads/${id}/messages`);if(!active||active.id!==id)return;const newest=d.messages.at(-1)?.id||0;if(newest===lastId&&messages.childElementCount===d.messages.length)return;const atBottom=messages.scrollHeight-messages.scrollTop-messages.clientHeight<130;messages.replaceChildren();for(const m of d.messages)showMessage(m);lastId=newest;if(atBottom||!messages.scrollTop)messages.scrollTop=messages.scrollHeight;await api(`/api/dm/threads/${id}/read`,'POST',{});}
async function selectThread(t){active=t;lastId=0;title.textContent='Conversa com '+t.partner;input.disabled=false;send.disabled=false;messages.replaceChildren();notice('');try{await refreshMessages();await refreshThreads();}catch(e){notice(e.message);}input.focus();}
async function searchUsers(){users.replaceChildren();try{const {users:rows}=await api('/api/dm/users?q='+encodeURIComponent(lookup.value.trim()));if(!rows.length){users.append(elt('span','','Nenhum usuário encontrado'));return;}for(const u of rows){const b=elt('button','hyron-dm-user',u.username);b.type='button';b.onclick=async()=>{try{const thread=await api('/api/dm/threads','POST',{username:u.username});users.replaceChildren();lookup.value='';await selectThread(thread);}catch(e){notice(e.message);}};users.append(b);}}catch(e){notice(e.message);}}
function close(){if(recorder?.state==='recording')recorder.stop();visible=false;panel.hidden=true;document.removeEventListener('keydown',escape);clearInterval(poll);poll=null;toggle.focus();}
function escape(e){if(e.key==='Escape')close();}
async function open(){try{const d=await api('/api/auth/me');self=d.user;visible=true;panel.hidden=false;document.addEventListener('keydown',escape);await refreshThreads();if(active)await refreshMessages();clearInterval(poll);poll=setInterval(async()=>{if(!visible||document.hidden)return;try{await refreshThreads();if(active)await refreshMessages();}catch(e){notice(e.message);}},8000);lookup.focus();}catch(e){notice(e.message);}}
toggle.onclick=open;$('[data-close]',panel).onclick=close;panel.onclick=e=>{if(e.target===panel)close();};$('[data-search]',panel).onclick=searchUsers;lookup.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();searchUsers();}};
const pending=$('[data-pending]',panel),picker=$('[data-picker]',panel),camera=$('[data-camera]',panel),cameraVideo=$('[data-camera-video]',panel);
function setPending(file){pendingFile=file;pending.replaceChildren();pending.hidden=!file;if(!file)return;
 const info=elt('span','',file.name+' · '+(file.size/1048576).toFixed(2)+' MB');const remove=elt('button','','✕ Remover');remove.type='button';remove.onclick=()=>setPending(null);pending.append(info,remove);
 if(file.type.startsWith('audio/')||file.type.startsWith('video/')||file.type.startsWith('image/')){
  const url=URL.createObjectURL(file),media=elt(file.type.startsWith('audio/')?'audio':file.type.startsWith('video/')?'video':'img');media.src=url;
  if(media.tagName!=='IMG')media.controls=true;media.className='hyron-dm-local-preview';media.onloadeddata=()=>{};pending.append(media);
  const previous=pendingFile;const old=remove.onclick;remove.onclick=()=>{URL.revokeObjectURL(url);old();};
 }
}
$('[data-file]',panel).onclick=()=>picker.click();
async function captureMedia(kind){
 if(!navigator.mediaDevices?.getUserMedia){(kind==='photo'?camera:cameraVideo).click();return;}
 let stream;
 try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'},audio:kind==='video'});}catch(e){notice('Camera: '+e.message);return;}
 const cover=elt('div','hyron-dm-capture');const box=elt('div','hyron-dm-capture-box');const live=elt('video');live.autoplay=true;live.muted=true;live.playsInline=true;live.srcObject=stream;
 const actions=elt('div','hyron-dm-capture-actions');const take=elt('button','',kind==='photo'?'📷 Tirar foto':'⏺ Iniciar gravação');const cancel=elt('button','','Cancelar');let camRec=null,chunks=[],limit=null,cancelled=false;
 function cleanup(){if(limit)clearTimeout(limit);if(camRec?.state==='recording')camRec.stop();stream?.getTracks().forEach(t=>t.stop());cover.remove();}
 cancel.onclick=()=>{cancelled=true;cleanup();};cover.onclick=e=>{if(e.target===cover){cancelled=true;cleanup();}};
 take.onclick=()=>{
  if(kind==='photo'){
   const cv=document.createElement('canvas');cv.width=live.videoWidth||640;cv.height=live.videoHeight||480;
   cv.getContext('2d').drawImage(live,0,0,cv.width,cv.height);
   cv.toBlob(blob=>{if(blob)setPending(new File([blob],'foto-'+Date.now()+'.jpg',{type:'image/jpeg'}));cleanup();},'image/jpeg',.88);return;
  }
  if(camRec?.state==='recording'){camRec.stop();take.disabled=true;return;}
  if(typeof MediaRecorder==='undefined'){notice('Gravador de video indisponivel');cleanup();return;}
  const type=['video/webm;codecs=vp8,opus','video/webm','video/mp4'].find(x=>MediaRecorder.isTypeSupported(x));
  camRec=new MediaRecorder(stream,type?{mimeType:type}:undefined);chunks=[];
  camRec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  camRec.onstop=()=>{if(cancelled){cleanup();return;}const blob=new Blob(chunks,{type:camRec.mimeType||'video/webm'});if(blob.size>0&&blob.size<=100*1024*1024){setPending(new File([blob],'video-'+Date.now()+ (blob.type.includes('mp4')?'.mp4':'.webm'),{type:blob.type}));notice('Video pronto para enviar.');}else notice('Video muito grande ou vazio.');cleanup();};
  camRec.start(1000);take.textContent='■ Parar gravação';limit=setTimeout(()=>{if(camRec?.state==='recording')camRec.stop();},60000);
 };
 actions.append(take,cancel);box.append(live,actions);cover.append(box);document.body.append(cover);
}
$('[data-photo]',panel).onclick=()=>captureMedia('photo');$('[data-video]',panel).onclick=()=>captureMedia('video');
for(const el of [picker,camera,cameraVideo])el.onchange=()=>{if(el.files?.[0])setPending(el.files[0]);el.value='';};
const audioButton=$('[data-audio]',panel);
audioButton.onclick=async()=>{
 if(recorder&&recorder.state==='recording'){recorder.stop();return;}
 try{
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw Error('Gravacao indisponivel neste navegador');
  recordStream=await navigator.mediaDevices.getUserMedia({audio:true});
  const choice=['audio/webm;codecs=opus','audio/webm','audio/mp4'].find(t=>MediaRecorder.isTypeSupported(t));
  recorder=new MediaRecorder(recordStream,choice?{mimeType:choice}:undefined);recordChunks=[];
  recorder.ondataavailable=e=>{if(e.data.size)recordChunks.push(e.data);};
  recorder.onstop=()=>{const duration=audioClock(performance.now()-audioStartedAt);clearAudioTimer();recordStream?.getTracks().forEach(t=>t.stop());recordStream=null;audioButton.textContent='🎤 Áudio';const blob=new Blob(recordChunks,{type:recorder.mimeType||'audio/webm'});if(blob.size>0){const ext=blob.type.includes('mp4')?'m4a':'webm';setPending(new File([blob],'audio-'+Date.now()+'.'+ext,{type:blob.type}));notice('Áudio de '+duration+' pronto para enviar.');}};
  recorder.start();audioButton.textContent='■ Parar';startAudioTimer();
 }catch(e){clearAudioTimer();recordStream?.getTracks().forEach(t=>t.stop());recordStream=null;notice('Microfone: '+e.message);}
};
$('[data-form]',panel).onsubmit=async e=>{e.preventDefault();if(!active||(!input.value.trim()&&!pendingFile))return;send.disabled=true;const value=input.value;try{
 let files=[];
 if(pendingFile){if(pendingFile.size<1||pendingFile.size>100*1024*1024)throw Error('Arquivo deve ter ate 100 MB');notice('Enviando '+pendingFile.name+' ao Google Drive...');
 const upload=window.hyronDriveUploadFile;if(typeof upload!=='function')throw Error('Upload do Drive ainda nao carregou');const saved=await upload(pendingFile,n=>notice('Upload: '+n+'%'));files=[{id:saved.id}];}
 await api(`/api/dm/threads/${active.id}/messages`,'POST',{content:value,files});input.value='';setPending(null);notice('');await refreshMessages();await refreshThreads();}catch(err){notice(err.message);}finally{send.disabled=false;}};
// Badge poll only when page is authenticated. Avoid creating background intervals before login.
