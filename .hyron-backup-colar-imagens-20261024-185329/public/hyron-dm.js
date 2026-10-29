// HYRON_CONFIRM_CUSTOM_V1: dialogo tematico, acessivel e sem janela nativa do navegador.
function hyronDmConfirm(message){
 return new Promise(resolve=>{
  const previous=document.activeElement;
  const shade=document.createElement('div');shade.className='hyron-dm-confirm-overlay';
  const dialog=document.createElement('section');dialog.className='hyron-dm-confirm-dialog';
  dialog.setAttribute('role','alertdialog');dialog.setAttribute('aria-modal','true');
  const heading=document.createElement('h3');heading.textContent='Excluir mensagem?';heading.id='hyron-dm-confirm-title';
  const info=document.createElement('p');info.textContent=String(message);info.id='hyron-dm-confirm-description';
  dialog.setAttribute('aria-labelledby',heading.id);dialog.setAttribute('aria-describedby',info.id);
  const buttons=document.createElement('div');buttons.className='hyron-dm-confirm-actions';
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancelar';cancel.className='hyron-dm-confirm-cancel';
  const accept=document.createElement('button');accept.type='button';accept.textContent='Excluir mensagem';accept.className='hyron-dm-confirm-danger';
  buttons.append(cancel,accept);dialog.append(heading,info,buttons);shade.append(dialog);document.body.append(shade);
  let finished=false;
  function finish(value){if(finished)return;finished=true;document.removeEventListener('keydown',onKey,true);shade.remove();if(previous?.isConnected&&typeof previous.focus==='function')previous.focus();resolve(value)}
  function onKey(e){if(e.key==='Escape'){e.preventDefault();e.stopPropagation();finish(false)}else if(e.key==='Tab'){const first=cancel,last=accept;if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}}
  document.addEventListener('keydown',onKey,true);
  cancel.onclick=()=>finish(false);accept.onclick=()=>finish(true);shade.onclick=e=>{if(e.target===shade)finish(false)};
  cancel.focus();
 });
}
// HYRON v0.8.2 - Linha Direta. Separate from AI chat.
const $=(selector,root=document)=>root.querySelector(selector);
const elt=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
async function api(path,method='GET',data){const r=await fetch(path,{method,credentials:'same-origin',headers:(!['GET','HEAD'].includes(method))?{'content-type':'application/json'}:{},body:data?JSON.stringify(data):undefined});let j;try{j=await r.json()}catch{throw Error('Erro na resposta do servidor')}if(!r.ok)throw Error(j.error||`HTTP ${r.status}`);return j;}
let self=null,active=null,visible=false,poll=null,lastId=0,pendingFile=null,recorder=null,recordChunks=[],recordStream=null;
// HYRON_DM_EDITS_LIVE_V1: compara conteudo, nao apenas quantidade de mensagens.
let lastRenderKey='';
// HYRON_082_AUDIO_TIMER_V1
let audioTimer=null,audioStartedAt=0;
function audioClock(ms){const t=Math.max(0,Math.floor(ms/1000));return String(Math.floor(t/60)).padStart(2,"0")+":"+String(t%60).padStart(2,"0");}
function clearAudioTimer(){if(audioTimer!==null)clearInterval(audioTimer);audioTimer=null;}
function startAudioTimer(){clearAudioTimer();audioStartedAt=performance.now();const tick=()=>{if(recorder?.state==="recording")notice("🔴 Gravando áudio · "+audioClock(performance.now()-audioStartedAt)+" · Clique em Parar para revisar.");};tick();audioTimer=setInterval(tick,250);}

const panel=elt('div','hyron-dm-panel');panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Mensagens privadas HYRON');
panel.innerHTML=`<div class="hyron-dm-dialog"><div class="hyron-dm-head"><h2>💬 Linha Direta · HYRON</h2><button type="button" data-close>✕ Fechar</button></div><div class="hyron-dm-columns"><div class="hyron-dm-left"><h3>Conversas</h3><div class="hyron-dm-users"><input id="dm-lookup" maxlength="32" placeholder="Pesquisar conversas ou usuários" aria-label="Pesquisar conversas ou usuários" autocomplete="off"></div><div class="hyron-dm-threads" data-threads></div></div><div class="hyron-dm-right"><div class="hyron-dm-title" data-title>Selecione uma conversa</div><div class="hyron-dm-messages" data-messages></div><div class="hyron-dm-status" data-status role="status"></div><form class="hyron-dm-compose" data-form><div class="hyron-dm-composer-main"><textarea data-input placeholder="Escreva uma mensagem privada..." maxlength="50000" disabled></textarea><div class="hyron-dm-media-actions"><button type="button" data-file>📎 Arquivo</button><button type="button" data-photo>📷 Foto</button><button type="button" data-video>🎥 Vídeo</button><button type="button" data-audio>🎤 Áudio</button><input type="file" data-picker hidden><input type="file" accept="image/*" capture="environment" data-camera hidden><input type="file" accept="video/*" capture="environment" data-camera-video hidden></div><div class="hyron-dm-pending" data-pending hidden></div></div><button data-send type="submit" disabled>Enviar</button></form></div></div></div>`;
document.body.append(panel);
const toggle=elt('button','hyron-dm-toggle','💬 Mensagens');toggle.type='button';toggle.id='hyron-dm-open';
const nav=$('.history-bar')||$('.actions')||$('#app');nav?.append(toggle);
const threads=$('[data-threads]',panel),messages=$('[data-messages]',panel),status=$('[data-status]',panel),title=$('[data-title]',panel),input=$('[data-input]',panel),send=$('[data-send]',panel),lookup=$('#dm-lookup',panel);
const cancelEdit=elt('button','hyron-dm-cancel-edit','Cancelar');cancelEdit.type='button';cancelEdit.hidden=true;send.parentElement.insertBefore(cancelEdit,send);
let editingDm=null;
function notice(message){status.textContent=message||'';}
function dmTimestamp(m){const base=new Date(m.createdAt).toLocaleString('pt-BR');return m.editedAt?base+' · editada':base;}
function stopEditingDm(resetText=true){editingDm=null;send.textContent='Enviar';cancelEdit.hidden=true;if(resetText)input.value='';}
function beginEditingDm(m){if((Array.isArray(m.attachments)?m.attachments:[]).length){notice('Edicao disponivel apenas para mensagens sem anexo.');return;}if(recorder&&recorder.state!=='inactive'){notice('Conclua a gravacao antes de editar.');return;}setPending(null);editingDm={id:m.id};input.disabled=false;send.disabled=false;input.value=String(m.content||'');send.textContent='Salvar';cancelEdit.hidden=false;notice('Editando mensagem. Pressione Esc para cancelar.');input.focus();input.setSelectionRange(input.value.length,input.value.length);}
cancelEdit.onclick=()=>{stopEditingDm();notice('Edicao cancelada.');input.focus();};
function showMessage(m){const bubble=elt('div','hyron-dm-message '+(m.senderId===self?.id?'own':'other'));
 // HYRON_AUDIO_SOURCE_RENDER_FIX_082: identifica avisos automaticos de arquivo de audio, sem apagar mensagens com texto real.
 const attachments=Array.isArray(m.attachments)?m.attachments:[];
 const voice=attachments.length===1 && (String(attachments[0].mime||'').startsWith('audio/')||/\.(webm|ogg|mp3|wav|m4a|opus|aac)$/i.test(String(attachments[0].name||'')));
 const fileName=String(attachments[0]?.name||'');
 const messageText=String(m.content||'').trim();
 const normalizedText=messageText.replace(/^[\s📎📁🎵🎤🔊]+/gu,'').trim();
 const nameOnly=voice && (messageText==='' || normalizedText===fileName || normalizedText==='⬇ '+fileName || /^\[(?:audio|arquivo|anexo)\]$/i.test(normalizedText));
 bubble.classList.toggle('hyron-dm-audio-only',!!nameOnly);
 if(!nameOnly&&messageText){bubble.append(elt('div','hyron-dm-message-content',m.content));}
 const isNative= /^a8400000-0000-4000-8000-00000000000[1-4]$/i.test(String(m.senderId||''));
 if(isNative){
  const label=elt('div','hyron-dm-native-author');
  label.textContent=String(m.senderName||'Interno HYRON');
  bubble.prepend(label);
 }
 for(const f of attachments){
  const url='/api/dm/media/'+encodeURIComponent(f.id);
  const group=elt('div','hyron-dm-attachment');
  const mime=String(f.mime||'');
  if(/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(mime)){const im=elt('img');im.src=url;im.alt=f.name;im.loading='lazy';group.append(im);}
  else if(mime.startsWith('audio/')){
   const audio=elt('audio');audio.controls=true;audio.preload='metadata';
   const duration=elt('span','hyron-dm-audio-duration','Duração: carregando…');
   duration.style.cssText='display:block;font-size:12px;color:#b6e5d5;margin:2px 0 3px';
   const fmt=(n)=>{const sec=Math.max(0,Math.floor(n));return String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');};
   const update=()=>{let n=audio.duration;if(!Number.isFinite(n)||n<=0){try{if(audio.seekable?.length)n=audio.seekable.end(audio.seekable.length-1);}catch(_){}} duration.textContent=Number.isFinite(n)&&n>0?'Duração: '+fmt(n):'Duração: indisponível antes do play';};
   audio.addEventListener('loadedmetadata',update);audio.addEventListener('durationchange',update);audio.addEventListener('loadeddata',update);audio.addEventListener('error',()=>{duration.textContent='Duração indisponível';});
   audio.src=url;group.append(duration,audio);
  }
  else if(mime.startsWith('video/')){const video=elt('video');video.controls=true;video.preload='metadata';video.src=url;group.append(video);}
  if(!(bubble.classList.contains('hyron-dm-audio-only')&&mime.startsWith('audio/'))){const a=elt('a','', '⬇ '+f.name);a.href=url+'?download=1';a.download=f.name;group.append(a);}bubble.append(group);
 }
 const meta=elt('div','hyron-dm-message-meta');
 meta.append(elt('small','hyron-dm-message-time',dmTimestamp(m)));
 if(m.senderId===self?.id){
  const actions=elt('div','hyron-dm-message-actions');
  if(!attachments.length){const edit=elt('button','hyron-dm-message-action is-edit','✏ Editar');edit.type='button';edit.onclick=()=>beginEditingDm(m);actions.append(edit);}
  const del=elt('button','hyron-dm-message-action is-delete','🗑 Excluir');del.type='button';del.onclick=async()=>{if(!await hyronDmConfirm('Excluir esta mensagem para todos? Esta acao nao pode ser desfeita.'))return;del.disabled=true;try{await api('/api/dm/threads/'+encodeURIComponent(active.id)+'/messages/'+encodeURIComponent(m.id),'DELETE');if(editingDm?.id===m.id)stopEditingDm();lastId=0;await refreshMessages();notice('Mensagem excluída.');}catch(e){notice(e.message);del.disabled=false;}};actions.append(del);
  meta.append(actions);
 }
 bubble.append(meta);messages.append(bubble);}
// HYRON_DM_UNIFIED_LIST_082: historico e usuarios sem mensagens na mesma lista.
let knownUsers=[],knownThreads=[];
function renderThreadList(){
 const oldScroll=threads.scrollTop,filter=lookup.value.trim().toLocaleLowerCase('pt-BR');
 threads.replaceChildren();
 const existing=new Set();
 for(const t of knownThreads){
  const key=String(t.partner||'').toLocaleLowerCase('pt-BR');existing.add(key);
  if(!key.includes(filter))continue;
  const b=elt('button','hyron-dm-thread'+(active?.id===t.id?' active':''));b.type='button';
  const top=elt('span','',t.partner);if(t.unread)top.append(elt('span','hyron-dm-pill',String(t.unread)));
  const person=knownUsers.find(u=>String(u.username).toLowerCase()===key);if(person){const avatar=elt('img','hyron-dm-person-avatar');avatar.alt='';avatar.loading='lazy';avatar.setAttribute('data-avatar-url','/api/profile/avatar/'+encodeURIComponent(person.id));avatar.src=avatar.getAttribute('data-avatar-url');avatar.onerror=()=>{avatar.hidden=true};b.append(avatar);}
  b.append(top,elt('span','hyron-dm-preview',t.last_text||'Conversa sem mensagens'));
  b.onclick=()=>selectThread({id:t.id,partner:t.partner});threads.append(b);
 }
 for(const u of knownUsers){
  const key=String(u.username||'').toLocaleLowerCase('pt-BR');
  if(!key||existing.has(key)||!key.includes(filter))continue;
  const b=elt('button','hyron-dm-thread');b.type='button';
  const avatar=elt('img','hyron-dm-person-avatar');avatar.alt='';avatar.loading='lazy';avatar.setAttribute('data-avatar-url','/api/profile/avatar/'+encodeURIComponent(u.id));avatar.src=avatar.getAttribute('data-avatar-url');avatar.onerror=()=>{avatar.hidden=true};b.append(avatar);
  b.append(elt('span','',u.username),elt('span','hyron-dm-preview','Iniciar conversa'));
  b.onclick=async()=>{b.disabled=true;try{const t=await api('/api/dm/threads','POST',{username:u.username});await selectThread(t);}catch(e){notice(e.message);b.disabled=false;}};
  threads.append(b);
 }
 if(!threads.childElementCount)threads.append(elt('span','hyron-dm-preview',filter?'Nenhum usuário encontrado':'Nenhuma conversa disponível'));
 threads.scrollTop=oldScroll;
}
async function refreshThreads(){
 const d=await api('/api/dm/threads');knownThreads=d.threads||[];renderThreadList();
 const unread=knownThreads.reduce((n,t)=>n+(Number(t.unread)||0),0);
 toggle.textContent='💬 Mensagens'+(unread?` (${unread>99?'99+':unread})`:'');
}
async function loadAvailableUsers(){
 const d=await api('/api/dm/users?q=');knownUsers=(d.users||[]).sort((a,b)=>a.username.localeCompare(b.username,'pt-BR'));
 renderThreadList();
}
async function refreshMessages(){if(!active)return;const id=active.id;const d=await api(`/api/dm/threads/${id}/messages`);if(!active||active.id!==id)return;const newest=d.messages.at(-1)?.id||0;const key=JSON.stringify(d.messages.map(m=>[m.id,m.content,m.editedAt,m.attachments?.length]));if(key===lastRenderKey)return;lastRenderKey=key;const atBottom=messages.scrollHeight-messages.scrollTop-messages.clientHeight<130;messages.replaceChildren();for(const m of d.messages)showMessage(m);lastId=newest;if(atBottom||!messages.scrollTop)messages.scrollTop=messages.scrollHeight;await api(`/api/dm/threads/${id}/read`,'POST',{});}
async function selectThread(t){active=t;lastId=0;lastRenderKey="";stopEditingDm();title.textContent='Conversa com '+t.partner;input.disabled=false;send.disabled=false;messages.replaceChildren();notice('');try{await refreshMessages();await refreshThreads();}catch(e){notice(e.message);}input.focus();}

function close(){if(recorder&&recorder.state!=='inactive')discardRecording();visible=false;panel.hidden=true;document.removeEventListener('keydown',escape);clearInterval(poll);poll=null;toggle.focus();}
function escape(e){if(e.key==='Escape')close();}
async function open(){try{const d=await api('/api/auth/me');self=d.user;visible=true;panel.hidden=false;document.addEventListener('keydown',escape);await Promise.all([refreshThreads(),loadAvailableUsers()]);if(active)await refreshMessages();clearInterval(poll);poll=setInterval(async()=>{if(!visible||document.hidden)return;try{await refreshThreads();if(active)await refreshMessages();}catch(e){notice(e.message);}},8000);lookup.focus();}catch(e){notice(e.message);}}
window.hyronOpenDmThread=async id=>{await open();const d=await api('/api/dm/threads');const t=d.threads.find(x=>x.id===id);if(t)await selectThread({id:t.id,partner:t.partner});};
toggle.onclick=open;$('[data-close]',panel).onclick=close;panel.onclick=e=>{if(e.target===panel)close();};lookup.onkeydown=e=>{if(e.key==='Enter')e.preventDefault();};
// HYRON_DM_UNIFIED_FILTER_082: pesquisa local na lista unica.
lookup.addEventListener('input',renderThreadList);
input.addEventListener('keydown',e=>{if(e.key==='Escape'&&editingDm){e.preventDefault();stopEditingDm();notice('Edicao cancelada.');}});
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
// HYRON_DM_WHATSAPP_RECORDER_082
const audioButton=$('[data-audio]',panel);

  // HYRON live voice visualizer: only local browser PCM amplitude, never uploaded.
  function hyronCreateLiveWave(microphone, host){
    const bars=Array.from(host.children);
    const AudioCtx=window.AudioContext||window.webkitAudioContext;
    if(!AudioCtx||!bars.length)return {update(){},stop(){}};
    let context,analyser,source,buffer,stopped=false;
    try{
      context=new AudioCtx();
      analyser=context.createAnalyser();analyser.fftSize=1024;analyser.smoothingTimeConstant=.6;
      source=context.createMediaStreamSource(microphone);source.connect(analyser);
      buffer=new Uint8Array(analyser.fftSize);
      context.resume().catch(()=>{});
    }catch(e){try{context?.close()}catch(_){}return {update(){},stop(){}};}
    return {
      update(active){
        if(stopped)return;
        if(!active){bars.forEach(b=>b.style.height='4px');return;}
        analyser.getByteTimeDomainData(buffer);
        const stride=Math.max(1,Math.floor(buffer.length/bars.length));
        bars.forEach((bar,i)=>{
          let peak=0;const start=i*stride,end=Math.min(buffer.length,start+stride);
          for(let k=start;k<end;k++)peak=Math.max(peak,Math.abs(buffer[k]-128)/128);
          const previous=Number(bar.dataset.waveLevel||0);
          const level=Math.max(0,Math.min(1,previous*.35+peak*.65));
          bar.dataset.waveLevel=String(level);
          bar.style.height=(4+Math.round(level*25))+'px';
        });
      },
      stop(){stopped=true;try{source.disconnect()}catch(_){}try{analyser.disconnect()}catch(_){}try{context.close()}catch(_){}bars.forEach(b=>{b.style.height='4px';delete b.dataset.waveLevel;});}
    };
  }

const recUI=elt('div','hyron-dm-voice-compose');recUI.hidden=true;
recUI.innerHTML=`<div class="hyron-dm-voice-top"><span class="hyron-dm-record-dot" aria-hidden="true"></span><strong data-voice-time>00:00</strong><div class="hyron-dm-voice-wave" aria-hidden="true"></div><span data-voice-state>Gravando</span></div><div class="hyron-dm-voice-controls"><button type="button" data-voice-cancel title="Descartar gravação">🗑 Descartar</button><button type="button" data-voice-pause>⏸ Pausar</button><button type="button" data-voice-finish>✓ Revisar</button></div>`;
const voiceActions=$('.hyron-dm-media-actions',panel);
voiceActions.parentElement.insertBefore(recUI,voiceActions.nextSibling);
const voiceTime=$('[data-voice-time]',recUI),voiceState=$('[data-voice-state]',recUI);
const dmWaveHost=$('.hyron-dm-voice-wave',recUI);for(let i=0;i<29;i++){const b=document.createElement('span');b.style.height='4px';dmWaveHost.append(b)}
let hyronDmWave=null;
const pauseVoice=$('[data-voice-pause]',recUI),finishVoice=$('[data-voice-finish]',recUI);
let recordedElapsed=0,recordTick=0,voiceTimer=null,discardVoice=false,voiceBusy=false;
function elapsedVoice(){return recordedElapsed+(recorder?.state==='recording'?performance.now()-recordTick:0);}
function updateVoiceUI(){voiceTime.textContent=audioClock(elapsedVoice());hyronDmWave?.update(recorder?.state==='recording');}
function stopVoiceUI(){hyronDmWave?.stop();hyronDmWave=null;clearInterval(voiceTimer);voiceTimer=null;recUI.hidden=true;audioButton.hidden=false;audioButton.disabled=false;}
function discardRecording(){discardVoice=true;if(recorder&&recorder.state!=='inactive')recorder.stop();else{stopVoiceUI();recordStream?.getTracks().forEach(t=>t.stop());recordStream=null;}notice('Gravação descartada.');}
$('[data-voice-cancel]',recUI).onclick=discardRecording;
pauseVoice.onclick=()=>{if(!recorder)return;if(recorder.state==='recording'){recordedElapsed+=performance.now()-recordTick;recorder.pause();pauseVoice.textContent='▶ Continuar';voiceState.textContent='Pausada';recUI.classList.add('paused');}else if(recorder.state==='paused'){recordTick=performance.now();recorder.resume();pauseVoice.textContent='⏸ Pausar';voiceState.textContent='Gravando';recUI.classList.remove('paused');}updateVoiceUI();};
finishVoice.onclick=()=>{if(!recorder||recorder.state==='inactive')return;recordedElapsed=elapsedVoice();recorder.stop();};
async function startVoice(){if(voiceBusy||recorder&&recorder.state!=='inactive')return;if(!active){notice('Selecione uma conversa antes de gravar.');return;}voiceBusy=true;audioButton.disabled=true;
 try{if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw Error('Gravação indisponível neste navegador');
 const stream=await navigator.mediaDevices.getUserMedia({audio:true});recordStream=stream;
 const choice=['audio/webm;codecs=opus','audio/webm','audio/mp4'].find(t=>MediaRecorder.isTypeSupported(t));
 recorder=new MediaRecorder(stream,choice?{mimeType:choice}:undefined);hyronDmWave?.stop();hyronDmWave=hyronCreateLiveWave(stream,dmWaveHost);recordChunks=[];discardVoice=false;recordedElapsed=0;recordTick=performance.now();
 recorder.ondataavailable=e=>{if(e.data.size)recordChunks.push(e.data);};
 recorder.onerror=()=>{notice('Falha na gravação de voz.');discardRecording();};
 recorder.onstop=()=>{const ms=elapsedVoice();const mime=recorder.mimeType||'audio/webm';const pieces=[...recordChunks];const canceled=discardVoice;recordStream?.getTracks().forEach(t=>t.stop());recordStream=null;stopVoiceUI();recorder=null;
 if(canceled)return;const blob=new Blob(pieces,{type:mime});if(blob.size){const ext=mime.includes('mp4')?'m4a':'webm';setPending(new File([blob],'audio-'+Date.now()+'.'+ext,{type:mime}));notice('Áudio de '+audioClock(ms)+' pronto para ouvir, descartar ou enviar.');}else notice('Gravação vazia.');};
 recorder.start(250);audioButton.hidden=true;recUI.hidden=false;pauseVoice.textContent='⏸ Pausar';voiceState.textContent='Gravando';recUI.classList.remove('paused');voiceTimer=setInterval(updateVoiceUI,150);updateVoiceUI();
 }catch(e){recordStream?.getTracks().forEach(t=>t.stop());recordStream=null;stopVoiceUI();notice('Microfone: '+e.message);}finally{voiceBusy=false;audioButton.disabled=false;}}
audioButton.onclick=startVoice;
// Keyboard/mouse-friendly controls; pointer-gesture lock can be added without changing the recorder state machine.

$('[data-form]',panel).onsubmit=async e=>{e.preventDefault();if(recorder&&recorder.state!=='inactive'){notice('Conclua a gravação antes de enviar.');return;}if(!active||(!input.value.trim()&&!pendingFile))return;send.disabled=true;const value=input.value;try{
 if(editingDm){if(pendingFile)throw Error('Remova o arquivo pendente antes de salvar a edicao.');await api('/api/dm/threads/'+encodeURIComponent(active.id)+'/messages/'+encodeURIComponent(editingDm.id),'PATCH',{content:value});stopEditingDm();lastRenderKey='';notice('Mensagem editada.');await refreshMessages();await refreshThreads();return;}
 let files=[];
 const longText=value.length>8000;
 if(longText&&pendingFile)throw Error('Texto longo: envie o arquivo pendente separadamente antes de enviar este texto.');
 let messageFile=pendingFile;
 let contentToSend=value;
 if(longText){const stamp=new Date().toISOString().replace(/[:.]/g,'-');messageFile=new File([new Blob([value],{type:'text/plain;charset=utf-8'})],'mensagem-'+stamp+'.txt',{type:'text/plain'});contentToSend='📄 Texto longo convertido automaticamente em TXT ('+value.length+' caracteres).';}
 if(messageFile){if(messageFile.size<1||messageFile.size>100*1024*1024)throw Error('Arquivo deve ter ate 100 MB');notice('Enviando '+messageFile.name+' ao Google Drive...');
 const upload=window.hyronDriveUploadFile;if(typeof upload!=='function')throw Error('Upload do Drive ainda nao carregou');const saved=await upload(messageFile,n=>notice('Upload: '+n+'%'));files=[{id:saved.id}];}
 await api(`/api/dm/threads/${active.id}/messages`,'POST',{content:contentToSend,files});input.value='';setPending(null);notice('');await refreshMessages();await refreshThreads();}catch(err){notice(err.message);}finally{send.disabled=false;send.textContent=editingDm?'Salvar':'Enviar';}};
// Badge poll only when page is authenticated. Avoid creating background intervals before login.
