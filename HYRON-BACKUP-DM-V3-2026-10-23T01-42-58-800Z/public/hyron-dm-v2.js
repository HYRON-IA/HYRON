/* HYRON v0.8.2 - Linha Direta V2. Enhancement layer; no DM APIs are changed. */
(() => {
  'use strict';
  const PANEL='hyronDmV2Panel';
  const PANEL_ATTR='data-hyron-dm-v2';
  const MSG_PLACEHOLDER=/mensagem privada/i;
  const millisToClock=(seconds)=>{
    if(!Number.isFinite(seconds)||seconds<0)return '--:--';
    const t=Math.floor(seconds);
    return String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0');
  };
  const textContent=(el)=>(el?.textContent||'').replace(/\s+/g,' ').trim();
  function branchOf(ancestor,descendant){
    let el=descendant;
    while(el?.parentElement&&el.parentElement!==ancestor)el=el.parentElement;
    return el?.parentElement===ancestor?el:null;
  }
  function commonAncestor(a,b){
    const seen=new Set();let node=a;
    while(node){seen.add(node);node=node.parentElement;}
    node=b;while(node&&!seen.has(node))node=node.parentElement;
    return node;
  }
  function findLabelWithin(panel,label){
    const candidates=[...panel.querySelectorAll('label,h1,h2,h3,h4,span,p,strong,div')]
      .filter(el=>el.childElementCount<3&&textContent(el)===label);
    return candidates[0]||null;
  }
  function findPanel(input){
    let current=input.parentElement;
    for(let i=0;current&&i<16;i++,current=current.parentElement){
      const txt=textContent(current);
      if(txt.includes('Linha Direta')&&txt.includes('Novo contato')&&
         (txt.includes('Conversas')||txt.includes('Conversa com'))&&
         current.querySelector('button'))return current;
    }
    return null;
  }
  function button(label){const b=document.createElement('button');b.type='button';b.textContent=label;return b;}
  function attachPanel(panel,input){
    if(panel.dataset.hyronDmV2==='panel')return;
    const label=findLabelWithin(panel,'Novo contato');
    const ancestor=label?commonAncestor(label,input):null;
    const left=ancestor&&label?branchOf(ancestor,label):null;
    const right=ancestor?branchOf(ancestor,input):null;
    if(!left||!right||left===right||!ancestor||ancestor===panel){
      // Do not change an unknown DOM structure or obstruct existing controls.
      return;
    }
    panel.dataset.hyronDmV2='panel';panel.id=panel.id||PANEL;
    ancestor.dataset.hyronDmV2='layout';
    left.dataset.hyronDmV2='contacts';right.dataset.hyronDmV2='conversation';
    const topChild=branchOf(panel,ancestor);
    const siblings=topChild?[...panel.children].filter(e=>e!==topChild):[];
    const header=siblings.find(e=>textContent(e).includes('Linha Direta'));
    if(header)header.dataset.hyronDmV2='header';
    // Distinguish inbox navigation from an open conversation on narrow screens.
    const back=button('← Conversas');back.className='hyron-dm-v2-back';
    back.setAttribute('aria-label','Voltar à lista de conversas');
    back.onclick=()=>{panel.classList.remove('hyron-dm-v2-chat-active');const focus=left.querySelector('input');focus?.focus({preventScroll:true});};
    right.insertBefore(back,right.firstChild);
    left.addEventListener('click',event=>{
      if(!window.matchMedia('(max-width: 767px)').matches)return;
      const elem=event.target instanceof Element?event.target:null;
      if(!elem||elem.closest('input,textarea,select'))return;
      const actionable=elem.closest('button,[role="button"],a,li');
      if(!actionable||/^(Buscar|Pesquisar|Novo contato|Fechar)$/i.test(textContent(actionable)))return;
      panel.classList.add('hyron-dm-v2-chat-active');
    });
    panel.classList.remove('hyron-dm-v2-chat-active');
    // Preserve existing closing and keyboard handlers supplied by the original DM.
    // Only UI layout and audio visuals are enhanced here.
    transformAudio(panel);
  }
  function makeAudioPlayer(audio){
    if(audio.dataset.hyronDmV2Player||audio.closest('.hyron-dm-v2-audio'))return;
    audio.dataset.hyronDmV2Player='1';audio.preload='metadata';audio.controls=false;
    const wrapper=document.createElement('div');wrapper.className='hyron-dm-v2-audio';
    wrapper.setAttribute('role','group');wrapper.setAttribute('aria-label','Mensagem de áudio');
    const control=button('▶');control.className='hyron-dm-v2-play';control.setAttribute('aria-label','Reproduzir áudio');
    const bar=document.createElement('input');bar.type='range';bar.className='hyron-dm-v2-progress';
    bar.min='0';bar.max='1000';bar.step='1';bar.value='0';bar.setAttribute('aria-label','Posição do áudio');
    const current=document.createElement('span');current.className='hyron-dm-v2-time';current.textContent='00:00';
    const duration=document.createElement('span');duration.className='hyron-dm-v2-time';duration.textContent='--:--';
    const separator=document.createElement('span');separator.className='hyron-dm-v2-separator';separator.textContent='/';
    const times=document.createElement('span');times.className='hyron-dm-v2-times';times.append(current,separator,duration);
    const body=document.createElement('div');body.className='hyron-dm-v2-controls';body.append(control,bar,times);
    audio.parentNode.insertBefore(wrapper,audio);wrapper.append(body,audio);
    function knownDuration(){
      if(Number.isFinite(audio.duration)&&audio.duration>0)return audio.duration;
      try{if(audio.seekable.length){const end=audio.seekable.end(audio.seekable.length-1);if(Number.isFinite(end)&&end>0)return end;}}catch{}
      return NaN;
    }
    const refresh=()=>{
      const total=knownDuration(),now=Number.isFinite(audio.currentTime)?audio.currentTime:0;
      const valid=Number.isFinite(total)&&total>0;
      current.textContent=millisToClock(now);duration.textContent=valid?millisToClock(total):'--:--';
      bar.disabled=!valid;bar.value=valid?String(Math.max(0,Math.min(1000,Math.round(now/total*1000)))):'0';
      bar.style.setProperty('--hyron-audio-progress',(valid?(now/total*100):0)+'%');
      control.textContent=audio.paused?'▶':'Ⅱ';
      control.setAttribute('aria-label',audio.paused?'Reproduzir áudio':'Pausar áudio');
    };
    control.addEventListener('click',async()=>{
      try{if(audio.paused)await audio.play();else audio.pause();}catch{control.setAttribute('title','Áudio indisponível');}
      refresh();
    });
    bar.addEventListener('input',()=>{const total=knownDuration();if(Number.isFinite(total))audio.currentTime=total*(Number(bar.value)/1000);refresh();});
    for(const event of ['loadedmetadata','durationchange','loadeddata','timeupdate','play','pause','ended','progress'])audio.addEventListener(event,refresh);
    audio.addEventListener('error',()=>{duration.textContent='--:--';control.title='Não foi possível carregar o áudio';});
    refresh();
    // A browser may fetch metadata now; the audio file itself is never re-encoded.
  }
  function transformAudio(panel){
    for(const a of panel.querySelectorAll('audio:not([data-hyron-dm-v2-player])'))makeAudioPlayer(a);
  }
  function detect(){
    const textareas=[...document.querySelectorAll('textarea')];
    for(const input of textareas){
      if(!MSG_PLACEHOLDER.test(input.placeholder||''))continue;
      const panel=findPanel(input);if(panel){attachPanel(panel,input);if(panel.dataset.hyronDmV2==='panel')transformAudio(panel);}
    }
  }
  let queued=false;
  const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;detect();});};
  const start=()=>{detect();new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
