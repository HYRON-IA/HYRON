// HYRON v0.6.6 - Visualização segura: não executa HTML, JS, SVG ou scripts.
const textExt=new Set(['txt','md','markdown','html','htm','css','js','mjs','cjs','jsx','ts','tsx','py','php','java','cs','c','h','cpp','hpp','go','rs','rb','sh','bat','ps1','sql','json','jsonc','xml','yaml','yml','toml','ini','cfg','env','csv','tsv','log','svg','vue','svelte','gradle','gitignore']);
const imgExt=new Set(['png','jpg','jpeg','webp','gif']);
const maxText=96*1024,maxImage=8*1024*1024;
const extOf=name=>String(name||'').split('.').pop().toLowerCase();
const fmt=n=>Number(n||0).toLocaleString('pt-BR')+' bytes';
let activeUrl=null;
const dialog=document.createElement('dialog');dialog.id='hyron-file-preview';dialog.setAttribute('aria-label','Visualização prévia do arquivo');
const head=document.createElement('div');head.className='hyron-preview-head';
const title=document.createElement('strong');title.textContent='Prévia de arquivo';
const close=document.createElement('button');close.type='button';close.textContent='✕ Fechar';
head.append(title,close);
const message=document.createElement('p');message.className='hyron-preview-note';
const area=document.createElement('div');area.className='hyron-preview-body';
dialog.append(head,message,area);document.body.append(dialog);
function release(){if(activeUrl){URL.revokeObjectURL(activeUrl);activeUrl=null;}area.replaceChildren();}
close.onclick=()=>dialog.close();dialog.addEventListener('close',release);
const show=()=>{if(!dialog.open){if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');}};
async function renderPreview(file,name,size){
 title.textContent='📎 '+name;release();area.textContent='Preparando prévia...';show();
 const ext=extOf(name);message.textContent=fmt(size)+' · apenas visualização, sem executar arquivos';
 if(imgExt.has(ext)){
  if(size>maxImage){area.textContent='Imagem grande demais para a prévia (limite visual: 8 MiB). O arquivo original continua disponível.';return;}
  // Verificação MIME restrita evita interpretar outros formatos como imagens.
  const mime=({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',svg:'image/svg+xml'})[ext];
  const blob=new Blob([await file.arrayBuffer()],{type:mime});
  activeUrl=URL.createObjectURL(blob);const image=document.createElement('img');image.alt='Prévia de '+name;image.className='hyron-preview-image';image.src=activeUrl;
  image.onerror=()=>{area.textContent='Não foi possível exibir esta imagem.'};area.replaceChildren(image);
  message.textContent+=' · amplie com o zoom do navegador';return;
 }
 if(!textExt.has(ext)){area.textContent='Prévia indisponível para este formato. O arquivo pode ser baixado normalmente.';return;}
 const fragment=file.slice(0,maxText);let value=await fragment.text();
 if(value.includes('\u0000')){area.textContent='Este arquivo parece conter dados binários; prévia de texto indisponível.';return;}
 const code=ext!=='txt'&&ext!=='md'&&ext!=='markdown'&&ext!=='log'&&ext!=='csv'&&ext!=='tsv';
 const pre=document.createElement('pre');pre.className=code?'hyron-preview-code':'hyron-preview-text';
 const codeNode=document.createElement('code');
 if(code){const lines=value.split('\n');const maxLines=3000;for(let i=0;i<Math.min(lines.length,maxLines);i++){
  const line=document.createElement('span');line.className='hyron-preview-line';line.textContent=lines[i]||' ';
  line.dataset.line=String(i+1);codeNode.append(line);
 }if(lines.length>maxLines)message.textContent+=' · primeiras '+maxLines+' linhas';}
 else codeNode.textContent=value;
 pre.append(codeNode);area.replaceChildren(pre);
 if(size>maxText)message.textContent+=' · mostrando somente os primeiros 96 KiB';
}
// Arquivo anexado: prévia não modifica nem envia dados.
window.hyronPreviewFile=async(file)=>{
 try{await renderPreview(file,file.name,file.size);}catch(e){area.textContent='Não foi possível gerar a prévia: '+String(e?.message||e);show();}
};
// Arquivo do Google Drive: endpoint autenticado, até 96 KiB de texto ou 8 MiB de imagem.
window.hyronPreviewDriveFile=async(file)=>{
 const ext=extOf(file.name);const size=Number(file.size)||0;
 if(!textExt.has(ext)&&!imgExt.has(ext)){title.textContent='📎 '+file.name;message.textContent=fmt(size);area.textContent='Prévia ainda não disponível para este formato.';show();return;}
 if(imgExt.has(ext)&&size>maxImage){title.textContent='📎 '+file.name;message.textContent=fmt(size);area.textContent='Imagem grande demais para a prévia (8 MiB). Use Baixar.';show();return;}
 title.textContent='📎 '+file.name;message.textContent=fmt(size);area.textContent='Carregando prévia privada do Google Drive...';show();
 try{
  const r=await fetch('/api/drive/files/'+encodeURIComponent(file.id)+'/preview',{credentials:'same-origin',cache:'no-store'});
  if(!r.ok){const reason=await r.json().catch(()=>({}));throw Error(reason.error||'HTTP '+r.status);}
  const blob=await r.blob();
  await renderPreview(blob,file.name,size);
 }catch(e){area.textContent='Falha ao ler do Drive: '+String(e?.message||e);show();}
};
