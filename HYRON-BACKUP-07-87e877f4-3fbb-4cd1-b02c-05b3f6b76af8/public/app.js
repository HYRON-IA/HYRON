import { createHistoryActions, bindHistoryActions } from './history-actions.js'; // HYRON_ALFA614_HISTORY_ACTIONS
import { setupRouterDiagnostics } from './router-diagnostics.js'; // HYRON_ROUTER_DIAGNOSTICS_V068
import { renderUserAttachmentMessage, releaseAttachmentCards } from './attachment-cards.js'; // HYRON_V067_ATTACHMENT_CARDS
import './file-preview.js'; // HYRON_PREVIEW_V066
// HYRON_ATTACHMENT_DISPLAY_FIX_V0600A
import './attachments.js'; // HYRON_ATTACHMENTS_V0600
import './sidebar.js'; // HYRON_SIDEBAR_V0524
// HYRON_RICH_MESSAGES_V0520
import { renderRichMessage, addReplyCopyButton } from './rich-render.js';
import { validateVoicePackage } from './voice-package.js';
const $=s=>document.querySelector(s),chat=$('#chat'),form=$('#form'),input=$('#prompt'),provider=$('#provider'),select=$('#conversation');
let user=null,conversations=[],current=null,speaking=false;
const voiceKey='hyron_voice_v05',rateKey='hyron_rate_v05',englishKey='hyron_english_names_v0516',nameKey='hyron_name_spelling_v0516d',nameLangKey='hyron_name_language_v0516d';
let selectedVoice='',voiceRate=1,englishNames=true,nameSpelling='Ai ron',nameLanguage='pt-BR';
function voicePrefKey(k){return `${k}_${user?.id||'guest'}`;}
function loadVoicePrefs(){selectedVoice=localStorage.getItem(voicePrefKey(voiceKey))||'';const saved=Number(localStorage.getItem(voicePrefKey(rateKey))||'1');voiceRate=Number.isFinite(saved)?Math.max(.01,Math.min(3,saved)):1;englishNames=localStorage.getItem(voicePrefKey(englishKey))!=='false';$('#english-names').checked=englishNames;nameSpelling=localStorage.getItem(voicePrefKey(nameKey))||'Ai ron';nameLanguage=localStorage.getItem(voicePrefKey(nameLangKey))||'pt-BR';$('#name-spelling').value=nameSpelling;$('#name-language').value=nameLanguage;updateRateUI();updateVoices();}
function voices(){return 'speechSynthesis' in window?speechSynthesis.getVoices().filter(v=>v.lang.toLowerCase().startsWith('pt')):[];}
function updateVoices(){
 const picker=$('#voice');if(!picker)return;
 const available=voices();picker.replaceChildren(new Option('Padrão do dispositivo',''));
 for(const v of available)picker.add(new Option(`${v.name} (${v.lang})`,v.voiceURI));
 if(available.some(v=>v.voiceURI===selectedVoice))picker.value=selectedVoice;else picker.value='';
 $('#voice-info').textContent=available.length?`${available.length} voz(es) em português detectada(s). A qualidade neural depende do navegador e do sistema.`:'Nenhuma voz em português detectada. Tente o Microsoft Edge ou instale vozes no sistema.';
}
// Escala personalizada: 1x visual = 3x no speechSynthesis; 3x visual = 9x.
// Os motores de voz podem limitar a velocidade efetiva, mesmo dentro da faixa solicitada.
function updateRateUI(){
 const slider=$('#voice-rate'),out=$('#rate-value'),info=$('#speed-info');
 slider.value=String(voiceRate);
 out.textContent=voiceRate.toFixed(2).replace('.',',')+'×';
 const realRate=voiceRate*3;
 info.textContent=`Escala HYRON: ${voiceRate.toFixed(2).replace('.',',')}× visual = ${realRate.toFixed(2).replace('.',',')}× solicitado ao narrador. A velocidade efetiva depende do navegador e da voz. Mudanças valem para a próxima narração.`;
}
const englishTerms=[
 ['Hugging Face','Hugging Face'],['Visual Studio Code','Visual Studio Code'],
 ['Cloudflare','Cloudflare'],['JavaScript','JavaScript'],['TypeScript','TypeScript'],
 ['GitHub','GitHub'],['Windows','Windows'],['Python','Python'],
 ['OpenAI','Open A I'],['VS Code','V S Code']
];
const escapeRx=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
// Limitar substituições a nomes conhecidos evita trocar palavras portuguesas acidentalmente.
const englishMatcher=new RegExp('(?<![\\p{L}\\p{N}_])('+englishTerms.map(([x])=>escapeRx(x)).join('|')+')(?![\\p{L}\\p{N}_])','giu');
// HYRON e um nome proprio: aplicar pronuncia configuravel mesmo sem reconhecimento de ingles.
// Usar um segmento separado permite escolher a voz/idioma sem alterar texto exibido ou historico.
const narrationTerms=[...englishTerms,['HYRON','']];
const nameAndEnglishMatcher=new RegExp('(?<![\\p{L}\\p{N}_])('+narrationTerms.map(([x])=>escapeRx(x)).join('|')+')(?![\\p{L}\\p{N}_])','giu');
function splitForNarration(text){
 const chunks=[];let previous=0;
 for(const match of text.matchAll(nameAndEnglishMatcher)){
  const isName=match[0].toUpperCase()==='HYRON';
  if(!isName&&!englishNames)continue;
  if(match.index>previous)chunks.push({text:text.slice(previous,match.index),lang:'pt-BR'});
  if(isName)chunks.push({text:nameSpelling||'Ai ron',lang:nameLanguage,original:match[0],hyronName:true});
  else {
   const found=englishTerms.find(([word])=>word.toLowerCase()===match[0].toLowerCase());
   chunks.push({text:found[1],lang:'en-US',original:match[0]});
  }
  previous=match.index+match[0].length;
 }
 if(previous<text.length)chunks.push({text:text.slice(previous),lang:'pt-BR'});
 return chunks.length?chunks:[{text,lang:'pt-BR'}];
}
function narrateParts(parts,forceNormalRate=false,onComplete=null){
 if(!('speechSynthesis' in window))return;
 speechSynthesis.cancel();
 const nativeRate=forceNormalRate?1:Math.max(.1,Math.min(9,voiceRate*3));
 const available=speechSynthesis.getVoices();
 const pt=available.find(v=>v.voiceURI===selectedVoice)||available.find(v=>v.lang.toLowerCase()==='pt-br');
 const en=available.find(v=>v.lang.toLowerCase()==='en-us')||available.find(v=>v.lang.toLowerCase().startsWith('en'));
 for(const part of parts){
  if(!part.text.trim())continue;
  const wantsEnglish=part.lang==='en-US';
  const chosen=wantsEnglish?en:pt;
  const synthesizedText=chosen?part.text:(part.hyronName?nameSpelling:(part.original||part.text));
  const u=new SpeechSynthesisUtterance(synthesizedText);
  u.lang=chosen?(wantsEnglish?'en-US':'pt-BR'):'pt-BR';
  u.rate=nativeRate;
  if(chosen)u.voice=chosen;
  if(onComplete && part===parts[parts.length-1]){
   u.onend=()=>onComplete();u.onerror=()=>onComplete();
  }
  speechSynthesis.speak(u);
 }
}
// HYRON_NARRATION_MARKDOWN_V0522
// A fala usa texto limpo, enquanto a resposta visual e o historico mantem Markdown.
function narrationPlainText(source){
 let s=String(source??'').replace(/\r\n?/g,'\n');
 // Nao ler URLs do destino de links nem a pontuacao da formatacao.
 s=s.replace(/!\[([^\]]*)\]\((?:[^()]|\([^()]*\))*\)/g,'Imagem: $1');
 s=s.replace(/\[([^\]]+)\]\((?:[^()]|\([^()]*\))*\)/g,'$1');
 s=s.replace(/^\s*```[^\n]*\n[\s\S]*?^\s*```\s*$/gm,' Trecho de codigo. ');
 s=s.replace(/`([^`\n]+)`/g,'$1');
 s=s.replace(/\*\*([^*\n]+)\*\*/g,'$1').replace(/__([^_\n]+)__/g,'$1');
 s=s.replace(/(^|[\s([{])\*([^*\n]+)\*(?=$|[\s,.;!?)\]}])/g,'$1$2');
 s=s.replace(/(^|[\s([{])_([^_\n]+)_(?=$|[\s,.;!?)\]}])/g,'$1$2');
 s=s.replace(/^\s{0,3}#{1,6}\s+/gm,'');
 s=s.replace(/^\s*>\s?/gm,'');
 s=s.replace(/^\s*[-*+]\s+/gm,'');
 s=s.replace(/^\s*\|?\s*:?[-]{3,}:?\s*\|.*$/gm,'');
 s=s.replace(/\\\((.*?)\\\)/gs,'$1').replace(/\$([^$\n]+)\$/g,'$1');
 s=s.replace(/\\times\b/g,' vezes ').replace(/\\cdot\b/g,' vezes ').replace(/\\div\b/g,' dividido por ');
 s=s.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g,'$1 sobre $2');
 s=s.replace(/\s*\|\s*/g,', ');
 s=s.replace(/\n{3,}/g,'\n\n');
 return s.trim();
}
// HYRON_REPLAY_EMOJI_V0523
// Limpa emojis apenas da fala; mantem emojis na tela e no banco de dados.
function narrationWithoutEmoji(text){
 return String(text??'')
  .replace(/\p{Regional_Indicator}{2}/gu,' ')
  .replace(/[0-9#*]\uFE0F?\u20E3/gu,' ')
  .replace(/(?:\p{Extended_Pictographic}\uFE0F?(?:\p{Emoji_Modifier})?)(?:\u200D\p{Extended_Pictographic}\uFE0F?(?:\p{Emoji_Modifier})?)*/gu,' ')
  .replace(/[\uFE0E\uFE0F\u200D\u20E3]/g,'')
  .replace(/[ \t]{2,}/g,' ').trim();
}
function narrationReady(text){return narrationWithoutEmoji(narrationPlainText(text));}
function say(text){narrateParts(splitForNarration(narrationReady(text)));}
let replayButton=null;
function clearReplayButton(){
 if(replayButton){replayButton.textContent='🔊 Ouvir';replayButton.setAttribute('aria-pressed','false');replayButton=null;}
}
function replayAnswer(text,button){
 if(!('speechSynthesis' in window))return;
 if(replayButton===button){speechSynthesis.cancel();clearReplayButton();return;}
 speechSynthesis.cancel();clearReplayButton();
 const normalized=narrationReady(text);
 if(!normalized)return;
 const parts=splitForNarration(normalized).filter(p=>p.text.trim());
 if(!parts.length)return;
 replayButton=button;button.textContent='■ Parar';button.setAttribute('aria-pressed','true');
 // Narracao normal da v0.5.22 (vozes e velocidade), com eventos de conclusao.
 narrateParts(parts,false,()=>{if(replayButton===button)clearReplayButton();});
}
function addReplayButton(article,text){
 const button=document.createElement('button');button.type='button';
 button.className='hyron-replay';button.textContent='🔊 Ouvir';
 button.style.cssText='margin:.45rem .35rem .15rem 0;padding:.35rem .65rem;font-size:.82rem;border-radius:.65rem;cursor:pointer;';
 button.setAttribute('aria-label','Ouvir apenas esta resposta');
 button.setAttribute('aria-pressed','false');
 button.addEventListener('click',()=>replayAnswer(text,button));
 article.append(button);
}


const api=async(path,method='GET',payload)=>{const r=await fetch(path,{method,credentials:'same-origin',headers:payload?{'content-type':'application/json'}:{},body:payload?JSON.stringify(payload):undefined});const d=await r.json();if(!r.ok)throw Error(d.error||'Erro na requisição');return d;};
const bubble=(t,k='ai',files=[])=>{const e=document.createElement('article');e.className='bubble '+k;if(k==='ai'&&t!=='Pensando...'){renderRichMessage(e,t);addReplyCopyButton(e,t);addReplayButton(e,t);}else if(k==='user')renderUserAttachmentMessage(e,t,files);else e.textContent=t;chat.append(e);chat.scrollTop=chat.scrollHeight;return e;};
function render(msg=[]){if('speechSynthesis' in window)speechSynthesis.cancel();clearReplayButton();releaseAttachmentCards(chat);chat.replaceChildren();if(!msg.length)bubble('HYRON online. Ideias, código e boas conversas.');for(const m of msg)bubble(m.content,m.role==='user'?'user':'ai');}
function showAuth(show=true){$('#auth').hidden=inviteLinkToken?true:!show;$('#app').hidden=show;if(inviteLinkToken&&show)$('#invite-signup').hidden=false;}
async function boot(){try{const d=await api('/api/auth/me');user=d.user;showAuth(false);setupRouterDiagnostics(user.role);$('#who').textContent=user.username+' · '+(user.role==='admin'?'Administrador':'Usuário');$('#admin').hidden=user.role!=='admin';loadVoicePrefs();if(webPicker)webPicker.value=localStorage.getItem('hyron_web_mode_v066_'+user.id)||'auto';await piperRefresh();await cloudRefresh();await load();await providers();}catch{showAuth(true);}}
async function load(){const d=await api('/api/conversations');conversations=d.conversations;if(!conversations.length){current=null;render();}else await open(conversations.find(c=>c.id===current?.id)||conversations[0]);refresh();}
function refresh(){select.replaceChildren(new Option('Selecione uma conversa',''));for(const c of conversations)select.add(new Option(c.title,c.id));select.value=current?.id||'';}
async function open(c){current=c;refresh();const d=await api('/api/history?id='+encodeURIComponent(c.id));render(d.messages);}
async function providers(){const d=await api('/api/status');provider.replaceChildren(new Option('Automático',''));for(const p of d.configuredProviders)provider.add(new Option(p,p));}
// Modo de pesquisa salvo somente no navegador deste usuário.
const webPicker=document.querySelector('#hyron-web-mode');
webPicker?.addEventListener('change',()=>{if(user)localStorage.setItem('hyron_web_mode_v066_'+user.id,webPicker.value);});
$('#auth-form').addEventListener('submit',async e=>{e.preventDefault();try{const username=$('#username').value,password=$('#password').value,inviteCode=$('#invite').value,setupKey=$('#setup').value;const mode=$('#auth-mode').value;await api(mode==='login'?'/api/auth/login':mode==='register'?'/api/auth/register':'/api/setup','POST',{username,password,inviteCode,setupKey});if(mode==='login')await boot();else{$('#auth-mode').value='login';toggleAuth();$('#auth-error').textContent='Conta criada! Entre com suas credenciais.';}}catch(err){$('#auth-error').textContent=err.message;}});
function toggleAuth(){const mode=$('#auth-mode').value;$('#invite-wrap').hidden=mode!=='register';$('#setup-wrap').hidden=mode!=='setup';$('#auth-submit').textContent=mode==='login'?'Entrar':mode==='register'?'Criar conta':'Criar administrador';}$('#auth-mode').addEventListener('change',toggleAuth);toggleAuth();
$('#logout').addEventListener('click',async()=>{await api('/api/auth/logout','POST',{});user=null;current=null;showAuth(true);});
$('#new').addEventListener('click',async()=>{try{const d=await api('/api/conversations','POST',{title:'Nova conversa'});await load();await open(conversations.find(c=>c.id===d.id));}catch(e){alert(e.message);}});
select.addEventListener('change',()=>{const c=conversations.find(x=>x.id===select.value);if(c)open(c);});
const historyActions=createHistoryActions({api,getConversations:()=>conversations,getCurrentId:()=>current?.id,clearCurrent:()=>{current=null;},reload:load,confirm:message=>window.confirm(message),prompt:(message,title)=>window.prompt(message,title)});
bindHistoryActions(document,historyActions,()=>current?.id,error=>alert(error.message));
$('#search').addEventListener('input',()=>{const q=$('#search').value.toLowerCase();for(const o of select.options)o.hidden=!!q&&!o.text.toLowerCase().includes(q);});
// HYRON v0.6.7a: repeticao de falhas, incluindo imagens da sessao atual.
// O botao nao envia outra mensagem do usuario; o backend evita duplicar
// no D1 a ultima pergunta que ficou sem resposta.
async function askHyron(payload,article,repeat=false){
 article.classList.remove('error');
 article.textContent=payload.webMode==='on'?'Pesquisando na Internet...':'Pensando...';
 try{
  const result=await api('/api/chat','POST',repeat?{...payload,retry:true}:payload);
  renderRichMessage(article,result.answer);
  const meta=document.createElement('small');meta.className='model-meta';
  meta.textContent=(result.router?result.router+' · ':'')+result.provider+' · '+result.model;
  if(result.historyRecall)meta.textContent+=' · Histórico: '+(result.historyRecall.enabled?result.historyRecall.scannedConversations+' conversa(s) percorrida(s); '+result.historyRecall.completeConversations+' completa(s) e '+result.historyRecall.partialConversations+' parcial(is) no contexto':'desativado');
  if(result.imageHistory?.downloaded)meta.textContent+=' · Imagem recuperada do Drive: '+result.imageHistory.fileName;
  article.append(meta);
  addReplyCopyButton(article,result.answer);
  addReplayButton(article,result.answer);
  if(speaking){clearReplayButton();say(result.answer);}
  return true;
 }catch(err){
  article.classList.add('error');
  article.textContent=err instanceof Error?err.message:'Falha ao obter resposta';
  const button=document.createElement('button');
  button.type='button';button.className='hyron-retry-button';
  button.textContent='↻ Tentar novamente';
  button.title='Repetir a pergunta sem criar outra mensagem';
  button.addEventListener('click',async()=>{
   if($('#send').disabled)return;
   $('#send').disabled=true;
   try{await askHyron(payload,article,true);}finally{$('#send').disabled=false;}
  });
  article.append(document.createElement('div'),button);
  return false;
 }
}
form.addEventListener('submit',async e=>{
 e.preventDefault();if($('#send').disabled)return;
 let content;
 try{await window.hyronAwaitCloudUploads?.();content=await window.hyronPrepareAttachments(input.value.trim());}
 catch(err){alert(err.message);return;}
 if(!content.trim())return;
 $('#send').disabled=true;
 try{
  if(!current){
   const c=await api('/api/conversations','POST',{title:window.hyronAttachmentTitle(input.value.trim(),content)});
   await load();current=conversations.find(x=>x.id===c.id);
  }
  const images=await window.hyronGetPendingImages();
  const fileCards=window.hyronSnapshotAttachments?.()||[];
  const payload={conversationId:current.id,content,preferredProvider:provider.value,webMode:document.querySelector('#hyron-web-mode')?.value||'auto',images,driveImageRefs:window.hyronGetDriveImageRefs?.()||[]};
  input.value='';window.hyronClearAttachments();
  // Retentativas pertencem à última mensagem com erro, evitando bifurcar o histórico.
  chat.querySelectorAll('.hyron-retry-button').forEach(button=>button.remove());
  bubble(content,'user',fileCards);
  const wait=bubble('Pensando...');
  const ok=await askHyron(payload,wait);
  if(ok&&current.title==='Nova conversa'){
   await api('/api/conversations','PATCH',{id:current.id,title:window.hyronAttachmentTitle('',content)});
   await load();
  }
 }catch(err){alert(err.message);}finally{$('#send').disabled=false;input.focus();}
});
input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();form.requestSubmit();}});
$('#speak').textContent='🔇 Voz desligada';
$('#speak').addEventListener('click',()=>{speaking=!speaking;$('#speak').textContent=speaking?'🔊 Voz ligada':'🔇 Voz desligada';if(!speaking&&'speechSynthesis'in window){speechSynthesis.cancel();clearReplayButton();}});
const Rec=window.SpeechRecognition||window.webkitSpeechRecognition;if(Rec){const rec=new Rec();rec.lang='pt-BR';rec.onresult=e=>{input.value=e.results[0][0].transcript;};$('#mic').addEventListener('click',()=>rec.start());}else $('#mic').disabled=true;
$('#memory').addEventListener('click',async()=>{try{const d=await api('/api/memories');const list=d.memories.map((m,i)=>`${i+1}. ${m.content}`).join('\n');const choice=prompt('Memórias (somente suas):\n'+(list||'(nenhuma)')+'\n\nDigite + para adicionar, ou o número para excluir:');if(choice==='+'){const content=prompt('O que HYRON deve lembrar?');if(content)await api('/api/memories','POST',{content});}else if(/^\d+$/.test(choice||'')&&d.memories[Number(choice)-1]){if(confirm('Excluir memória?'))await api('/api/memories','DELETE',{id:d.memories[Number(choice)-1].id});}}catch(e){alert(e.message);}});
async function adminPanel(){
 const d=await api('/api/admin/users');const box=$('#admin-users');box.replaceChildren();
 for(const u of d.users){
  const row=document.createElement('div');row.className='admin-user';
  const name=document.createElement('span');name.textContent=`${u.username} · ${u.role==='admin'?'Administrador':'Usuário'}${u.disabled?' · Bloqueado':''}`;row.append(name);
  if(!u.disabled){const btn=document.createElement('button');const promote=u.role==='user';btn.textContent=promote?'Promover a admin':'Rebaixar a usuário';
   btn.disabled=u.id===user.id&& !promote;
   btn.addEventListener('click',async()=>{
    if(!confirm(`Confirmar ${promote?'PROMOÇÃO':'REBAIXAMENTO'} de ${u.username}? ${promote?'Essa pessoa poderá gerenciar contas e convites.':''}`))return;
    try{await api('/api/admin/users','PATCH',{id:u.id,role:promote?'admin':'user'});await adminPanel();}catch(e){alert(e.message);}
   });row.append(btn);
  }box.append(row);
 }
}
$('#admin').addEventListener('click',async()=>{$('#admin-panel').hidden=false;try{await adminPanel();}catch(e){alert(e.message);}});
$('#admin-close').addEventListener('click',()=>{$('#admin-panel').hidden=true;});

// Convites por link: nome atribuído pelo administrador, só a senha é escolhida no cadastro.
const inviteLinkToken=new URLSearchParams(location.search).get('invite');
if(inviteLinkToken){
 const signup=$('#invite-signup');
 $('#auth').hidden=true;
 signup.hidden=false;
 api('/api/auth/invite-info?token='+encodeURIComponent(inviteLinkToken)).then(data=>{
  $('#invite-signup-user').value=data.username;
 }).catch(err=>{$('#invite-signup-error').textContent=err.message;$('#invite-signup-form button').disabled=true;});
 $('#invite-signup-form').addEventListener('submit',async e=>{
  e.preventDefault();const p=$('#invite-signup-pass').value;
  if(p!==$('#invite-signup-confirm').value){$('#invite-signup-error').textContent='As senhas não coincidem';return;}
  const button=$('#invite-signup-form button');button.disabled=true;
  try{await api('/api/auth/claim-invite','POST',{token:inviteLinkToken,password:p});history.replaceState(null,'','/');signup.hidden=true;await boot();}
  catch(err){$('#invite-signup-error').textContent=err.message;button.disabled=false;}
 });
}
$('#invite-link-new').addEventListener('click',async()=>{
 const username=$('#invite-username').value.trim();
 try{const inv=await api('/api/admin/invite-link','POST',{username});const field=$('#invite-code');field.value=inv.url;field.hidden=false;}
 catch(e){alert(e.message);}
});
$('#invite-new').addEventListener('click',async()=>{try{const inv=await api('/api/admin/invite','POST',{});const field=$('#invite-code');field.value=inv.code;field.hidden=false;}catch(e){alert(e.message);}});
$('#invite-copy').addEventListener('click',async()=>{const value=$('#invite-code').value;if(!value)return;try{await navigator.clipboard.writeText(value);alert('Convite copiado.');}catch{prompt('Copie o código:',value);}});
$('#voice').addEventListener('change',e=>{selectedVoice=e.target.value;localStorage.setItem(voicePrefKey(voiceKey),selectedVoice);});
$('#voice-rate').addEventListener('input',e=>{voiceRate=Math.max(.01,Math.min(3,Number(e.target.value)));localStorage.setItem(voicePrefKey(rateKey),String(voiceRate));updateRateUI();});
$('#reset-rate').addEventListener('click',()=>{voiceRate=1;localStorage.setItem(voicePrefKey(rateKey),'1');updateRateUI();});
$('#voice-rate').addEventListener('dblclick',()=>{$('#reset-rate').click();});
$('#english-names').addEventListener('change',e=>{englishNames=e.target.checked;localStorage.setItem(voicePrefKey(englishKey),String(englishNames));});
updateRateUI();
$('#voice-test').addEventListener('click',()=>say('Olá! Eu sou o HYRON. Ideias, código e boas conversas. E, de preferência, sem explodir o servidor.'));
$('#name-spelling').addEventListener('input',e=>{nameSpelling=e.target.value.slice(0,80);localStorage.setItem(voicePrefKey(nameKey),nameSpelling);});
$('#name-language').addEventListener('change',e=>{nameLanguage=e.target.value;localStorage.setItem(voicePrefKey(nameLangKey),nameLanguage);});
$('#test-name').addEventListener('click',()=>narrateParts([{text:nameSpelling||'Ai ron',lang:nameLanguage,hyronName:true}],true));

if('speechSynthesis'in window){speechSynthesis.addEventListener('voiceschanged',updateVoices);updateVoices();}else $('#voice-info').textContent='Seu navegador não oferece síntese de fala.';
$('#claim').addEventListener('click',async()=>{if(!confirm('Importar conversas antigas deste navegador para sua conta?'))return;const old=JSON.parse(localStorage.getItem('hyron_conversations_v03')||'[]');let count=0;for(const c of old){if(c.saved&&c.id&&c.token){try{await api('/api/legacy/claim','POST',{id:c.id,token:c.token});count++;}catch{}}}alert(`${count} conversa(s) importada(s).`);await load();});
boot();

// HYRON V-0.5.1: biblioteca local de arquivos Piper (sem upload ao servidor).
const PIPER_DB='hyron_piper_models_v051';
function piperDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(PIPER_DB,1);req.onupgradeneeded=()=>req.result.createObjectStore('models',{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function piperStore(mode,work){const db=await piperDb();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('models',mode),store=tx.objectStore('models');let result;try{result=work(store);}catch(e){reject(e);return;}tx.oncomplete=()=>resolve(result?.result);tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
function piperStatus(message){document.querySelector('#piper-status').textContent=message;}
async function piperList(){const db=await piperDb();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('models','readonly'),req=tx.objectStore('models').getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}finally{db.close();}}
async function piperRefresh(){const el=document.querySelector('#piper-library');el.replaceChildren();try{const models=(await piperList()).filter(m=>m.owner===user?.id);if(!models.length){const p=document.createElement('p');p.className='hint';p.textContent='Nenhum modelo importado neste dispositivo.';el.append(p);}for(const m of models){const row=document.createElement('div');row.className='voice-library-item';const label=document.createElement('span');label.textContent=`${m.name} · ${(m.size/1048576).toFixed(1)} MB · armazenado localmente`;const remove=document.createElement('button');remove.type='button';remove.textContent='Excluir';remove.addEventListener('click',async()=>{if(!confirm(`Excluir o modelo ${m.name} deste navegador?`))return;await piperStore('readwrite',store=>store.delete(m.id));await piperRefresh();});row.append(label,remove);el.append(row);}}catch(e){piperStatus('Não foi possível acessar o armazenamento local: '+e.message);}}
document.querySelector('#piper-import').addEventListener('click',async()=>{const model=document.querySelector('#piper-model').files[0],config=document.querySelector('#piper-config').files[0];if(!user){piperStatus('Entre na sua conta primeiro.');return;}if(!model||!config){piperStatus('Selecione os dois arquivos do modelo Piper.');return;}if(!model.name.toLowerCase().endsWith('.onnx')||!config.name.toLowerCase().endsWith('.json')){piperStatus('Formato inválido. Use .onnx e .onnx.json.');return;}if(model.size<1024||model.size>250*1048576||config.size>1024*1024){piperStatus('Modelo inválido ou muito grande (limite: 250 MB).');return;}if(config.name!==model.name+'.json'){piperStatus('Os nomes devem corresponder: voz.onnx e voz.onnx.json.');return;}let cfg;try{cfg=JSON.parse(await config.text());}catch{piperStatus('O arquivo JSON não é válido.');return;}if(!cfg||typeof cfg!=='object'||!cfg.audio||!Number.isFinite(Number(cfg.audio.sample_rate))||!cfg.phoneme_type){piperStatus('Configuração Piper incompleta: verifique audio.sample_rate e phoneme_type.');return;}const btn=document.querySelector('#piper-import');btn.disabled=true;piperStatus('Armazenando modelo localmente...');try{const id=user.id+':'+model.name;await piperStore('readwrite',store=>store.put({id,owner:user.id,name:model.name,size:model.size,model,config:cfg,created:Date.now()}));piperStatus('Modelo importado e armazenado! A síntese com Piper Web será habilitada em uma etapa posterior.');await piperRefresh();}catch(e){piperStatus('Falha ao salvar. Verifique o espaço disponível: '+e.message);}finally{btn.disabled=false;}});

// HYRON v0.5.13: D1 synchronizes metadata; package files are verified and stored locally.
const VOICE_DB='hyron_voice_packages_v0513';
let remoteCloudAvailable=false;
let previewUrls=[];
function voiceDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(VOICE_DB,1);req.onupgradeneeded=()=>req.result.createObjectStore('voices',{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function voiceStore(mode,work){const db=await voiceDb();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('voices',mode),store=tx.objectStore('voices');let result;try{result=work(store);}catch(e){reject(e);return;}tx.oncomplete=()=>resolve(result?.result);tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
async function voiceLocalList(){const db=await voiceDb();try{return await new Promise((resolve,reject)=>{const req=db.transaction('voices','readonly').objectStore('voices').getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}finally{db.close();}}
const cloudStatus=s=>$('#cloud-status').textContent=s;
async function sha256BrowserFile(file){
 const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
 return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}

async function cloudRefresh(){
 if(!user)return;
 const box=$('#cloud-list');box.replaceChildren();previewUrls.forEach(url=>URL.revokeObjectURL(url));previewUrls=[];
 try{
  const {voices}=await api('/api/voices');
  let remoteStatuses={};
  remoteCloudAvailable=false;
  try{
   const config=await api('/api/voices/cloud/config');
   remoteCloudAvailable=!!config.configured;
   if(remoteCloudAvailable)remoteStatuses=(await api('/api/voices/cloud/status')).status||{};
  }catch(e){cloudStatus('Status de armazenamento remoto indisponível: '+e.message);}
  let local=[];
  try{local=await voiceLocalList();}
  catch(e){cloudStatus('Armazenamento local indisponível: '+e.message);}
  const installedById=new Map(local.filter(item=>item.owner===user.id).map(item=>[item.voiceId,item]));
  if(!voices.length){const hint=document.createElement('p');hint.className='hint';hint.textContent='Nenhuma voz sincronizada ainda.';box.append(hint);}
  for(const v of voices){
   const row=document.createElement('div');row.className='voice-library-item';
   const details=document.createElement('span');
   const installed=installedById.get(v.id),isInstalled=!!installed&&installed.modelSha256===v.model_sha256&&installed.supportSha256===(v.support_sha256||null);
   const cloud=remoteStatuses[v.id];
   const remoteReady=!!cloud?.ready;
   details.textContent=`${v.name} · ${v.description||'Sem descrição'} · ${v.kind.toUpperCase()} · ${v.language} · ${v.architecture} · ${v.sample_rate} Hz · Compatibilidade: ${v.compatibility} · SHA-256: ${(v.model_sha256||'indisponível').slice(0,12)} · ${isInstalled?'Instalada neste navegador':'Não instalada'} · ${remoteReady?'Disponível na nuvem':cloud?.uploading?'Envio pendente':'Somente local'}`;
   row.append(details);
   if(v.selected){const selected=document.createElement('strong');selected.textContent='Selecionada';row.append(selected);}
   if(isInstalled&&installed.preview){const audio=document.createElement('audio');audio.controls=true;audio.setAttribute('aria-label',`Prévia de ${v.name}`);const url=URL.createObjectURL(installed.preview);previewUrls.push(url);audio.src=url;row.append(audio);}else{const previewButton=document.createElement('button');previewButton.type='button';previewButton.disabled=true;previewButton.textContent='Prévia indisponível';row.append(previewButton);}
   if(isInstalled&&remoteCloudAvailable&&!remoteReady){
    const send=document.createElement('button');send.type='button';send.textContent='Enviar à nuvem';send.hidden=true;
    send.addEventListener('click',async()=>{
     if(!confirm(`Enviar os arquivos da voz ${v.name} para o bucket privado? Use somente vozes que você tem autorização para armazenar.`))return;
     send.disabled=true;
     try{
      cloudStatus(`Iniciando envio da voz ${v.name}...`);
      const preview=installed.preview?{
       bytes:installed.preview.size,
       sha256:await sha256BrowserFile(installed.preview),
      }:undefined;
      const init=await api(`/api/voices/${v.id}/cloud/init`,'POST',{...(preview?{preview}:{})});
      const source={model:installed.model,support:installed.support,preview:installed.preview};
      for(const part of init.parts){
       const file=source[part.part];
       if(!file||file.size!==part.bytes||file.name!==part.name)throw Error(`Arquivo ${part.part} ausente ou diferente do cadastro.`);
       cloudStatus(`Enviando ${part.name} (${(file.size/1048576).toFixed(1)} MiB)...`);
       const ticket=await api(`/api/voices/${v.id}/cloud/upload/${part.part}`,'POST',{});
       let r;
       try{
        r=await fetch(ticket.url,{method:'PUT',headers:ticket.headers,body:file});
       }catch(directError){
        if(file.size>80*1048576)throw Error('Envio direto bloqueado (possível CORS). O fallback suporta até 80 MiB. '+directError.message);
        cloudStatus(`Envio direto indisponível; usando relay seguro para ${part.name}...`);
        const relay=await fetch(`/api/voices/${v.id}/cloud/file/${part.part}`,{
         method:'PUT',credentials:'same-origin',headers:{'content-type':part.part==='preview'?'audio/wav':'application/octet-stream'},body:file,
        });
        if(!relay.ok){let reason='HTTP '+relay.status;try{reason=(await relay.json()).error||reason;}catch{}throw Error('Relay: '+reason);}
        r=relay;
       }
       // HF honors If-None-Match on PUT: HTTP 412 may mean the file
       // has already been uploaded by an earlier attempt.
       if(!r.ok&&r.status!==412)throw Error(`Envio de ${part.name} falhou (HTTP ${r.status}).`);
      }
      await api(`/api/voices/${v.id}/cloud/complete`,'POST',{});
      cloudStatus(`✅ Voz ${v.name} enviada à nuvem. Os arquivos poderão ser baixados após autenticação.`);
      await cloudRefresh();
     }catch(e){cloudStatus(`Envio não concluído: ${e.message}. Se o navegador bloquear por CORS, será necessário validar a configuração do gateway HF.`);}
     finally{send.disabled=false;}
    });row.append(send);
   }
   const download=document.createElement('button');download.type='button';
   download.disabled=!remoteCloudAvailable||!remoteReady||isInstalled;
   download.textContent=isInstalled?'Instalada neste navegador':remoteReady?'Baixar da nuvem':'Download indisponível';
   download.title=!remoteCloudAvailable?'Configure o Hugging Face Storage Buckets no Worker.':!remoteReady?'Envie os arquivos a partir de outro dispositivo primeiro.':'';
   if(!download.disabled)download.addEventListener('click',async()=>{
    download.disabled=true;
    try{
     const parts=cloud.parts;
     const results={};
     for(const part of parts){
      cloudStatus(`Baixando ${part} de ${v.name}...`);
      const ticket=await api(`/api/voices/${v.id}/cloud/download/${part}`);
      // Prefer CDN download without Worker bandwidth; use authenticated
      // same-origin streaming when the browser cannot follow HF/CORS redirects.
      let response;
      try{
       response=await fetch(ticket.url,{credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
       if(!response.ok)throw Error(`HTTP ${response.status}`);
      }catch{
       cloudStatus(`Baixando ${part} via HYRON (fallback de rede)...`);
       response=await fetch(`/api/voices/${v.id}/cloud/file/${part}`,{credentials:'same-origin',cache:'no-store'});
      }
      if(!response.ok)throw Error(`Download ${part} falhou (HTTP ${response.status}).`);
      const blob=await response.blob();
      if(blob.size!==ticket.bytes)throw Error(`Tamanho inválido em ${part}.`);
      const hash=await sha256BrowserFile(blob);
      if(hash!==ticket.sha256.toLowerCase())throw Error(`SHA-256 divergente em ${part}; arquivo descartado.`);
      results[part]=new File([blob],ticket.name,{type:part==='preview'?'audio/wav':'application/octet-stream'});
     }
     if(!results.model)throw Error('Pacote remoto não contém o modelo obrigatório.');
     await voiceStore('readwrite',store=>store.put({
      id:`${user.id}:${v.id}`,owner:user.id,voiceId:v.id,model:results.model,
      support:results.support||null,preview:results.preview||null,
      modelSha256:v.model_sha256,supportSha256:v.support_sha256||null,createdAt:Date.now(),
     }));
     cloudStatus(`✅ ${v.name} baixada e instalada neste navegador. A execução de RVC/Piper segue dependente do motor compatível.`);
     await cloudRefresh();
    }catch(e){cloudStatus(`Download não concluído: ${e.message}`);}
    finally{download.disabled=false;}
   });row.append(download);
   if(!v.selected){const choose=document.createElement('button');choose.type='button';choose.textContent='Selecionar';choose.addEventListener('click',async()=>{try{await api('/api/voices/default','PUT',{voiceId:v.id});await cloudRefresh();cloudStatus('Seleção sincronizada. A síntese do chat continua usando a voz do dispositivo até a integração do engine local.');}catch(e){cloudStatus(e.message);}});row.append(choose);}
   const del=document.createElement('button');del.type='button';del.textContent='Remover';del.addEventListener('click',async()=>{if(!confirm(`Remover ${v.name} da biblioteca sincronizada?`))return;try{await api(`/api/voices/${v.id}`,'DELETE',{});if(installed)await voiceStore('readwrite',store=>store.delete(installed.id));await cloudRefresh();}catch(e){cloudStatus(e.message);}});row.append(del);box.append(row);
  }
 }catch(e){cloudStatus('Erro ao listar: '+e.message);}
}
$('#cloud-upload').addEventListener('click',async()=>{
 const manifestFile=$('#cloud-manifest').files[0],model=$('#cloud-model').files[0],support=$('#cloud-support').files[0],preview=$('#cloud-preview').files[0],btn=$('#cloud-upload');
 if(!user){cloudStatus('Entre na sua conta primeiro.');return;}
 btn.disabled=true;
 let voiceId=null;
 try{
  cloudStatus('Validando manifesto, arquivos e hashes SHA-256...');
  const pkg=await validateVoicePackage(manifestFile,model,support,preview);
  const response=await api('/api/voices','POST',pkg.registration);voiceId=response.id;
  await voiceStore('readwrite',store=>store.put({id:`${user.id}:${voiceId}`,owner:user.id,voiceId,model:pkg.model,support:pkg.support,preview:pkg.preview,modelSha256:pkg.registration.modelSha256,supportSha256:pkg.registration.supportSha256,createdAt:Date.now()}));
  for(const selector of ['#cloud-manifest','#cloud-model','#cloud-support','#cloud-preview'])$(selector).value='';
  cloudStatus('Pacote validado e instalado localmente. Se a nuvem estiver configurada, use Enviar à nuvem para sincronizar seus arquivos.');
  await cloudRefresh();
 }catch(e){
  if(voiceId){
   try{await api(`/api/voices/${voiceId}`,'DELETE',{});}
   catch(rollbackError){cloudStatus(`Importação local falhou (${e.message}); não foi possível reverter o registro sincronizado (${rollbackError.message}).`);return;}
  }
  cloudStatus('Importação recusada: '+e.message);
 }
 finally{btn.disabled=false;}
});
