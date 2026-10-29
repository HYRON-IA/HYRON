/* HYRON_083_DICTATION_FASE5_2: resumable speech recognition; no automatic submit. */
(()=>{
 'use strict';
 const mic=document.getElementById('mic'),input=document.getElementById('prompt'),form=document.getElementById('form');
 if(!mic||!input||!form)return;
 const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 const idleLabel=mic.textContent;
 let wanted=false,stopping=false,session=null,base='',committed='',interim='',startTimer=null;
 let emptyRestarts=0,failed=false,lastError='';
 const status=(message,visible=false)=>{
  let el=document.getElementById('hyron-dictation-status');
  if(!el){el=document.createElement('span');el.id='hyron-dictation-status';el.setAttribute('role','status');el.setAttribute('aria-live','polite');form.append(el)}
  el.style.cssText=visible?'display:block;color:var(--hy-muted,#a0bdb1);font-size:12px;padding:4px':'position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)';
  el.textContent=message;
 };
 const render=()=>{
  const spoken=[committed,interim].filter(Boolean).join(' ').trim();
  const separator=base.trim()&&spoken?' ':'';
  input.value=base+separator+spoken;
  input.dispatchEvent(new Event('input',{bubbles:true}));
 };
 const ui=()=>{
  mic.type='button';mic.disabled=false;
  mic.textContent=wanted?(stopping?'⏳ Encerrando...':'⏹ Parar'):idleLabel;
  mic.title=wanted?'Parar ditado':'Ditar mensagem';
  mic.setAttribute('aria-label',wanted?'Parar ditado':'Iniciar ditado');
  mic.setAttribute('aria-pressed',String(wanted));
  mic.classList.toggle('hyron-dictating',wanted);
 };
 const clearStart=()=>{if(startTimer!==null){clearTimeout(startTimer);startTimer=null}};
 const endDictation=()=>{wanted=false;stopping=false;clearStart();interim='';render();ui();if(committed){status('Ditado concluído. Revise o texto antes de enviar.');input.focus()}else if(!failed){status('Não foi possível reconhecer fala. Verifique o microfone.',true)}};
 function beginSession(){
  if(!wanted||stopping)return;
  const rec=new Recognition();session=rec;
  rec.lang='pt-BR';rec.interimResults=true;rec.continuous=true;rec.maxAlternatives=1;
  let ownCommitted='',gotSpeech=false;
  rec.onresult=(event)=>{
   if(rec!==session||!wanted)return;
   let stable='',draft='';
   for(let i=0;i<event.results.length;i++){
    const chunk=event.results[i][0]?.transcript?.trim();if(!chunk)continue;
    if(event.results[i].isFinal)stable+=(stable?' ':'')+chunk;
    else draft+=(draft?' ':'')+chunk;
   }
   gotSpeech=gotSpeech||Boolean(stable||draft);
   if(gotSpeech)emptyRestarts=0;
   if(stable!==ownCommitted){
    // Final segments belong to this recognition session. Only append the delta.
    if(stable.startsWith(ownCommitted)){
     const delta=stable.slice(ownCommitted.length).trim();if(delta)committed+=(committed?' ':'')+delta;
    }else if(stable){
     // Browser rewrote its transcript; use the most recent stable version of this session.
     const prior=committed.endsWith(ownCommitted)?committed.slice(0,committed.length-ownCommitted.length).trim():committed;
     committed=[prior,stable].filter(Boolean).join(' ');
    }
    ownCommitted=stable;
   }
   interim=draft;render();status('Reconhecendo fala...');
  };
  rec.onerror=e=>{
   if(rec!==session)return;
   lastError=String(e.error||'unknown');
   if(['not-allowed','service-not-allowed','audio-capture','network','language-not-supported'].includes(lastError)){
    failed=true;wanted=false;
    const label={'not-allowed':'Permissão do microfone negada.','service-not-allowed':'Serviço de fala bloqueado pelo navegador.','audio-capture':'Microfone não encontrado.','network':'O serviço de transcrição não está disponível no Brave/rede.','language-not-supported':'Português não suportado neste navegador.'}[lastError];
    status(label||'Reconhecimento indisponível.',true);
   }else if(lastError==='no-speech')status('Aguardando fala...');
   else if(lastError!=='aborted'){status('Reconhecimento interrompido: '+lastError,true)}
  };
  rec.onend=()=>{
   if(rec!==session)return;
   session=null;
   // Preserve partial transcription if the browser ends unexpectedly.
   if(!ownCommitted&&interim){committed+=(committed?' ':'')+interim;interim='';render()}
   else {interim='';render()}
   if(!wanted||stopping||failed){endDictation();return}
   // Brave may end the recognition session after silence. Resume deliberately.
   if(!gotSpeech)emptyRestarts++;
   if(emptyRestarts>=3){failed=true;status('O navegador encerrou o reconhecimento repetidamente. Teste no Chrome ou Edge.',true);endDictation();return}
   status('Retomando escuta...');
   clearStart();startTimer=setTimeout(()=>{startTimer=null;beginSession()},350);
  };
  try{rec.start();ui();status('Microfone ativo. Clique novamente para finalizar.')}catch(e){
   session=null;failed=true;status('Não foi possível iniciar o reconhecimento: '+(e?.message||String(e)),true);endDictation();
  }
 }
 const start=()=>{
  if(wanted){stopping=true;wanted=false;clearStart();ui();if(session){try{session.stop()}catch{endDictation()}}else endDictation();return}
  if(!Recognition){status('Este navegador não oferece reconhecimento de voz. Teste no Chrome ou Edge.',true);return}
  base=input.value;committed='';interim='';emptyRestarts=0;failed=false;lastError='';wanted=true;stopping=false;ui();beginSession();
 };
 mic.addEventListener('click',start);
 form.addEventListener('submit',()=>{if(wanted)start()});
 window.addEventListener('pagehide',()=>{wanted=false;clearStart();if(session)try{session.abort()}catch{}});
 ui();
})();
