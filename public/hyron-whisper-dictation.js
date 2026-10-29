/* HYRON 083 Fase 5.3: MediaRecorder + Cloudflare Whisper. Never autosubmit. */
(()=>{'use strict';
 const mic=document.getElementById('mic'),input=document.getElementById('prompt'),form=document.getElementById('form');
 if(!mic||!input||!form)return;
 const label=mic.textContent;let recorder=null,stream=null,chunks=[],timer=null,active=false,busy=false;
 function status(s){let e=document.getElementById('hyron-whisper-status');if(!e){e=document.createElement('div');e.id='hyron-whisper-status';e.setAttribute('role','status');e.style.cssText='font-size:12px;color:var(--hy-muted,#a0bdb1);padding:4px 0';form.append(e)}e.textContent=s}
 function ui(){mic.type='button';mic.disabled=busy;mic.textContent=busy?'⏳':active?'⏹':label;mic.title=busy?'Transcrevendo áudio...':active?'Parar e transcrever':'Gravar ditado';mic.setAttribute('aria-label',mic.title);mic.setAttribute('aria-pressed',String(active))}
 function cleanup(){if(timer){clearTimeout(timer);timer=null}if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}recorder=null;active=false;ui()}
 function stop(){if(!active||!recorder)return;active=false;if(timer){clearTimeout(timer);timer=null}try{if(recorder.state!=='inactive')recorder.stop();else cleanup()}catch(e){cleanup();status('Não foi possível encerrar a gravação.')}ui()}
 async function start(){if(busy)return;if(active){stop();return}
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){status('Gravação indisponível neste navegador.');return}
  try{stream=await navigator.mediaDevices.getUserMedia({audio:true});const types=['audio/webm;codecs=opus','audio/webm','audio/mp4'];const mime=types.find(x=>MediaRecorder.isTypeSupported(x));recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);chunks=[];
   recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
   recorder.onerror=()=>{cleanup();status('Erro durante a gravação. Tente novamente.')};
   recorder.onstop=async()=>{const blob=new Blob(chunks,{type:recorder?.mimeType||'audio/webm'});cleanup();if(!blob.size){status('Áudio vazio.');return}if(blob.size>3*1024*1024){status('Gravação muito grande. Limite: 3 MB.');return}
     busy=true;ui();status('Transcrevendo com Whisper...');try{const r=await fetch('/api/voice/transcribe',{method:'POST',headers:{'Content-Type':blob.type.split(';')[0]||'audio/webm'},body:blob,credentials:'same-origin'});const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error||('Erro HTTP '+r.status));const text=String(data.text||'').trim();if(!text){status('Não foi possível reconhecer fala no áudio.');return}input.value+=(input.value.trim()?' ':'')+text;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();status('Transcrição concluída. Revise e envie quando quiser.')}catch(e){status('Falha na transcrição: '+(e?.message||e))}finally{busy=false;ui()}
   };
   recorder.start(1000);active=true;ui();status('Gravando... clique no microfone para parar.');timer=setTimeout(()=>{if(active){status('Limite de 45 segundos atingido. Transcrevendo...');stop()}},45000);
  }catch(e){cleanup();status(e?.name==='NotAllowedError'?'Autorize o uso do microfone no navegador.':'Não foi possível iniciar o microfone.')}
 }
 mic.addEventListener('click',e=>{e.preventDefault();start()});
 form.addEventListener('submit',()=>{if(active)stop()});
 window.addEventListener('pagehide',()=>{if(active&&recorder){recorder.onstop=null;try{recorder.stop()}catch{}}cleanup()});
 ui();
})();
