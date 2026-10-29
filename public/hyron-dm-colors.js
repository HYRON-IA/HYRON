(()=>{
'use strict';
const TAG='hyron-dm-colors-082';if(window[TAG])return;window[TAG]=true;
const root=document.documentElement;
const DEFAULT={sent:'#246B55',received:'#272727',sentText:'#FFFFFF',receivedText:'#FFFFFF'};
const valid=s=>typeof s==='string'&&/^#[0-9A-Fa-f]{6}$/.test(s);
const safe=o=>Object.fromEntries(Object.entries(DEFAULT).map(([k,v])=>[k,valid(o?.[k])?o[k]:v]));
let account=null,colors={...DEFAULT},draft={...DEFAULT};
const key=()=>`hyron-dm-bubbles-v082:${account}`;
const setColors=()=>{for(const [k,v] of Object.entries(colors))root.style.setProperty('--hy-dm-'+k.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),v);};
const dialog=document.querySelector('#hyron-appearance');
if(!dialog){console.warn('HYRON DM Colors: painel Aparência não encontrado');return;}
const colorsEl=dialog.querySelector('.appearance-colors');if(!colorsEl)return;
const section=document.createElement('fieldset');section.id='hyron-dm-colors-fieldset';
section.innerHTML='<legend>Cores das mensagens</legend><div class="hy-dm-color-grid"></div><p class="appearance-help">Balões da Linha Direta. Preferências deste navegador, separadas por conta.</p><button type="button" class="appearance-secondary" id="hy-dm-colors-reset">Restaurar cores das mensagens</button>';
const slots=[['sent','Balão enviado'],['received','Balão recebido'],['sentText','Texto enviado'],['receivedText','Texto recebido']];
const grid=section.querySelector('.hy-dm-color-grid');
for(const [name,label] of slots){const l=document.createElement('label');l.textContent=label;const color=document.createElement('input');color.type='color';color.name='hy-dm-'+name;color.setAttribute('aria-label',label);l.append(color);grid.append(l);color.addEventListener('input',()=>{draft[name]=color.value;preview(draft);});}
colorsEl.closest('fieldset')?.after(section);
function preview(c){for(const [k,v] of Object.entries(c))root.style.setProperty('--hy-dm-'+k.replace(/[A-Z]/g,ch=>'-'+ch.toLowerCase()),v);}
function sync(){for(const [k,v] of Object.entries(draft))section.querySelector(`[name="hy-dm-${k}"]`).value=v;}
section.querySelector('#hy-dm-colors-reset').onclick=()=>{draft={...DEFAULT};sync();preview(draft);};
function load(){if(!account)return;try{colors=safe(JSON.parse(localStorage.getItem(key())||'null'));}catch{colors={...DEFAULT};}draft={...colors};setColors();sync();}
async function updateAccount(){try{const r=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'});if(!r.ok){account=null;return;}const data=await r.json();const id=data.user?.id;if(typeof id==='string'&&id!==account){account=id;load();}}catch{}}
updateAccount();
const observer=new MutationObserver(()=>{if(dialog.open){draft={...colors};sync();preview(draft);}});
observer.observe(dialog,{attributes:true,attributeFilter:['open']});
dialog.addEventListener('click',event=>{const action=event.target.closest('[data-action]')?.dataset.action;
 if(action==='save'&&account){const values=safe(draft);try{localStorage.setItem(key(),JSON.stringify(values));colors=values;}catch{console.warn('HYRON DM Colors: falha no armazenamento');}setColors();}
 if(action==='reset'){draft={...DEFAULT};sync();preview(draft);}
 if(action==='cancel'){draft={...colors};setColors();}
},true);
dialog.addEventListener('close',()=>{setTimeout(()=>{if(!dialog.open)setColors();},0);});
// Bubble detection anchored to audio player; leaves non-audio messages alone.
function refreshAudio(){document.querySelectorAll('[data-hyron-dm-v2="panel"] .hyron-dm-v2-audio').forEach(player=>{
  let ancestor=player.parentElement;
  for(let i=0;ancestor&&i<5;i++,ancestor=ancestor.parentElement){
   if(ancestor.matches?.('[data-hyron-dm-v2="panel"]'))break;
   // Original media attachment group contains a player; the outer bubble should be
   // stripped only if it has no extra text message. Avoid mutating file attachment cards.
   if(ancestor.querySelectorAll('.hyron-dm-v2-audio').length!==1)continue;
   const directText=[...ancestor.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent.trim()).join('');
   if(directText)continue;
   if(ancestor.className&&/(bubble|message|msg)/i.test(String(ancestor.className))){
     const visible=ancestor.innerText.replace(/(?:Mensagem de voz|Duração:\s*\d+:\d+|\d+:\d+\s*\/\s*\d+:\d+|audio-[\w.-]+|Baixar|\d{2}\/\d{2}\/\d{4}[^\n]*|1×|1,25×|1,5×|2×)/gi,'').trim();
     if(!visible)ancestor.classList.add('hy-dm-audio-only');else ancestor.classList.remove('hy-dm-audio-only');
     break;
   }
  }
 });}
let scheduled=false;const watch=new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;refreshAudio();});});
const panel=document.querySelector('[data-hyron-dm-v2="panel"]');if(panel)watch.observe(panel,{childList:true,subtree:true});
refreshAudio();
})();