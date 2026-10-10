const $=s=>document.querySelector(s),chat=$('#chat'),form=$('#form'),input=$('#prompt'),provider=$('#provider'),select=$('#conversation');
let user=null,conversations=[],current=null,speaking=true;
const voiceKey='hyron_voice_v05',rateKey='hyron_rate_v05';
let selectedVoice='',voiceRate=1;
function voicePrefKey(k){return `${k}_${user?.id||'guest'}`;}
function loadVoicePrefs(){selectedVoice=localStorage.getItem(voicePrefKey(voiceKey))||'';voiceRate=Number(localStorage.getItem(voicePrefKey(rateKey))||'1');$('#voice-rate').value=String(voiceRate);$('#rate-value').textContent=voiceRate.toFixed(1)+'×';updateVoices();}
function voices(){return 'speechSynthesis' in window?speechSynthesis.getVoices().filter(v=>v.lang.toLowerCase().startsWith('pt')):[];}
function updateVoices(){
 const picker=$('#voice');if(!picker)return;
 const available=voices();picker.replaceChildren(new Option('Padrão do dispositivo',''));
 for(const v of available)picker.add(new Option(`${v.name} (${v.lang})`,v.voiceURI));
 if(available.some(v=>v.voiceURI===selectedVoice))picker.value=selectedVoice;else picker.value='';
 $('#voice-info').textContent=available.length?`${available.length} voz(es) em português detectada(s). A qualidade neural depende do navegador e do sistema.`:'Nenhuma voz em português detectada. Tente o Microsoft Edge ou instale vozes no sistema.';
}
function say(text){if(!('speechSynthesis' in window))return; speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='pt-BR';u.rate=voiceRate;const v=voices().find(v=>v.voiceURI===selectedVoice);if(v)u.voice=v;speechSynthesis.speak(u);}

const api=async(path,method='GET',payload)=>{const r=await fetch(path,{method,credentials:'same-origin',headers:payload?{'content-type':'application/json'}:{},body:payload?JSON.stringify(payload):undefined});const d=await r.json();if(!r.ok)throw Error(d.error||'Erro na requisição');return d;};
const bubble=(t,k='ai')=>{const e=document.createElement('article');e.className='bubble '+k;e.textContent=t;chat.append(e);chat.scrollTop=chat.scrollHeight;return e;};
function render(msg=[]){chat.replaceChildren();if(!msg.length)bubble('HYRON online. Ideias, código e boas conversas.');for(const m of msg)bubble(m.content,m.role==='user'?'user':'ai');}
function showAuth(show=true){$('#auth').hidden=!show;$('#app').hidden=show;}
async function boot(){try{const d=await api('/api/auth/me');user=d.user;showAuth(false);$('#who').textContent=user.username+' · '+(user.role==='admin'?'Administrador':'Usuário');$('#admin').hidden=user.role!=='admin';loadVoicePrefs();await load();await providers();}catch{showAuth(true);}}
async function load(){const d=await api('/api/conversations');conversations=d.conversations;if(!conversations.length){current=null;render();}else await open(conversations.find(c=>c.id===current?.id)||conversations[0]);refresh();}
function refresh(){select.replaceChildren(new Option('Selecione uma conversa',''));for(const c of conversations)select.add(new Option(c.title,c.id));select.value=current?.id||'';}
async function open(c){current=c;refresh();const d=await api('/api/history?id='+encodeURIComponent(c.id));render(d.messages);}
async function providers(){const d=await api('/api/status');provider.replaceChildren(new Option('Automático',''));for(const p of d.configuredProviders)provider.add(new Option(p,p));}
$('#auth-form').addEventListener('submit',async e=>{e.preventDefault();try{const username=$('#username').value,password=$('#password').value,inviteCode=$('#invite').value,setupKey=$('#setup').value;const mode=$('#auth-mode').value;await api(mode==='login'?'/api/auth/login':mode==='register'?'/api/auth/register':'/api/setup','POST',{username,password,inviteCode,setupKey});if(mode==='login')await boot();else{$('#auth-mode').value='login';toggleAuth();$('#auth-error').textContent='Conta criada! Entre com suas credenciais.';}}catch(err){$('#auth-error').textContent=err.message;}});
function toggleAuth(){const mode=$('#auth-mode').value;$('#invite-wrap').hidden=mode!=='register';$('#setup-wrap').hidden=mode!=='setup';$('#auth-submit').textContent=mode==='login'?'Entrar':mode==='register'?'Criar conta':'Criar administrador';}$('#auth-mode').addEventListener('change',toggleAuth);toggleAuth();
$('#logout').addEventListener('click',async()=>{await api('/api/auth/logout','POST',{});user=null;current=null;showAuth(true);});
$('#new').addEventListener('click',async()=>{try{const d=await api('/api/conversations','POST',{title:'Nova conversa'});await load();await open(conversations.find(c=>c.id===d.id));}catch(e){alert(e.message);}});
select.addEventListener('change',()=>{const c=conversations.find(x=>x.id===select.value);if(c)open(c);});
$('#rename').addEventListener('click',async()=>{if(!current)return;const title=prompt('Novo título:',current.title);if(!title)return;try{await api('/api/conversations','PATCH',{id:current.id,title:title.slice(0,80)});await load();}catch(e){alert(e.message);}});
$('#clear').addEventListener('click',async()=>{if(!current||!confirm('Excluir esta conversa?'))return;try{await api('/api/history?id='+encodeURIComponent(current.id),'DELETE');current=null;await load();}catch(e){alert(e.message);}});
$('#search').addEventListener('input',()=>{const q=$('#search').value.toLowerCase();for(const o of select.options)o.hidden=!!q&&!o.text.toLowerCase().includes(q);});
form.addEventListener('submit',async e=>{e.preventDefault();const content=input.value.trim();if(!content)return;$('#send').disabled=true;try{if(!current){const c=await api('/api/conversations','POST',{title:content.slice(0,80)});await load();current=conversations.find(x=>x.id===c.id);}input.value='';bubble(content,'user');const wait=bubble('Pensando...');try{const d=await api('/api/chat','POST',{conversationId:current.id,content,preferredProvider:provider.value});wait.textContent=d.answer;const meta=document.createElement('small');meta.className='model-meta';meta.textContent=d.provider+' · '+d.model;wait.append(meta);if(speaking)say(d.answer);if(current.title==='Nova conversa'){await api('/api/conversations','PATCH',{id:current.id,title:content.slice(0,80)});await load();}}catch(err){wait.classList.add('error');wait.textContent=err.message;}}catch(err){alert(err.message);}finally{$('#send').disabled=false;input.focus();}});
input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();form.requestSubmit();}});
$('#speak').addEventListener('click',()=>{speaking=!speaking;$('#speak').textContent=speaking?'🔊 Voz ligada':'🔇 Voz desligada';if(!speaking&&'speechSynthesis'in window)speechSynthesis.cancel();});
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
$('#invite-new').addEventListener('click',async()=>{try{const inv=await api('/api/admin/invite','POST',{});const field=$('#invite-code');field.value=inv.code;field.hidden=false;}catch(e){alert(e.message);}});
$('#invite-copy').addEventListener('click',async()=>{const value=$('#invite-code').value;if(!value)return;try{await navigator.clipboard.writeText(value);alert('Convite copiado.');}catch{prompt('Copie o código:',value);}});
$('#voice').addEventListener('change',e=>{selectedVoice=e.target.value;localStorage.setItem(voicePrefKey(voiceKey),selectedVoice);});
$('#voice-rate').value=String(voiceRate);
$('#voice-rate').addEventListener('input',e=>{voiceRate=Number(e.target.value);localStorage.setItem(voicePrefKey(rateKey),String(voiceRate));$('#rate-value').textContent=voiceRate.toFixed(1)+'×';});
$('#rate-value').textContent=voiceRate.toFixed(1)+'×';
$('#voice-test').addEventListener('click',()=>say('Olá! Eu sou o HYRON. Ideias, código e boas conversas. E, de preferência, sem explodir o servidor.'));
if('speechSynthesis'in window){speechSynthesis.addEventListener('voiceschanged',updateVoices);updateVoices();}else $('#voice-info').textContent='Seu navegador não oferece síntese de fala.';
$('#claim').addEventListener('click',async()=>{if(!confirm('Importar conversas antigas deste navegador para sua conta?'))return;const old=JSON.parse(localStorage.getItem('hyron_conversations_v03')||'[]');let count=0;for(const c of old){if(c.saved&&c.id&&c.token){try{await api('/api/legacy/claim','POST',{id:c.id,token:c.token});count++;}catch{}}}alert(`${count} conversa(s) importada(s).`);await load();});
boot();
