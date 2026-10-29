import {hyronConfirm} from './hyron-dialogs.js';
// HYRON_CODE_EDITOR_081 - edicao local e em Drive, sem executar codigo.
const CODE_EXT = new Set(['txt','md','markdown','html','htm','css','js','mjs','cjs','jsx','ts','tsx','py','php','java','cs','c','cpp','h','hpp','go','rs','rb','sh','bat','ps1','sql','json','jsonc','xml','yaml','yml','toml','ini','cfg','env','csv','tsv','log','vue','svelte','gradle','gitignore']);
const MAX_EDIT=512*1024;
export function hyronIsEditableCode(name){return CODE_EXT.has(String(name||'').split('.').pop().toLowerCase());}
let dialog, field, gutter, status, title, copyButton, downloadButton, saveButton, copySaveButton, findInput, current;
const $=(tag, cls, text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
const msg=(s)=>{if(status)status.textContent=s;};
const notify=async(s)=>window.hyronNotice?.(s)||undefined;
function initialize(){
 if(dialog)return;
 dialog=$('dialog','hyron-editor');dialog.id='hyron-code-editor';dialog.setAttribute('aria-label','Editor de codigo');
 const header=$('header','hyron-editor-header'); title=$('strong','', 'Editor');const close=$('button','','Fechar');close.type='button';header.append(title,close);
 const tools=$('div','hyron-editor-tools');
 findInput=$('input');findInput.type='search';findInput.placeholder='Buscar no código...';findInput.setAttribute('aria-label','Buscar no código');
 const findNext=$('button','','Buscar');findNext.type='button';
 copyButton=$('button','','Copiar');copyButton.type='button';downloadButton=$('button','','Baixar');downloadButton.type='button';
 saveButton=$('button','','Salvar');saveButton.type='button';copySaveButton=$('button','','Salvar como cópia');copySaveButton.type='button';
 tools.append(findInput,findNext,copyButton,downloadButton,saveButton,copySaveButton);
 const workspace=$('div','hyron-editor-workspace');gutter=$('div','hyron-editor-gutter');gutter.setAttribute('aria-hidden','true');field=$('textarea','hyron-editor-input');field.spellcheck=false;field.wrap='off';field.setAttribute('aria-label','Conteúdo do arquivo');workspace.append(gutter,field);
 status=$('p','hyron-editor-status');status.setAttribute('role','status');dialog.append(header,tools,workspace,status);document.body.append(dialog);
 const lineNumbers=()=>{const lineCount=field.value.split('\n').length;gutter.textContent=Array.from({length:lineCount},(_,i)=>i+1).join('\n');};
 field.addEventListener('input',()=>{lineNumbers();msg('Alterações não salvas');});field.addEventListener('scroll',()=>{gutter.scrollTop=field.scrollTop;});
 field.addEventListener('keydown',e=>{if(e.key==='Tab'){e.preventDefault();const a=field.selectionStart,b=field.selectionEnd;field.setRangeText('  ',a,b,'end');field.dispatchEvent(new Event('input'));}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();void save(false);}});
 const find=()=>{const query=findInput.value;if(!query)return;const found=field.value.toLowerCase().indexOf(query.toLowerCase(),field.selectionEnd);const index=found===-1?field.value.toLowerCase().indexOf(query.toLowerCase()):found;if(index>=0){field.focus();field.setSelectionRange(index,index+query.length);}else msg('Não encontrado.');};
 findNext.addEventListener('click',find);findInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();find();}});
 copyButton.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(field.value);msg('Código copiado.');}catch{field.focus();field.select();msg('Selecione e copie com Ctrl+C.');}});
 downloadButton.addEventListener('click',()=>{const blob=new Blob([field.value],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const link=$('a');link.href=url;link.download=current.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 saveButton.addEventListener('click',()=>void save(false));copySaveButton.addEventListener('click',()=>void save(true));
 const canClose=async()=>!current||field.value===current.initial||await hyronConfirm('Descartar alterações não salvas?');
 close.addEventListener('click',async()=>{if(await canClose())dialog.close();});dialog.addEventListener('cancel',e=>{e.preventDefault();void canClose().then(ok=>{if(ok)dialog.close();});});
 dialog.addEventListener('close',()=>{current=null;});
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
function open(name,content,config){initialize();current={name,initial:content,...config};field.value=content;gutter.textContent=Array.from({length:content.split('\n').length},(_,i)=>i+1).join('\n');title.textContent='</> '+name;copySaveButton.hidden=config.kind==='local';msg(config.kind==='local'?'Editando cópia local (o original não será alterado).':'Editando arquivo do Drive · verificação de versão ativa.');if(!dialog.open)dialog.showModal();field.focus();}
export async function hyronEditLocalCode(file,onSave){if(!hyronIsEditableCode(file?.name))return false;if(file.size>MAX_EDIT)throw Error('Editor limitado a arquivos de até 512 KiB.');const content=await file.text();if(content.includes('\0'))throw Error('Arquivo binário não pode ser editado.');open(file.name,content,{kind:'local',mime:file.type,onSave});return true;}
export async function hyronEditDriveCode(file){if(!hyronIsEditableCode(file?.name))return false;const data=await api('/api/drive/code/'+encodeURIComponent(file.id));open(data.name,data.content,{kind:'drive',id:file.id,version:data.version});return true;}
window.hyronEditDriveCode=hyronEditDriveCode;
