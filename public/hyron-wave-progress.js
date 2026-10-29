/* HYRON 0.8.3 - Waveform with real playback progress (DM + groups). */
(()=>{
 'use strict';
 if(window.__hyronWaveProgress083)return;
 window.__hyronWaveProgress083=true;
 const selector='input.hyron-dm-v2-progress, input.hyron-groups-audio-seek';
 const count=37;
 function duration(a){
  if(Number.isFinite(a.duration)&&a.duration>0)return a.duration;
  try{if(a.seekable.length){const end=a.seekable.end(a.seekable.length-1);if(Number.isFinite(end)&&end>0)return end}}catch{}
  return NaN;
 }
 function mount(range){
  if(range.dataset.hyronWaveMounted)return;
  const player=range.closest('.hyron-dm-v2-audio, .hyron-groups-audio-player');
  if(!player)return;
  const audio=player.querySelector('audio');if(!audio)return;
  range.dataset.hyronWaveMounted='1';
  const wave=document.createElement('div');wave.className='hyron-083-wave';
  wave.setAttribute('role','slider');wave.tabIndex=0;
  wave.setAttribute('aria-label','Posição do áudio');wave.setAttribute('aria-valuemin','0');wave.setAttribute('aria-valuemax','100');
  const bars=[];
  for(let i=0;i<count;i++){
    const bar=document.createElement('span');bar.className='hyron-083-wave-bar';
    const height=7+Math.round(23*Math.abs(Math.sin((i+2)*1.83)*Math.cos((i+5)*.39)));
    bar.style.height=height+'px';wave.append(bar);bars.push(bar);
  }
  range.classList.add('hyron-083-original-seek');range.insertAdjacentElement('afterend',wave);
  function render(){
   if(!wave.isConnected)return;
   const total=duration(audio);const valid=Number.isFinite(total)&&total>0;
   const now=Number.isFinite(audio.currentTime)?Math.max(0,audio.currentTime):0;
   const fraction=valid?Math.max(0,Math.min(1,now/total)):0;
   wave.classList.toggle('hyron-083-wave-disabled',!valid);
   wave.setAttribute('aria-disabled',String(!valid));
   wave.setAttribute('aria-valuenow',String(Math.round(fraction*100)));
   wave.setAttribute('aria-valuetext',valid?`${Math.floor(now)} de ${Math.floor(total)} segundos`:'Duração indisponível');
   for(let i=0;i<bars.length;i++)bars[i].classList.toggle('hyron-083-wave-done',(i+.5)/count<=fraction);
  }
  function seekTo(fraction){
   const total=duration(audio);if(!Number.isFinite(total)||total<=0)return;
   const value=Math.max(0,Math.min(1,fraction));
   try{audio.currentTime=value*total;range.value=String(Math.round(value*1000));range.dispatchEvent(new Event('input',{bubbles:true}));}catch{}
   render();
  }
  let dragging=false;
  function fractionAt(event){const bounds=wave.getBoundingClientRect();return bounds.width?(event.clientX-bounds.left)/bounds.width:0}
  wave.addEventListener('pointerdown',e=>{
   if(!Number.isFinite(duration(audio)))return;
   dragging=true;try{wave.setPointerCapture(e.pointerId)}catch{}
   seekTo(fractionAt(e));e.preventDefault();
  });
  wave.addEventListener('pointermove',e=>{if(dragging){seekTo(fractionAt(e));e.preventDefault()}});
  for(const ev of ['pointerup','pointercancel','lostpointercapture'])wave.addEventListener(ev,()=>{dragging=false});
  wave.addEventListener('keydown',e=>{
   const total=duration(audio);if(!Number.isFinite(total))return;
   let next=null;const fraction=audio.currentTime/total;
   if(e.key==='ArrowRight'||e.key==='ArrowUp')next=fraction+5/total;
   if(e.key==='ArrowLeft'||e.key==='ArrowDown')next=fraction-5/total;
   if(e.key==='Home')next=0;
   if(e.key==='End')next=1;
   if(next!==null){seekTo(next);e.preventDefault()}
  });
  for(const ev of ['loadedmetadata','durationchange','timeupdate','seeked','play','pause','ended','progress'])audio.addEventListener(ev,render);
  render();
 }
 function scan(){document.querySelectorAll(selector).forEach(mount)}
 const observer=new MutationObserver(()=>scan());
 const start=()=>{scan();observer.observe(document.body,{subtree:true,childList:true})};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
