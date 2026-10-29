import {hyronConfirm} from './hyron-dialogs.js';
// HYRON_CODE_EDITOR_081 - edicao local e em Drive, sem executar codigo.
const CODE_EXT = new Set(['txt','md','markdown','html','htm','css','js','mjs','cjs','jsx','ts','tsx','py','php','java','cs','c','cpp','h','hpp','go','rs','rb','sh','bat','ps1','sql','json','jsonc','xml','yaml','yml','toml','ini','cfg','env','csv','tsv','log','vue','svelte','gradle','gitignore','svg']);
const MAX_EDIT=512*1024;
export function hyronIsEditableCode(name){return CODE_EXT.has(String(name||'').split('.').pop().toLowerCase());}
let dialog, field, gutter, status, title, copyButton, downloadButton, saveButton, copySaveButton, findInput, current, highlight, codeView, imageView, imageElement, sourceUrl, tabCode, tabImage;
const $=(tag, cls, text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
const msg=(s)=>{if(status)status.textContent=s;};
const notify=async(s)=>window.hyronNotice?.(s)||undefined;

// HYRON_CODE_HIGHLIGHT_082 - o texto permanece sempre no textarea editavel.
const htmlEscape=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
function language(name){const ext=String(name||'').split('.').pop().toLowerCase();return ({js:'javascript',mjs:'javascript',cjs:'javascript',jsx:'javascript',ts:'javascript',tsx:'javascript',json:'json',jsonc:'json',html:'markup',htm:'markup',xml:'markup',svg:'markup',css:'css',py:'python',php:'php',sql:'sql',sh:'shell',ps1:'shell',bat:'shell',java:'javascript',cs:'javascript',cpp:'javascript',c:'javascript',h:'javascript',go:'javascript',rs:'javascript',md:'markup'})[ext]||'text';}
const syntaxRules={
 javascript:/\/\/[^\n]*|\/\*[\s\S]*?\*\/|`(?:\\.|[^`])*`|"(?:\\.|[^"\n])*"|'(?:\\.|[^'\n])*'|\b(?:const|let|var|function|class|return|if|else|for|while|await|async|import|export|from|new|throw|try|catch|true|false|null|undefined|public|private|static|void|int|string|interface|type|namespace|using)\b|\b\d+(?:\.\d+)?\b/g,
 python:/#[^\n]*|"(?:\\.|[^"\n])*"|'(?:\\.|[^'\n])*'|\b(?:def|class|return|if|elif|else|for|while|with|as|async|await|import|from|pass|lambda|try|except|raise|True|False|None|self|print)\b|\b\d+(?:\.\d+)?\b/g,
 markup:/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[A-Za-z][^>]*>|"(?:\\.|[^"\n])*"|'(?:\\.|[^'\n])*'/g,
 css:/\/\*[\s\S]*?\*\/|#[0-9a-fA-F]{3,8}\b|"(?:\\.|[^"\n])*"|'(?:\\.|[^'\n])*'|\b\d+(?:\.\d+)?(?:px|rem|em|vh|vw|%)?\b|[.#]?[a-zA-Z_-][\w-]*(?=\s*\{)|[a-z-]+(?=\s*:)/g,
 json:/"(?:\\.|[^"\n])*"|\b(?:true|false|null)\b|\b-?\d+(?:\.\d+)?\b/g,
 sql:/--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|\b(?:SELECT|FROM|WHERE|INSERT|INTO|UPDATE|DELETE|CREATE|TABLE|JOIN|ON|AND|OR|ORDER|BY|GROUP|AS|NULL|NOT|PRIMARY|KEY|VALUES|LIMIT|ALTER)\b|\b\d+\b/gi,
 shell:/#[^\n]*|"(?:\\.|[^"\n])*"|'(?:\\.|[^'\n])*'|\b(?:if|then|else|fi|for|do|done|function|return|echo|export|set)\b/g
};
function syntaxClass(token,lang){if(/^\s+$/.test(token))return '';if(/^(?:\/\/|\/\*|#(?![\da-f]{3,8}\b)|<!--|--)/.test(token))return 'comment';if(/^['"`]/.test(token))return 'string';if(/^\d/.test(token)||/^#[\da-f]{3,8}$/i.test(token))return 'number';if(lang==='markup'&&token.startsWith('<'))return 'tag';if(lang==='css'&&/[:#.]|\{/g.test(token[0]))return 'selector';return 'keyword';}
function highlightSource(value,name){const lang=language(name);const rule=syntaxRules[lang];if(!rule)return htmlEscape(value);rule.lastIndex=0;let result='',last=0,match;while((match=rule.exec(value))!==null){if(match.index<last)continue;result+=htmlEscape(value.slice(last,match.index));result+='<span class="hyron-code-'+syntaxClass(match[0],lang)+'">'+htmlEscape(match[0])+'</span>';last=match.index+match[0].length;if(match[0].length===0)rule.lastIndex++;}return result+htmlEscape(value.slice(last));}
function syncHighlight(){if(!highlight||!current)return;highlight.innerHTML=highlightSource(field.value,current.name)+'\n';highlight.scrollTop=field.scrollTop;highlight.scrollLeft=field.scrollLeft;}
function releaseSvgPreview(){if(sourceUrl){URL.revokeObjectURL(sourceUrl);sourceUrl=null;}if(imageElement)imageElement.removeAttribute('src');}
function svgPreview(){if(!current||!current.name.toLowerCase().endsWith('.svg'))return;releaseSvgPreview();const content=field.value;if(new TextEncoder().encode(content).length>512*1024){msg('SVG acima do limite de 512 KiB');return;}const blob=new Blob([content],{type:'image/svg+xml'});sourceUrl=URL.createObjectURL(blob);imageElement.src=sourceUrl;}
function showView(which){if(!codeView)return;const imageMode=which==='image'&&current?.name.toLowerCase().endsWith('.svg');codeView.hidden=imageMode;imageView.hidden=!imageMode;tabCode?.setAttribute('aria-selected',String(!imageMode));tabImage?.setAttribute('aria-selected',String(imageMode));if(imageMode)svgPreview();else field.focus();}

function initialize(){
 if(dialog)return;
 dialog=$('dialog','hyron-editor');dialog.id='hyron-code-editor';dialog.setAttribute('aria-label','Editor de codigo');
 const header=$('header','hyron-editor-header'); title=$('strong','', 'Editor');const close=$('button','','Fechar');close.type='button';header.append(title,close);
 const tools=$('div','hyron-editor-tools');
 findInput=$('input');findInput.type='search';findInput.placeholder='Buscar no código...';findInput.setAttribute('aria-label','Buscar no código');
 const findNext=$('button','','Buscar');findNext.type='button';
 copyButton=$('button','','Copiar');copyButton.type='button';downloadButton=$('button','','Baixar');downloadButton.type='button';
 saveButton=$('button','','Salvar');saveButton.type='button';copySaveButton=$('button','','Salvar como cópia');copySaveButton.type='button';
 // HYRON_EDITOR_QUEBRA_VISUAL_082
 const wrapButton=$('button','','Quebra: desligada');wrapButton.type='button';wrapButton.setAttribute('aria-pressed','false');wrapButton.title='Quebra visual de linha (nao altera o arquivo)';
 tools.append(findInput,findNext,copyButton,downloadButton,saveButton,copySaveButton,wrapButton);
 const tabs=$('div','hyron-editor-tabs');tabCode=$('button','','Código');tabImage=$('button','','Imagem');tabs.append(tabCode,tabImage);tabCode.onclick=()=>showView('code');tabImage.onclick=()=>showView('image');
 const workspace=$('div','hyron-editor-workspace');codeView=$('div','hyron-editor-code-view');gutter=$('div','hyron-editor-gutter');gutter.setAttribute('aria-hidden','true');field=$('textarea','hyron-editor-input');field.spellcheck=false;field.wrap='off';field.setAttribute('aria-label','Conteúdo do arquivo');const editorLayer=$('div','hyron-editor-layer');highlight=$('pre','hyron-editor-highlight');highlight.setAttribute('aria-hidden','true');editorLayer.append(highlight,field);codeView.append(gutter,editorLayer);imageView=$('div','hyron-editor-image-view');imageElement=$('img');imageElement.alt='Prévia isolada do SVG';imageElement.onerror=()=>msg('Não foi possível renderizar este SVG. Confira o código.');imageView.append(imageElement);workspace.append(codeView,imageView);
 status=$('p','hyron-editor-status');status.setAttribute('role','status');dialog.append(header,tools,tabs,workspace,status);document.body.append(dialog);
 const setWrap=(enabled)=>{
  codeView.classList.toggle('hyron-editor-wrap',enabled);
  field.wrap=enabled?'soft':'off';
  wrapButton.textContent=enabled?'Quebra: ligada':'Quebra: desligada';
  wrapButton.setAttribute('aria-pressed',String(enabled));
  field.scrollLeft=0;highlight.scrollLeft=0;syncHighlight();
 };
 wrapButton.addEventListener('click',()=>setWrap(!codeView.classList.contains('hyron-editor-wrap')));
 const lineNumbers=()=>{const lineCount=field.value.split('\n').length;gutter.textContent=Array.from({length:lineCount},(_,i)=>i+1).join('\n');};
 field.addEventListener('input',()=>{lineNumbers();syncHighlight();msg('Alterações não salvas');});field.addEventListener('scroll',()=>{gutter.scrollTop=field.scrollTop;highlight.scrollTop=field.scrollTop;highlight.scrollLeft=field.scrollLeft;});
 field.addEventListener('keydown',e=>{if(e.key==='Tab'){e.preventDefault();const a=field.selectionStart,b=field.selectionEnd;field.setRangeText('  ',a,b,'end');field.dispatchEvent(new Event('input'));}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();void save(false);}});
 const find=()=>{const query=findInput.value;if(!query)return;const found=field.value.toLowerCase().indexOf(query.toLowerCase(),field.selectionEnd);const index=found===-1?field.value.toLowerCase().indexOf(query.toLowerCase()):found;if(index>=0){field.focus();field.setSelectionRange(index,index+query.length);}else msg('Não encontrado.');};
 findNext.addEventListener('click',find);findInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();find();}});
 copyButton.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(field.value);msg('Código copiado.');}catch{field.focus();field.select();msg('Selecione e copie com Ctrl+C.');}});
 downloadButton.addEventListener('click',()=>{const blob=new Blob([field.value],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const link=$('a');link.href=url;link.download=current.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 saveButton.addEventListener('click',()=>void save(false));copySaveButton.addEventListener('click',()=>void save(true));
 const canClose=async()=>!current||field.value===current.initial||await hyronConfirm('Descartar alterações não salvas?');
 close.addEventListener('click',async()=>{if(await canClose())dialog.close();});dialog.addEventListener('cancel',e=>{e.preventDefault();void canClose().then(ok=>{if(ok)dialog.close();});});
 dialog.addEventListener('close',()=>{releaseSvgPreview();current=null;});
 }
async function api(path,init={}){const r=await fetch(path,{credentials:'same-origin',cache:'no-store',...init});const payload=await r.json().catch(()=>({}));if(!r.ok)throw Error(payload.error||'HTTP '+r.status);return payload;}
async function uploadCopy(name,content){
 const bytes=new TextEncoder().encode(content);if(!bytes.length||bytes.length>MAX_EDIT)throw Error('Tamanho fora do limite de edição (512 KiB).');
 const start=await api('/api/drive/upload/start',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,size:bytes.length,mime:'text/plain'})});
 let offset=0;while(offset<bytes.length){const end=Math.min(offset+start.partSize,bytes.length);const r=await api('/api/drive/upload/'+encodeURIComponent(start.id)+'/part',{method:'PUT',headers:{'content-type':'application/octet-stream'},body:bytes.slice(offset,end)});offset=end;if(r.done)break;}return true;
}
async function save(asCopy){if(!current)return;const next=field.value;const bytes=new TextEncoder().encode(next);if(bytes.length>MAX_EDIT||bytes.length===0){msg('Arquivo deve ter entre 1 byte e 512 KiB.');return;}
 saveButton.disabled=true;copySaveButton.disabled=true;msg('Salvando...');
 try{
  if(current.kind==='local'){
   if(asCopy){downloadButton.click();msg('Cópia baixada.');return;}
   const fresh=new File([next],current.name,{type:current.mime||'text/plain',lastModified:Date.now()});await current.onSave(fresh);current.initial=next;msg('Anexo atualizado. Novo upload será iniciado se Drive estiver conectado.');
  }else if(asCopy){await uploadCopy(current.name,next);current.initial=next;msg('Cópia criada no Drive.');window.dispatchEvent(new Event('hyron-drive-file-updated'));}
  else{
   await api('/api/drive/code/'+encodeURIComponent(current.id),{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({content:next,version:current.version})});
   const meta=await api('/api/drive/code/'+encodeURIComponent(current.id));current.version=meta.version;current.initial=next;msg('Alterações salvas no Drive.');window.dispatchEvent(new Event('hyron-drive-file-updated'));
  }
 }catch(e){msg('Não foi possível salvar: '+String(e?.message||e));}
 finally{saveButton.disabled=false;copySaveButton.disabled=false;}
}
function open(name,content,config){initialize();current={name,initial:content,...config};field.value=content;gutter.textContent=Array.from({length:content.split('\n').length},(_,i)=>i+1).join('\n');title.textContent='</> '+name;setWrap(/\.(txt|md|markdown)$/i.test(name));tabImage.hidden=!name.toLowerCase().endsWith('.svg');showView('code');syncHighlight();copySaveButton.hidden=config.kind==='local';msg(config.kind==='local'?'Editando cópia local (o original não será alterado).':'Editando arquivo do Drive · verificação de versão ativa.');if(!dialog.open)dialog.showModal();field.focus();}
export async function hyronEditLocalCode(file,onSave){if(!hyronIsEditableCode(file?.name))return false;if(file.size>MAX_EDIT)throw Error('Editor limitado a arquivos de até 512 KiB.');const content=await file.text();if(content.includes('\0'))throw Error('Arquivo binário não pode ser editado.');open(file.name,content,{kind:'local',mime:file.type,onSave});return true;}
export async function hyronEditDriveCode(file){if(!hyronIsEditableCode(file?.name))return false;const data=await api('/api/drive/code/'+encodeURIComponent(file.id));open(data.name,data.content,{kind:'drive',id:file.id,version:data.version});return true;}
window.hyronEditDriveCode=hyronEditDriveCode;
