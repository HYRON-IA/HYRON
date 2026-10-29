import {hyronConfirm} from "./hyron-dialogs.js";
// HYRON_FILES_UI_V063: gerenciador de arquivos privados, separado do contexto enviado aos modelos.
const open=document.getElementById('hyron-files-open');
const panel=document.getElementById('hyron-files-panel');
const picker=document.getElementById('hyron-files-picker');
const status=document.getElementById('hyron-files-status');
const list=document.getElementById('hyron-files-list');
const MAX=100*1024*1024, PART=5*1024*1024;
const fmt=n=>n>=1024*1024?(n/1048576).toFixed(1)+' MB':(n/1024).toFixed(0)+' KB';
async function req(path,opts={}){
 const res=await fetch(path,{credentials:'same-origin',...opts});
 const data=await res.json().catch(()=>({error:'Erro de comunicação'}));
 if(!res.ok)throw Error(data.error||'Falha HTTP '+res.status);
 return data;
}
async function refresh(){
 list.replaceChildren();
 const {files}=await req('/api/files');
 if(!files.length){list.textContent='Nenhum arquivo armazenado ainda.';return;}
 for(const file of files){
  const row=document.createElement('div');row.className='hyron-file-row';
  const label=document.createElement('span');label.textContent=file.name+' · '+fmt(file.size);
  const download=document.createElement('a');download.href='/api/files/'+encodeURIComponent(file.id)+'/download';download.textContent='Baixar';download.rel='nofollow';
  const del=document.createElement('button');del.type='button';del.textContent='Excluir';del.onclick=async()=>{
   if(!await hyronConfirm('Excluir '+file.name+' permanentemente?'))return;
   try{await req('/api/files/'+file.id,{method:'DELETE',headers:{'content-type':'application/json'},body:'{}'});await refresh();}catch(err){status.textContent=err.message;}
  };
  row.append(label,download,del);list.append(row);
 }
}
open?.addEventListener('click',async()=>{panel.hidden=!panel.hidden;if(!panel.hidden){try{await refresh();}catch(err){status.textContent=err.message;}}});
document.getElementById('hyron-files-close')?.addEventListener('click',()=>panel.hidden=true);
picker?.addEventListener('change',async()=>{
 const files=[...(picker.files||[])];picker.value='';
 for(const file of files){
  if(!file.size||file.size>MAX){status.textContent='Arquivo deve ter entre 1 byte e 100 MB: '+file.name;continue;}
  let created;
  try{
   status.textContent='Preparando '+file.name+'…';
   created=await req('/api/files/init',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:file.name,size:file.size,mime:file.type||'application/octet-stream'})});
   for(let i=0;i<created.partCount;i++){
    const offset=i*PART,chunk=file.slice(offset,offset+PART);
    const response=await fetch('/api/files/'+created.id+'/parts/'+(i+1),{method:'PUT',credentials:'same-origin',headers:{'content-type':'application/octet-stream'},body:chunk});
    if(!response.ok){const error=await response.json().catch(()=>({}));throw Error(error.error||'Falha ao enviar bloco '+(i+1));}
    status.textContent=`${file.name} — ${Math.round(100*(i+1)/created.partCount)}%`;
   }
   await req('/api/files/'+created.id+'/complete',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
   status.textContent='Arquivo armazenado: '+file.name;
   await refresh();
  }catch(err){status.textContent='Erro: '+err.message;
   if(created?.id)await fetch('/api/files/'+created.id,{method:'DELETE',credentials:'same-origin',headers:{'content-type':'application/json'},body:'{}'}).catch(()=>{});
  }
 }
});
