/* HYRON_083_DICTATION_FASE5: Web Speech API, pt-BR, never submits automatically. */
(()=>{
 'use strict';
 const mic=document.getElementById('mic');
 const input=document.getElementById('prompt');
 const form=document.getElementById('form');
 if(!mic||!input||!form)return;
 const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 const original=mic.textContent;
 mic.type='button';
 if(!Recognition){
  mic.disabled=false;mic.title='Ditado indisponível neste navegador';
  mic.addEventListener('click',()=>{window.alert('Este navegador não oferece reconhecimento de fala. Tente Chrome ou Edge e permita o microfone.');});
  return;
 }
 let recognition=null,active=false,stopping=false,originalText='',finalText='',partial='',hadResult=false;
 const notify=(message)=>{
  let box=document.getElementById('hyron-dictation-status');
  if(!box){box=document.createElement('span');box.id='hyron-dictation-status';box.setAttribute('role','status');box.setAttribute('aria-live','polite');box.style.cssText='position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)';form.append(box)}
  box.textContent=message;
 };
 const setValue=(chunk)=>{
  const separator=originalText.trim()&&chunk.trim()?' ':'';
  input.value=originalText+separator+chunk;
  input.dispatchEvent(new Event('input',{bubbles:true}));
 };
 const setUI=()=>{
  mic.textContent=active?(stopping?'⏳ Finalizando...':'⏹ Parar'):original;
  mic.setAttribute('aria-pressed',String(active));
  mic.setAttribute('aria-label',active?'Parar ditado':'Iniciar ditado');
  mic.title=active?'Parar e transcrever':'Ditar mensagem';
  mic.classList.toggle('hyron-dictating',active);
  mic.disabled=stopping;
 };
 function stop(){if(!active||stopping)return;stopping=true;setUI();try{recognition.stop()}catch{finish()}}
 function finish(){active=false;stopping=false;recognition=null;setValue(finalText.trim()||partial.trim());setUI();if(hadResult){notify('Ditado concluído. Revise o texto antes de enviar.');input.focus()}else notify('Nenhuma fala reconhecida.');}
 function start(){
  if(active)return stop();
  originalText=input.value;finalText='';partial='';hadResult=false;stopping=false;
  const rec=new Recognition();recognition=rec;rec.lang='pt-BR';rec.interimResults=true;rec.continuous=true;rec.maxAlternatives=1;
  rec.onresult=(event)=>{
   let stable='',interim='';
   for(let i=0;i<event.results.length;i++){
    const segment=event.results[i][0]?.transcript?.trim();if(!segment)continue;
    if(event.results[i].isFinal)stable+=(stable?' ':'')+segment;
    else interim+=(interim?' ':'')+segment;
   }
   finalText=stable;partial=interim;hadResult=!!(stable||interim);
   setValue([stable,interim].filter(Boolean).join(' '));
  };
  rec.onerror=(event)=>{
   const reason=event.error||'unknown';
   if(reason==='not-allowed'||reason==='service-not-allowed')notify('Permissão de microfone negada. Autorize o microfone nas configurações do navegador.');
   else if(reason==='no-speech')notify('Não foi detectada fala.');
   else if(reason==='network')notify('O serviço de reconhecimento de voz está indisponível neste navegador ou rede.');
   else if(reason!=='aborted')notify('O ditado não pôde ser concluído: '+reason);
  };
  rec.onend=()=>{if(rec===recognition)finish()};
  try{rec.start();active=true;setUI();notify('Gravando ditado. Clique novamente para finalizar.')}catch(e){active=false;recognition=null;setUI();notify('Não foi possível iniciar o ditado: '+(e.message||e))}
 }
 mic.addEventListener('click',start);
 form.addEventListener('submit',()=>{if(active)stop()});
 window.addEventListener('pagehide',()=>{if(active)try{recognition.abort()}catch{}});
 setUI();
})();
