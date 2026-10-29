// HYRON V7 - interfaces de Drive + personalizacao de marca. Sem alterar APIs existentes.
import {createCobraMark} from './cobra-mark.js';
const $=id=>document.getElementById(id);
const safeColor=s=>/^#[0-9a-f]{6}$/i.test(s||'');
const prettySize=n=>{const x=Number(n)||0;return x>=1048576?(x/1048576).toLocaleString('pt-BR',{maximumFractionDigits:1})+' MB':Math.max(1,Math.ceil(x/1024))+' KB';};
const api=async(path,opts={})=>{const r=await fetch(path,{credentials:'same-origin',cache:'no-store',...opts});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Erro HTTP '+r.status);return d;};
const filePath=(f,action)=>'/api/drive/files/'+encodeURIComponent(f.id)+'/'+action;
const isPreviewable=f=>/\.(?:png|jpe?g|webp|gif|svg)$/i.test(f.name||'') && Number(f.size)<=8*1048576;
const safeDownload=f=>{const a=document.createElement('a');a.href=filePath(f,'download');a.download=f.name||'arquivo';document.body.append(a);a.click();a.remove();};
const ui=document.createElement('div');ui.id='hyron-v7-root';ui.innerHTML=`
<div id="hyron-v7-shade" hidden></div>
<aside id="hyron-v7-manager" class="hyron-v7-panel" aria-label="Arquivos do Google Drive" aria-hidden="true" hidden>
 <header class="hyron-v7-head"><div><strong>Google Drive</strong><small id="hyron-v7-manager-state">Arquivos da pasta HYRON</small></div><button type="button" data-v7-close aria-label="Fechar">✕</button></header>
 <div class="hyron-v7-scroll"><div class="hyron-v7-controls"><button id="hyron-v7-connect" type="button">Conectar Drive</button><button id="hyron-v7-disconnect" type="button" hidden>Desconectar</button><label class="hyron-v7-upload" id="hyron-v7-upload-label">↑ Enviar arquivos<input id="hyron-v7-upload" type="file" multiple hidden></label><button id="hyron-v7-refresh" type="button">Atualizar</button></div>
 <div class="hyron-v7-filters"><input id="hyron-v7-manager-search" type="search" placeholder="Pesquisar arquivos" aria-label="Pesquisar arquivos"><select id="hyron-v7-manager-sort" aria-label="Ordenar"><option value="new">Recentes</option><option value="old">Antigos</option><option value="name">Nome A–Z</option><option value="size">Maior primeiro</option></select><button type="button" id="hyron-v7-manager-view" title="Alternar grade e lista">☷ Lista</button></div>
 <div class="hyron-v7-selectbar"><label><input type="checkbox" id="hyron-v7-selectall"> Selecionar visíveis</label><button type="button" id="hyron-v7-download-selected">Baixar selecionados</button><span id="hyron-v7-manager-count"></span></div><p id="hyron-v7-manager-msg" role="status"></p><div id="hyron-v7-manager-grid" class="hyron-v7-grid"></div></div>
</aside>
<dialog id="hyron-v7-picker" class="hyron-v7-dialog" aria-label="Selecionar arquivos do Drive">
 <header class="hyron-v7-head"><div><strong>Selecionar do Drive</strong><small>Escolha os arquivos para anexar ao chat</small></div><button type="button" data-v7-close aria-label="Fechar">✕</button></header>
 <div class="hyron-v7-filters"><input id="hyron-v7-picker-search" type="search" placeholder="Pesquisar arquivos" aria-label="Pesquisar arquivos"><select id="hyron-v7-picker-sort" aria-label="Ordenar"><option value="new">Recentes</option><option value="old">Antigos</option><option value="name">Nome A–Z</option><option value="size">Maior primeiro</option></select><button type="button" id="hyron-v7-picker-view">☷ Lista</button></div>
 <div class="hyron-v7-selectbar"><label><input type="checkbox" id="hyron-v7-picker-all"> Selecionar visíveis</label><span id="hyron-v7-picker-count"></span></div>
 <div id="hyron-v7-picker-grid" class="hyron-v7-grid"></div><p id="hyron-v7-picker-msg" role="status"></p><footer class="hyron-v7-footer"><button type="button" data-v7-close>Cancelar</button><button type="button" id="hyron-v7-attach">Anexar selecionados</button></footer>
</dialog>
<dialog id="hyron-v7-confirm" class="hyron-v7-confirm"><h2 id="hyron-v7-confirm-title">Confirmar</h2><p id="hyron-v7-confirm-text"></p><footer class="hyron-v7-footer"><button type="button" id="hyron-v7-confirm-no">Cancelar</button><button type="button" id="hyron-v7-confirm-yes">Confirmar</button></footer></dialog>
<dialog id="hyron-v7-preview" class="hyron-v7-preview"><header class="hyron-v7-head"><strong id="hyron-v7-preview-title"></strong><button type="button" data-v7-close>✕</button></header><div id="hyron-v7-preview-body"></div></dialog>`;
document.body.append(ui);
const manager=$('hyron-v7-manager'), shade=$('hyron-v7-shade'), picker=$('hyron-v7-picker');
const selections={manager:new Set(),picker:new Set()}, view={manager:'grid',picker:'grid'};
let files=[],connected=false,active=null,account=null;
const setMessage=(where,message)=>{$('hyron-v7-'+where+'-msg').textContent=message;};
function confirmV7(title,description){return new Promise(resolve=>{const dialog=$('hyron-v7-confirm');$('hyron-v7-confirm-title').textContent=title;$('hyron-v7-confirm-text').textContent=description;const yes=$('hyron-v7-confirm-yes'),no=$('hyron-v7-confirm-no');let done=false;const settle=ok=>{if(done)return;done=true;dialog.close();resolve(ok);};yes.onclick=()=>settle(true);no.onclick=()=>settle(false);dialog.oncancel=ev=>{ev.preventDefault();settle(false);};dialog.showModal();});}
async function updateFiles(){const status=await api('/api/drive/status');connected=!!status.connected;$('hyron-v7-connect').hidden=connected;$('hyron-v7-disconnect').hidden=!connected;$('hyron-v7-upload-label').hidden=!connected;$('hyron-v7-manager-state').textContent=connected?'Drive conectado':'Drive desconectado';files=connected?(await api('/api/drive/files')).files||[]:[];files=files.filter(f=>f&&typeof f.id==='string'&&/^[\w-]{8,180}$/.test(f.id));for(const key of ['manager','picker']){selections[key]=new Set([...selections[key]].filter(id=>files.some(f=>f.id===id)));render(key);}}
function visible(key){const query=($('hyron-v7-'+key+'-search').value||'').toLocaleLowerCase();const sort=$('hyron-v7-'+key+'-sort').value;const allow=key==='manager'?files:files.filter(f=>Number(f.size)>0&&Number(f.size)<=100*1048576);return allow.filter(f=>(f.name||'').toLocaleLowerCase().includes(query)).sort((a,b)=>sort==='name'?String(a.name).localeCompare(String(b.name),'pt-BR'):sort==='size'?Number(b.size)-Number(a.size):sort==='old'?String(a.createdTime||'').localeCompare(String(b.createdTime||'')):String(b.createdTime||'').localeCompare(String(a.createdTime||'')));}
function action(name,label,callback){const b=document.createElement('button');b.type='button';b.textContent=label;b.title=name;b.setAttribute('aria-label',name);b.addEventListener('click',async ev=>{ev.stopPropagation();await callback(b);});return b;}
function makeCard(f,key){const card=document.createElement('div');card.className='hyron-v7-file';card.dataset.id=f.id;const selected=selections[key].has(f.id);card.classList.toggle('is-selected',selected);
 const check=document.createElement('input');check.type='checkbox';check.checked=selected;check.setAttribute('aria-label','Selecionar '+f.name);check.addEventListener('change',()=>{if(check.checked)selections[key].add(f.id);else selections[key].delete(f.id);render(key);});const picture=document.createElement('div');picture.className='hyron-v7-thumb';if(isPreviewable(f)){const img=new Image();img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';img.src=filePath(f,'preview');img.onerror=()=>{picture.textContent='▣';};picture.append(img);}else picture.textContent=/\.svg$/i.test(f.name)?'◇':'▤';const info=document.createElement('div');info.className='hyron-v7-file-info';const name=document.createElement('strong');name.textContent=f.name||'Arquivo';name.title=f.name||'Arquivo';const meta=document.createElement('small');meta.textContent=prettySize(f.size);info.append(name,meta);
 const actions=document.createElement('div');actions.className='hyron-v7-file-actions';actions.append(action('Visualizar '+f.name,'◉',()=>preview(f)),action('Baixar '+f.name,'↓',()=>safeDownload(f)));if(key==='manager')actions.append(action('Excluir '+f.name,'×',async()=>{if(!await confirmV7('Excluir arquivo?','Excluir permanentemente '+f.name+' do Google Drive?'))return;try{await api('/api/drive/files/'+encodeURIComponent(f.id),{method:'DELETE'});selections.manager.delete(f.id);await updateFiles();}catch(e){setMessage(key,e.message);}}));card.append(check,picture,info,actions);card.addEventListener('dblclick',()=>key==='picker'?(selections[key].add(f.id),render(key)):preview(f));return card;}
function render(key){const target=$('hyron-v7-'+key+'-grid');target.replaceChildren();target.classList.toggle('as-list',view[key]==='list');const shown=visible(key);for(const f of shown)target.append(makeCard(f,key));if(!shown.length){const empty=document.createElement('p');empty.className='hyron-v7-empty';empty.textContent=connected?'Nenhum arquivo encontrado.':'Conecte o Google Drive para ver seus arquivos.';target.append(empty);}const all=$('hyron-v7-'+(key==='manager'?'selectall':'picker-all'));all.checked=!!shown.length&&shown.every(f=>selections[key].has(f.id));all.indeterminate=shown.some(f=>selections[key].has(f.id))&&!all.checked;$('hyron-v7-'+key+'-count').textContent=selections[key].size+' selecionado(s)';}
// HYRON_V7_REAL_PREVIEW_SVG_TABS_081: altera especificamente o modal aberto pelo painel V7, nao file-preview.js.
async function preview(f){
 const dialog=$('hyron-v7-preview'),body=$('hyron-v7-preview-body');
 $('hyron-v7-preview-title').textContent=f.name||'Arquivo';
 body.replaceChildren();
 const svg=/\.svg$/i.test(String(f.name||''));
 const editable=/\.(?:svg|js|mjs|cjs|jsx|ts|tsx|py|php|html?|css|json|xml|sql|java|cs|cpp|c|hpp|h|go|rs|sh|md|txt)$/i.test(String(f.name||''));
 const toolbar=document.createElement('div');toolbar.className='hyron-v7-svg-tools';
 toolbar.style.cssText='display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0;padding:4px';
 const stage=document.createElement('div');stage.className='hyron-v7-svg-stage';
 stage.style.cssText='min-height:80px;min-width:0;max-height:62vh;overflow:auto;display:flex;align-items:center;justify-content:center';
 const status=document.createElement('small');status.setAttribute('role','status');status.style.cssText='color:#a7c7bc;display:block;margin:5px 0';
 const makeButton=(label,handler)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',handler);toolbar.append(b);return b;};
 let activeTab='image';let svgText='';let loadPromise=null;
 const showImage=()=>{
  activeTab='image';stage.replaceChildren();
  const img=new Image();img.alt='Imagem SVG: '+f.name;img.src=filePath(f,'preview');
  img.style.cssText='max-width:100%;max-height:58vh;object-fit:contain';
  img.onerror=()=>{stage.textContent='Nao foi possivel renderizar o SVG.';};stage.append(img);
  imageTab?.setAttribute('aria-pressed','true');codeTab?.setAttribute('aria-pressed','false');status.textContent='Imagem SVG (visualizacao isolada).';
 };
 const showCode=async()=>{
  activeTab='code';stage.replaceChildren();status.textContent='Carregando codigo SVG...';
  imageTab?.setAttribute('aria-pressed','false');codeTab?.setAttribute('aria-pressed','true');
  try{
   if(!loadPromise)loadPromise=(async()=>{const r=await fetch(filePath(f,'preview'),{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('Google Drive HTTP '+r.status);const text=await r.text();if(!/<svg(?:\s|>)/i.test(text))throw Error('Arquivo nao contem SVG valido');if(text.length>8*1024*1024)throw Error('SVG muito grande');return text;})();
   svgText=await loadPromise;if(activeTab!=='code')return;
   const pre=document.createElement('pre');pre.style.cssText='white-space:pre;tab-size:2;max-width:100%;width:100%;overflow:auto;text-align:left;padding:14px;border-radius:9px;background:#091210;color:#d6e4df;font:12px/1.5 ui-monospace,Consolas,monospace';
   const lines=svgText.split('\n');for(let i=0;i<lines.length;i++){
    const line=document.createElement('div');const number=document.createElement('span');number.textContent=String(i+1).padStart(4,' ')+'  ';number.style.color='#72958b';line.append(number,document.createTextNode(lines[i]||' '));pre.append(line);
   }
   stage.append(pre);status.textContent='Codigo-fonte XML do SVG. Exibido como texto, sem executar scripts.';
  }catch(e){status.textContent='Falha ao ler SVG: '+String(e.message||e);}
 };
 let imageTab=null,codeTab=null;
 if(svg){imageTab=makeButton('Imagem',showImage);codeTab=makeButton('Codigo XML',()=>{void showCode()});}
 if(editable)makeButton('Editar',async()=>{
  const edit=window.hyronEditDriveCode;
  if(typeof edit!=='function'){status.textContent='Editor ainda nao carregado. Atualize a pagina (Ctrl+Shift+R).';return;}
  try{dialog.close();await edit(f);}catch(e){status.textContent='Nao foi possivel abrir o editor: '+String(e.message||e);if(!dialog.open)dialog.showModal();}
 });
 makeButton('Baixar',()=>safeDownload(f));
 body.append(toolbar,status,stage);
 if(!dialog.open)dialog.showModal();
 if(svg){showImage();return;}
 if(isPreviewable(f)){const img=new Image();img.alt=f.name;img.src=filePath(f,'preview');img.style.cssText='max-width:100%;max-height:58vh;object-fit:contain';stage.append(img);}
 else {const hint=document.createElement('p');hint.textContent=editable?'Use Editar para abrir e visualizar o codigo.':'Previa nao disponivel para este formato.';stage.append(hint);}
}

function closeManager(){manager.hidden=true;manager.setAttribute('aria-hidden','true');shade.hidden=true;document.body.classList.remove('hyron-v7-drawer-open');}
async function openManager(){manager.hidden=false;manager.setAttribute('aria-hidden','false');shade.hidden=false;document.body.classList.add('hyron-v7-drawer-open');setMessage('manager','Carregando...');try{await updateFiles();setMessage('manager','');}catch(e){setMessage('manager',e.message);}}
async function openPicker(){if(!picker.open)picker.showModal();setMessage('picker','Carregando...');try{await updateFiles();setMessage('picker','');}catch(e){setMessage('picker',e.message);}}
// Captura o clique antes do handler legado, preservando os métodos de upload existentes.
document.addEventListener('click',ev=>{const hit=ev.target.closest?.('#hyron-drive-open,#hyron-drive-image-attach');if(!hit)return;ev.preventDefault();ev.stopImmediatePropagation();hit.id==='hyron-drive-open'?openManager():openPicker();},true);
shade.addEventListener('click',closeManager);
ui.querySelectorAll('[data-v7-close]').forEach(b=>b.addEventListener('click',()=>{const d=b.closest('dialog');if(d)d.close();else closeManager();}));
for(const key of ['manager','picker']){$('hyron-v7-'+key+'-search').addEventListener('input',()=>render(key));$('hyron-v7-'+key+'-sort').addEventListener('change',()=>render(key));$('hyron-v7-'+key+'-view').addEventListener('click',()=>{view[key]=view[key]==='grid'?'list':'grid';$('hyron-v7-'+key+'-view').textContent=view[key]==='grid'?'☷ Lista':'▦ Grade';render(key);});const all=$('hyron-v7-'+(key==='manager'?'selectall':'picker-all'));all.addEventListener('change',()=>{for(const f of visible(key)){if(all.checked)selections[key].add(f.id);else selections[key].delete(f.id);}render(key);});}
$('hyron-v7-connect').addEventListener('click',()=>location.assign('/api/drive/connect'));
$('hyron-v7-disconnect').addEventListener('click',async()=>{if(!await confirmV7('Desconectar Drive?','Os arquivos permanecerão no Google Drive.'))return;try{await api('/api/drive/disconnect',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});await updateFiles();}catch(e){setMessage('manager',e.message);}});
$('hyron-v7-refresh').addEventListener('click',()=>updateFiles().catch(e=>setMessage('manager',e.message)));
$('hyron-v7-upload').addEventListener('change',async ev=>{const input=ev.target;for(const f of [...input.files]){try{if(typeof window.hyronDriveUploadFile!=='function')throw Error('O upload do Drive não está disponível.');setMessage('manager','Enviando '+f.name+'...');await window.hyronDriveUploadFile(f,n=>setMessage('manager','Enviando '+f.name+' '+Math.round(n*100)+'%'));}catch(e){setMessage('manager',e.message);return;}}input.value='';await updateFiles();setMessage('manager','Upload concluído.');});
$('hyron-v7-download-selected').addEventListener('click',()=>{const chosen=files.filter(f=>selections.manager.has(f.id));if(chosen.length>10){setMessage('manager','Selecione no máximo 10 arquivos por vez para baixar.');return;}for(const f of chosen)safeDownload(f);});
$('hyron-v7-attach').addEventListener('click',async()=>{const chosen=files.filter(f=>selections.picker.has(f.id));if(!chosen.length){setMessage('picker','Selecione ao menos um arquivo.');return;}if(typeof window.hyronAttachDriveFile!=='function'){setMessage('picker','Sistema de anexos indisponível.');return;}const button=$('hyron-v7-attach');button.disabled=true;try{for(let i=0;i<chosen.length;i++){const f=chosen[i];setMessage('picker','Anexando '+(i+1)+' de '+chosen.length+': '+f.name);const r=await fetch(filePath(f,'download'),{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('Falha ao obter '+f.name+' (HTTP '+r.status+')');const blob=await r.blob();if(blob.size>100*1048576)throw Error('Arquivo excede 100 MB.');window.hyronAttachDriveFile(new File([blob],f.name,{type:f.mimeType||'application/octet-stream'}),f.id);}selections.picker.clear();picker.close();}catch(e){setMessage('picker',e.message);}finally{button.disabled=false;}});
// Remove somente os atalhos da barra lateral; não altera as tabelas de memoria.
function cleanSidebar(){for(const id of ['memory','claim']){const node=$(id);if(node){node.hidden=true;node.style.display='none';}}}
cleanSidebar();
