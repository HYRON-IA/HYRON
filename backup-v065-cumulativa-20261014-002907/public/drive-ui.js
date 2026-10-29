// HYRON_GOOGLE_DRIVE_UI_V063B
const q=id=>document.getElementById(id);
const note=q('hyron-drive-status'),list=q('hyron-drive-list'),pick=q('hyron-drive-picker');
const fmt=n=>Number(n)>1048576?(Number(n)/1048576).toFixed(1)+' MB':Math.ceil(Number(n)/1024)+' KB';
async function api(url,init={}){const r=await fetch(url,{credentials:'same-origin',...init});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'HTTP '+r.status);return d;}
const post=(p,b={})=>api(p,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});
async function refresh(){try{const s=await api('/api/drive/status');q('hyron-drive-connect').hidden=s.connected;q('hyron-drive-disconnect').hidden=!s.connected;pick.hidden=!s.connected;q('hyron-drive-head').textContent=s.connected?'Google Drive conectado':'Google Drive desconectado';list.replaceChildren();if(!s.connected)return;
 const x=await api('/api/drive/files');if(!x.files.length){list.textContent='Nenhum arquivo enviado pelo HYRON.';return;}
 for(const file of x.files){const row=document.createElement('div');row.className='hyron-file-row';const name=document.createElement('span');name.textContent=file.name+' · '+fmt(file.size||0);const a=document.createElement('a');a.textContent='Baixar';a.href='/api/drive/files/'+encodeURIComponent(file.id)+'/download';const del=document.createElement('button');del.type='button';del.textContent='Excluir';del.addEventListener('click',async()=>{if(!confirm('Excluir permanentemente '+file.name+' do seu Google Drive?'))return;try{await api('/api/drive/files/'+encodeURIComponent(file.id),{method:'DELETE',headers:{'content-type':'application/json'}});await refresh();}catch(e){note.textContent=e.message;}});row.append(name,a,del);list.append(row);}
 }catch(e){note.textContent='Drive: '+e.message;}}
q('hyron-drive-connect')?.addEventListener('click',()=>location.assign('/api/drive/connect'));
q('hyron-drive-disconnect')?.addEventListener('click',async()=>{if(!confirm('Desconectar Google Drive? Os arquivos enviados permanecerão no Drive.'))return;try{await post('/api/drive/disconnect');note.textContent='Conta desconectada.';await refresh();}catch(e){note.textContent=e.message;}});
q('hyron-drive-open')?.addEventListener('click',async()=>{const p=q('hyron-drive-panel');p.hidden=!p.hidden;if(!p.hidden)await refresh();});
q('hyron-drive-close')?.addEventListener('click',()=>q('hyron-drive-panel').hidden=true);
pick?.addEventListener('change',async()=>{const selected=Array.from(pick.files||[]);pick.value='';for(const file of selected){if(file.size<1||file.size>100*1024*1024){note.textContent='Tamanho permitido: 1 byte a 100 MB';continue;}
 try{note.textContent='Preparando '+file.name;const s=await post('/api/drive/upload/start',{name:file.name,size:file.size,mime:file.type||'application/octet-stream'});let offset=0;while(offset<file.size){const end=Math.min(file.size,offset+s.partSize),blob=file.slice(offset,end);const r=await fetch('/api/drive/upload/'+s.id+'/part',{method:'PUT',credentials:'same-origin',headers:{'content-type':'application/octet-stream'},body:blob});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Falha no envio');offset=end;note.textContent=file.name+' · '+Math.floor(offset/file.size*100)+'%';if(d.done)break;}note.textContent='Enviado ao Google Drive: '+file.name;await refresh();}catch(e){note.textContent='Erro: '+e.message;}
 }});
if(new URLSearchParams(location.search).has('drive')){const u=new URL(location.href);u.searchParams.delete('drive');history.replaceState(null,'',u.pathname+u.search+u.hash);q('hyron-drive-panel').hidden=false;refresh();}

// HYRON_DRIVE_DELETE_CONTENT_TYPE_V063G

// HYRON_V064_DRIVE_ATTACH: reusa o upload autenticado para anexos do chat.
window.hyronDriveStatus=async()=>{
 try {const x=await api('/api/drive/status');return !!x.connected;}catch{return false;}
};
window.hyronDriveUploadFile=async(file,onProgress=()=>{})=>{
 if(!file||file.size<1||file.size>100*1024*1024)throw Error('Google Drive aceita arquivos de 1 byte até 100 MB.');
 const start=await post('/api/drive/upload/start',{name:file.name,size:file.size,mime:file.type||'application/octet-stream'});
 let offset=0;
 while(offset<file.size){
  const end=Math.min(file.size,offset+start.partSize);
  const response=await fetch('/api/drive/upload/'+encodeURIComponent(start.id)+'/part',{
   method:'PUT',credentials:'same-origin',headers:{'content-type':'application/octet-stream'},body:file.slice(offset,end)
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||'Google Drive HTTP '+response.status);
  offset=end;onProgress(Math.floor(100*offset/file.size));
  if(data.done)return {id:data.id||'',name:file.name,size:file.size};
 }
 throw Error('Upload do Google Drive não foi concluído.');
};
