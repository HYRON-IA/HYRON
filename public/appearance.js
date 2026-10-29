import {DEFAULT_PREFS,PRESETS,normalizePrefs,themeTokens,preferenceKey} from './theme-model.js';
import {COBRA_SVG,createCobraMark} from './cobra-mark.js';

function imageStore(action,key,value){
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open('hyron-appearance-v07',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('accounts');
  request.onerror=()=>reject(Error('Não foi possível abrir as preferências neste navegador.'));
  request.onblocked=()=>reject(Error('Feche outras abas do HYRON para salvar as preferências.'));
  request.onsuccess=()=>{
   const db=request.result;db.onversionchange=()=>db.close();
   const tx=db.transaction('accounts',action==='get'?'readonly':'readwrite'),store=tx.objectStore('accounts');
   const op=action==='get'?store.get(key):store.put(value,key);
   tx.oncomplete=()=>{const result=op.result;db.close();resolve(result);};
   tx.onerror=tx.onabort=()=>{db.close();reject(Error('Não foi possível salvar as preferências. Verifique o espaço do navegador.'));};
  };
 });
}
async function prepareImage(file){
 if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Escolha uma imagem PNG, JPEG ou WebP.');
 if(file.size>8*1024*1024)throw Error('A imagem deve ter no máximo 8 MiB.');
 let image;
 try{image=await createImageBitmap(file);}catch{throw Error('Não foi possível ler essa imagem.');}
 try{
  if(!image.width||!image.height||image.width*image.height>40000000)throw Error('Escolha uma imagem de até 40 megapixels.');
  const scale=Math.min(1,1920/Math.max(image.width,image.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
  canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.85));
  if(!blob||blob.size>3*1024*1024)throw Error('Essa imagem é grande demais após a conversão. Escolha uma menor.');
  return blob;
 }finally{image.close();}
}
export function createAppearanceController(){
 const root=document.documentElement;
 let userId=null,generation=0,saved=normalizePrefs(DEFAULT_PREFS),savedImage=null,savedRevision=0,draft=null,draftImage=null,objectUrl=null,trigger=null,busy=false;
 // HYRON_COBRA_INDEPENDENT_V081: prefs de logo isoladas para preservar schema do tema.
 const ORIGINAL_LOGO={eyes:'#f2cf12',belly:'#f4f4f4',background:'#101114'};
 let savedLogo={...ORIGINAL_LOGO},draftLogo=null;
 const validHex=s=>typeof s==='string'&&/^#[0-9a-fA-F]{6}$/.test(s);
 const logoKey=id=>'hyron-logo-colors-v081:'+id;
 function readLogo(id){try{const item=JSON.parse(localStorage.getItem(logoKey(id))||'null');const legacy=localStorage.getItem('hyron_v7_logo_background_'+encodeURIComponent(id));const colors=Object.fromEntries(Object.entries(ORIGINAL_LOGO).map(([k,v])=>[k,validHex(item?.[k])?item[k]:v]));if(validHex(legacy)&&(!validHex(item?.background)||item.background===ORIGINAL_LOGO.background))colors.background=legacy;return colors;}catch{return {...ORIGINAL_LOGO};}}
 function writeLogo(id,p){localStorage.setItem(logoKey(id),JSON.stringify(p));localStorage.removeItem('hyron_v7_logo_background_'+encodeURIComponent(id));}
 function rawLogo(prefs,colors){return COBRA_SVG.replaceAll('var(--hy-cobra-body, currentColor)',prefs.icon).replaceAll('var(--hy-cobra-belly, #f4f4f4)',colors.belly).replaceAll('var(--hy-cobra-eyes, #f2cf12)',colors.eyes);}
 function updateFavicon(prefs,colors){
  const x=rawLogo(prefs,colors);
  const content=x.replace('<svg ','<svg ');const box='<rect width="1254" height="1254" fill="'+colors.background+'"/>';
  const favicon=content.replace(/(<svg[^>]*>)/,'$1'+box);
  let link=document.querySelector('link[data-hyron-cobra-favicon]');if(!link){link=document.createElement('link');link.rel='icon';link.type='image/svg+xml';link.dataset.hyronCobraFavicon='1';document.head.append(link);}
  link.href='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(favicon);
 }

 for(const [index,mark] of [...document.querySelectorAll('.logo,.sidebar-mark')].entries()){mark.innerHTML=createCobraMark('brand-'+index);mark.setAttribute('aria-label','HYRON — cobra-rei');}
 const dialog=document.createElement('dialog');dialog.id='hyron-appearance';dialog.className='appearance-dialog';dialog.setAttribute('aria-labelledby','appearance-title');
 dialog.innerHTML=`<div class="appearance-heading"><div><p class="appearance-kicker">SEU HYRON</p><h2 id="appearance-title">Aparência</h2></div><button type="button" data-action="cancel" class="appearance-close" aria-label="Fechar aparência">×</button></div>
 <div class="appearance-brand-preview"><span class="appearance-mark">${createCobraMark('preview')}</span><div><strong>HYRON</strong><span>Cobra-rei · identidade vetorial</span></div></div>
 <fieldset class="appearance-presets"><legend>Tema</legend><div class="appearance-theme-grid">${Object.entries(PRESETS).map(([key,t])=>`<label class="appearance-theme-card" data-preset="${key}"><input type="radio" name="hyron-theme" value="${key}"><span class="theme-swatch swatch-${key}" aria-hidden="true"><i></i><i></i></span><span>${t.label}</span></label>`).join('')}</div></fieldset>
 <fieldset><legend>Cores da sua identidade</legend><div class="appearance-colors"><label>Cor principal<input type="color" name="accent" aria-label="Cor principal do tema"></label><label>Cor dos painéis<input type="color" name="surface" aria-label="Cor dos painéis"></label><label>Cor da logo<input type="color" name="icon" aria-label="Cor da logo cobra-rei"></label><label>Cor dos olhos<input type="color" name="hyronEyes" aria-label="Cor dos olhos da cobra"></label><label>Cor das listras<input type="color" name="hyronBelly" aria-label="Cor das listras da barriga"></label><label>Fundo da logo<input type="color" name="hyronLogoBg" aria-label="Cor do fundo da logo"></label></div><p class="appearance-help">A logo é um SVG: a cor muda nos traços, mantendo a nitidez em qualquer tamanho.</p><button type="button" data-action="download" class="appearance-secondary">Baixar minha logo em SVG</button></fieldset>
 <fieldset><legend>Fundo</legend><label class="appearance-field">Estilo<select name="background"><option value="theme">Padrão do tema</option><option value="solid">Cor sólida</option><option value="gradient">Gradiente</option><option value="image">Minha imagem</option></select></label><div class="appearance-colors" data-bg="colors"><label>Cor de fundo<input type="color" name="color" aria-label="Cor do fundo"></label><label data-bg="gradient">Segunda cor<input type="color" name="color2" aria-label="Segunda cor do gradiente"></label></div><label class="appearance-field" data-bg="angle">Direção do gradiente<input type="range" name="angle" min="0" max="360" step="1" aria-label="Ângulo do gradiente"></label><div data-bg="image"><label class="appearance-file">Escolher imagem<input type="file" name="image" accept="image/png,image/jpeg,image/webp"></label><p class="appearance-help" data-image-status>Nenhuma imagem escolhida.</p><button type="button" data-action="remove-image" class="appearance-secondary">Remover imagem</button><p class="appearance-help">PNG, JPEG ou WebP, até 8 MiB. O fundo fica somente neste navegador e não é enviado ao Drive nem à IA.</p></div></fieldset>
 <p class="appearance-local">Preferências separadas por conta, salvas neste navegador. Não sincronizam entre dispositivos.</p><p id="appearance-status" role="status" aria-live="polite"></p><div class="appearance-footer"><button type="button" data-action="reset" class="appearance-secondary">Restaurar padrão</button><button type="button" data-action="save" class="appearance-save">Salvar alterações</button></div>`;
 document.body.append(dialog);
 const button=document.createElement('button');button.type='button';button.id='hyron-appearance-open';button.textContent='Aparência';button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls',dialog.id);
 const sidebar=document.querySelector('#hyron-sidebar');if(sidebar)sidebar.insertBefore(button,document.querySelector('#hyron-voice-drawer'));else document.querySelector('#app header')?.append(button);
 const status=dialog.querySelector('#appearance-status');
 function report(message){status.textContent=message;}
 function paint(prefs,image){
  for(const [name,value] of Object.entries(themeTokens(prefs)))root.style.setProperty(name,value);
  root.dataset.hyronTheme=prefs.theme;root.style.colorScheme=prefs.theme==='light'?'light':'dark';
  if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null;}
  root.style.setProperty('--hy-wallpaper','none');root.style.setProperty('--hy-wall-color',PRESETS[prefs.theme].canvas);
  if(prefs.background==='solid')root.style.setProperty('--hy-wall-color',prefs.color);
  if(prefs.background==='gradient')root.style.setProperty('--hy-wallpaper',`linear-gradient(${prefs.angle}deg,${prefs.color},${prefs.color2})`);
  if(prefs.background==='image'&&image instanceof Blob){objectUrl=URL.createObjectURL(image);root.style.setProperty('--hy-wallpaper',`url("${objectUrl}")`);}
   const logo=draftLogo||savedLogo;
   root.style.setProperty('--hy-cobra-body',prefs.icon);
   root.style.setProperty('--hy-cobra-eyes',logo.eyes);
   root.style.setProperty('--hy-cobra-belly',logo.belly);
   root.style.setProperty('--hy-icon-bg',logo.background);
   updateFavicon(prefs,logo);

 }
 function sync(){
  for(const name of ['accent','icon','surface','background','color','color2','angle'])dialog.querySelector(`[name="${name}"]`).value=draft[name];
   dialog.querySelector('[name="hyronEyes"]').value=draftLogo.eyes;
   dialog.querySelector('[name="hyronBelly"]').value=draftLogo.belly;
   dialog.querySelector('[name="hyronLogoBg"]').value=draftLogo.background;

  dialog.querySelector(`[name="hyron-theme"][value="${draft.theme}"]`).checked=true;
  for(const card of dialog.querySelectorAll('[data-preset]'))card.classList.toggle('selected',card.dataset.preset===draft.theme);
  dialog.querySelector('[data-bg="colors"]').hidden=!['solid','gradient'].includes(draft.background);
  dialog.querySelector('[data-bg="gradient"]').hidden=draft.background!=='gradient';dialog.querySelector('[data-bg="angle"]').hidden=draft.background!=='gradient';dialog.querySelector('[data-bg="image"]').hidden=draft.background!=='image';
  dialog.querySelector('[data-image-status]').textContent=draftImage?'Imagem pronta para o fundo.':'Nenhuma imagem escolhida.';
  paint(draft,draftImage);
 }
 function close(){if(dialog.open)dialog.close();draft=null;draftImage=null;draftLogo=null;paint(saved,savedImage);trigger?.focus();}
 button.addEventListener('click',()=>{if(!userId)return;trigger=button;draft={...saved};draftImage=savedImage;draftLogo={...savedLogo};report('');sync();dialog.showModal();dialog.querySelector('[data-action="cancel"]').focus();});
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 dialog.addEventListener('close',()=>{if(draft){draft=null;draftImage=null;draftLogo=null;paint(saved,savedImage);}});
 dialog.addEventListener('click',async event=>{
  const action=event.target.closest('[data-action]')?.dataset.action;if(!action||busy)return;
  if(action==='cancel'){close();return;}
  if(action==='reset'){draft=normalizePrefs(DEFAULT_PREFS);draftLogo={...ORIGINAL_LOGO};draftImage=null;dialog.querySelector('[name="image"]').value='';report('Padrão restaurado na prévia. Salve para confirmar.');sync();return;}
  if(action==='remove-image'){draftImage=null;draft.background='theme';report('Imagem removida da prévia. Salve para confirmar.');sync();return;}
  if(action==='download'){
   const svg=rawLogo(draft,draftLogo).replace('aria-hidden="true"','role="img" aria-label="HYRON cobra"');
   const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'})),link=document.createElement('a');link.href=url;link.download='hyron-cobra-v081.svg';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;
  }
  if(action==='save'){
   if(draft.background==='image'&&!draftImage){report('Escolha uma imagem para usar esse fundo.');return;}
   const account=userId,version=generation,prefs=normalizePrefs(draft),image=draftImage,revision=Date.now();
   busy=true;dialog.querySelector('[data-action="save"]').disabled=true;
   try{
    let persisted=false;
    try{await imageStore('put',account,{prefs,image,revision});persisted=true;}catch(error){if(image)throw error;}
    try{localStorage.setItem(preferenceKey(account),JSON.stringify({...prefs,revision}));persisted=true;}catch{if(!persisted)throw Error('O navegador bloqueou o armazenamento. As alterações não foram salvas.');}
    if(version!==generation||account!==userId)return;
    writeLogo(account,draftLogo);savedLogo={...draftLogo};saved=prefs;savedImage=image;savedRevision=revision;close();
   }catch(error){if(version===generation)report(error.message);}finally{busy=false;dialog.querySelector('[data-action="save"]').disabled=false;}
  }
 });
 dialog.addEventListener('input',event=>{
  if(!draft||busy)return;
  const input=event.target;if(['hyronEyes','hyronBelly','hyronLogoBg'].includes(input.name)){if(!validHex(input.value))return;draftLogo[input.name==='hyronEyes'?'eyes':input.name==='hyronBelly'?'belly':'background']=input.value;sync();return;}if(input.name==='hyron-theme'){const previous=PRESETS[draft.theme],p=PRESETS[input.value];draft={...draft,theme:input.value,surface:draft.surface===previous.surface?p.surface:draft.surface,accent:draft.accent===previous.accent?p.accent:draft.accent,icon:draft.icon===previous.icon?p.icon:draft.icon};}
  else if(['accent','icon','surface','background','color','color2','angle'].includes(input.name))draft=normalizePrefs({...draft,[input.name]:input.name==='angle'?Number(input.value):input.value});
  else return;
  sync();
 });
 dialog.querySelector('[name="image"]').addEventListener('change',async event=>{
  const file=event.target.files?.[0];if(!file||!draft)return;const account=userId,version=generation;busy=true;dialog.querySelector('[data-action="save"]').disabled=true;report('Preparando imagem…');
  try{const image=await prepareImage(file);if(version!==generation||account!==userId||!draft)return;draftImage=image;draft.background='image';report('Prévia pronta. Salve para usar este fundo.');sync();}catch(error){if(version===generation&&draft)report(error.message);}finally{busy=false;dialog.querySelector('[data-action="save"]').disabled=false;event.target.value='';}
 });
 paint(saved,null);
 return {setUser(id){
  generation++;const version=generation;userId=typeof id==='string'&&id?id:null;draft=null;draftImage=null;draftLogo=null;dialog.close();saved=normalizePrefs(DEFAULT_PREFS);savedLogo=userId?readLogo(userId):{...ORIGINAL_LOGO};savedImage=null;savedRevision=0;paint(saved,null);button.disabled=true;
  if(!userId)return;const account=userId;
  try{const record=JSON.parse(localStorage.getItem(preferenceKey(account))||'null');saved=normalizePrefs(record);savedRevision=Number.isFinite(record?.revision)?record.revision:0;}catch{}paint(saved,null);
  imageStore('get',account).then(record=>{if(version!==generation||account!==userId||draft||!record||(record.revision||0)<savedRevision)return;saved=normalizePrefs(record.prefs);savedRevision=record.revision||0;savedImage=record.image instanceof Blob?record.image:null;paint(saved,savedImage);}).catch(()=>{}).finally(()=>{if(version===generation&&account===userId)button.disabled=false;});
 }};
}
