// HYRON 0.8: preferências locais por conta; sem alterar componentes do chat.
const defaults = {level:4, frequency:2, teasing:true};
let userId = null;
let prefs = {...defaults};
const $ = id => document.getElementById(id);
function sanitize(obj) {
 return {level:Number.isInteger(obj?.level)&&obj.level>=0&&obj.level<=5?obj.level:defaults.level,
 frequency:Number.isInteger(obj?.frequency)&&obj.frequency>=0&&obj.frequency<=3?obj.frequency:defaults.frequency,
 teasing:typeof obj?.teasing==='boolean'?obj.teasing:defaults.teasing};
}
function draw() {
 $('humor-level').value=String(prefs.level);
 $('humor-level-label').textContent=`${prefs.level}/5 — ${['Monge','Ironia educada','Sarcasmo','Humor ácido','Hospício','Sem advogado presente'][prefs.level]}`;
 $('humor-frequency').value=String(prefs.frequency);
 $('humor-frequency-label').textContent=['Raramente','Ocasionalmente','Frequentemente','Quase sempre'][prefs.frequency];
 $('humor-teasing').checked=prefs.teasing;
 $('humor-frequency').disabled=prefs.level===0;
 $('humor-teasing').disabled=prefs.level===0;
}
function persist() {if(userId) localStorage.setItem(`hyron_humor_v08_${userId}`,JSON.stringify(prefs));draw();}
export function setHumorUser(id) {
 userId=id||null;
 try {prefs=sanitize(userId?JSON.parse(localStorage.getItem(`hyron_humor_v08_${userId}`)||'null'):null);}catch{prefs={...defaults};}
 draw();
}
export function getHumorSettings(){return {...prefs};}
export function initHumor() {
 $('humor-level').addEventListener('input', e=>{prefs.level=Number(e.target.value);persist();});
 $('humor-frequency').addEventListener('input', e=>{prefs.frequency=Number(e.target.value);persist();});
 $('humor-teasing').addEventListener('change',e=>{prefs.teasing=e.target.checked;persist();});
 setupPersonalityPanel();
 setupCompactComposer();
 draw();
}

// HYRON_082_PERSONALITY_DRAWER: remove humor do fluxo do chat sem recriar os controles.
function setupPersonalityPanel(){
 const panel=$('humor-settings'),sidebar=$('hyron-sidebar');
 if(!panel||!sidebar||$('hyron-personality-button'))return;
 const trigger=document.createElement('button');trigger.id='hyron-personality-button';trigger.type='button';trigger.textContent='🐍 Personalidade';
 trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-controls','hyron-personality-dialog');
 const dialog=document.createElement('dialog');dialog.id='hyron-personality-dialog';dialog.className='hyron-personality-dialog';
 dialog.setAttribute('aria-label','Configurações de personalidade');
 const header=document.createElement('div');header.className='hyron-personality-header';
 const heading=document.createElement('h2');heading.textContent='Personalidade';
 const close=document.createElement('button');close.type='button';close.textContent='✕';close.setAttribute('aria-label','Fechar configurações');
 header.append(heading,close);panel.before(document.createComment('Painel de humor movido para personalidade'));
 dialog.append(header,panel);document.body.append(dialog);
 sidebar.insertBefore(trigger,sidebar.querySelector('#hyron-voice-drawer'));
 trigger.addEventListener('click',()=>{if(!dialog.open)dialog.showModal();});
 close.addEventListener('click',()=>dialog.close());
 dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
}
// HYRON_082_COMPOSER: preserva os elementos originais e seus listeners.
function setupCompactComposer(){
 const form=$('form'),actions=form?.querySelector('.actions'),attach=$('hyron-attach-button');
 if(!actions||!attach||$('hyron-tools-toggle'))return;
 actions.classList.add('hyron-compact-actions');
 const wrapper=document.createElement('div');wrapper.className='hyron-tools-wrapper';
 const toggle=document.createElement('button');toggle.id='hyron-tools-toggle';toggle.type='button';toggle.textContent='+';
 toggle.setAttribute('aria-label','Abrir ferramentas');toggle.setAttribute('aria-expanded','false');
 toggle.setAttribute('aria-controls','hyron-tools-menu');
 const menu=document.createElement('div');menu.id='hyron-tools-menu';menu.className='hyron-tools-menu';menu.hidden=true;
 const attachItem=document.createElement('div');attachItem.className='hyron-tool-item';attachItem.append(attach);
 const webItem=document.createElement('div');webItem.className='hyron-tool-item';
 const web=form.querySelector('.hyron-web-label');if(web)webItem.append(web);
 const speechItem=document.createElement('div');speechItem.className='hyron-tool-item';
 const speech=$('speak');if(speech)speechItem.append(speech);
 const driveItem=document.createElement('div');driveItem.className='hyron-tool-item';
 const drive=document.createElement('button');drive.type='button';drive.textContent='📁 Google Drive';
 drive.addEventListener('click',()=>{$('hyron-drive-open')?.click();hide();});driveItem.append(drive);
 menu.append(attachItem,driveItem,webItem,speechItem);wrapper.append(toggle,menu);
 actions.prepend(wrapper);
 function hide(){menu.hidden=true;toggle.setAttribute('aria-expanded','false');}
 toggle.addEventListener('click',()=>{menu.hidden=!menu.hidden;toggle.setAttribute('aria-expanded',String(!menu.hidden));});
 document.addEventListener('pointerdown',e=>{if(!wrapper.contains(e.target))hide();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});
 attach.addEventListener('click',hide);
 const send=$('send');if(send){send.textContent='↑';send.setAttribute('aria-label','Enviar mensagem');send.title='Enviar mensagem';}
 const mic=$('mic');if(mic){mic.textContent='🎙';mic.title='Falar';mic.setAttribute('aria-label','Falar');}
}
