// HYRON_GOOGLE_DRIVE_V063B — OAuth Drive file-scoped (one account per HYRON user)
export interface DriveEnv { DB:D1Database; GOOGLE_CLIENT_ID?:string; GOOGLE_CLIENT_SECRET?:string; GOOGLE_DRIVE_TOKEN_KEY?:string }
type UserId={id:string};
const CALLBACK='https://hyron.hyron-ia.workers.dev/api/drive/callback';
const SIZE=100*1024*1024;
const CHUNK=5*1024*1024;
const j=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const err=(x:string,s=400)=>j({error:x},s);
const sha=async(x:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(x))),v=>v.toString(16).padStart(2,'0')).join('');
const b64=(u:Uint8Array)=>btoa(Array.from(u,x=>String.fromCharCode(x)).join(''));
const b64url=(u:Uint8Array)=>b64(u).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
const rnd=()=>{const a=new Uint8Array(32);crypto.getRandomValues(a);return b64url(a)};
function credentials(e:DriveEnv){return !!(e.GOOGLE_CLIENT_ID&&e.GOOGLE_CLIENT_SECRET&&e.GOOGLE_DRIVE_TOKEN_KEY&&e.GOOGLE_DRIVE_TOKEN_KEY.length>=32)}
async function cryptoKey(e:DriveEnv){const bytes=new TextEncoder().encode(e.GOOGLE_DRIVE_TOKEN_KEY!);const digest=await crypto.subtle.digest('SHA-256',bytes);return crypto.subtle.importKey('raw',digest,'AES-GCM',false,['encrypt','decrypt']);}
async function seal(e:DriveEnv,t:string){const iv=crypto.getRandomValues(new Uint8Array(12));const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},await cryptoKey(e),new TextEncoder().encode(t));return b64(iv)+'.'+b64(new Uint8Array(cipher));}
async function unseal(e:DriveEnv,s:string){const [a,b]=s.split('.');const iv=Uint8Array.from(atob(a),x=>x.charCodeAt(0));const ct=Uint8Array.from(atob(b),x=>x.charCodeAt(0));return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv},await cryptoKey(e),ct));}
type DriveConnection={refresh_token_enc:string;access_token_enc:string|null;expires_at:number;folder_id:string|null};
async function connected(e:DriveEnv,user:string){return e.DB.prepare('SELECT refresh_token_enc, access_token_enc, expires_at, folder_id FROM google_drive_connections WHERE user_id=?').bind(user).first<DriveConnection>();}
async function token(e:DriveEnv,user:string){const c=await connected(e,user);if(!c)throw Error('Conecte seu Google Drive primeiro');if(c.access_token_enc&&c.expires_at>Date.now()+90_000)return unseal(e,c.access_token_enc);
 const params=new URLSearchParams({client_id:e.GOOGLE_CLIENT_ID!,client_secret:e.GOOGLE_CLIENT_SECRET!,refresh_token:await unseal(e,c.refresh_token_enc),grant_type:'refresh_token'});
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:params});
 if(!r.ok)throw Error('A autorização Google expirou ou foi revogada. Desconecte e conecte novamente.');
 const x=await r.json() as {access_token?:string;expires_in?:number};if(!x.access_token)throw Error('Google não retornou token');
 await e.DB.prepare('UPDATE google_drive_connections SET access_token_enc=?,expires_at=? WHERE user_id=?').bind(await seal(e,x.access_token),Date.now()+(x.expires_in||3600)*1000,user).run();return x.access_token;
}
async function drive(e:DriveEnv,user:string,path:string,opts:RequestInit={}){const tk=await token(e,user);const h=new Headers(opts.headers||{});h.set('authorization','Bearer '+tk);return fetch('https://www.googleapis.com/drive/v3/'+path,{...opts,headers:h});}
async function folder(e:DriveEnv,user:string){
 const c=await connected(e,user);if(!c)throw Error('Drive desconectado');
 if(c.folder_id){
  const check=await drive(e,user,'files/'+encodeURIComponent(c.folder_id)+'?fields=id,mimeType,trashed');
  if(check.ok){const meta=await check.json() as {id?:string;mimeType?:string;trashed?:boolean};if(meta.id===c.folder_id&&meta.mimeType==='application/vnd.google-apps.folder'&&!meta.trashed)return c.folder_id;}
 }
 const q=new URLSearchParams({q:"name = 'HYRON' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",fields:'nextPageToken,files(id,name,mimeType,parents)',pageSize:'100'});
 const lookup=await drive(e,user,'files?'+q.toString());
 if(!lookup.ok)throw Error('Nao foi possivel procurar pasta HYRON no Google Drive (HTTP '+lookup.status+'). Nao criei uma duplicata.');
 const found=await lookup.json() as {files?:{id:string;name:string}[]};
 const existing=found.files?.find(f=>f.name==='HYRON'&&fileId(f.id));
 if(existing){await e.DB.prepare('UPDATE google_drive_connections SET folder_id=? WHERE user_id=?').bind(existing.id,user).run();return existing.id;}
 const r=await drive(e,user,'files?fields=id',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'HYRON',mimeType:'application/vnd.google-apps.folder'})});
 if(!r.ok)throw Error('Nao foi possivel criar a pasta HYRON no Drive (HTTP '+r.status+')');
 const data=await r.json() as {id:string};if(!fileId(data.id))throw Error('Google nao retornou um ID de pasta valido');
 await e.DB.prepare('UPDATE google_drive_connections SET folder_id=? WHERE user_id=?').bind(data.id,user).run();return data.id;
}
async function within(e:DriveEnv,user:string,id:string){const c=await connected(e,user);if(!c?.folder_id)return false;const r=await drive(e,user,'files/'+encodeURIComponent(id)+'?fields=id,parents,name,mimeType&supportsAllDrives=false');if(!r.ok)return false;const f=await r.json() as {parents?:string[]};return !!f.parents?.includes(c.folder_id);}
const fileId=(id:string)=>/^[A-Za-z0-9_-]{8,180}$/.test(id);
async function form(req:Request){if(Number(req.headers.get('content-length')||0)>4000)throw Error('Requisição muito grande');return req.json() as Promise<Record<string,unknown>>;}
const redirect=(path:string,headers:Record<string,string>={})=>new Response(null,{status:303,headers:{location:path,'cache-control':'no-store',...headers}});
const stateCookie=(s:string,seconds:number)=>`hyron_drive_oauth=${s}; Path=/api/drive/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
export async function googleDriveRoute(req:Request,e:DriveEnv,u:UserId|null,path:string):Promise<Response|undefined>{
 if(!path.startsWith('/api/drive/'))return undefined;
 if(!credentials(e))return err('Google Drive indisponível: configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_DRIVE_TOKEN_KEY.',503);
 if(path!=='/api/drive/callback'&&!u)return err('Faça login no HYRON',401);
 if(path==='/api/drive/status'&&req.method==='GET')return j({connected:!!(await connected(e,u!.id))});
 if(path==='/api/drive/connect'&&req.method==='GET'){
  const state=rnd(), verifier=rnd();const challenge=b64url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));
  await e.DB.prepare('DELETE FROM google_drive_oauth WHERE expires_at<?').bind(Date.now()).run();
  await e.DB.prepare('INSERT INTO google_drive_oauth(state_hash,user_id,code_verifier,expires_at) VALUES(?,?,?,?)').bind(await sha(state),u!.id,verifier,Date.now()+10*60_000).run();
  const p=new URLSearchParams({client_id:e.GOOGLE_CLIENT_ID!,redirect_uri:CALLBACK,response_type:'code',scope:'https://www.googleapis.com/auth/drive.file',access_type:'offline',prompt:'consent',state,code_challenge:challenge,code_challenge_method:'S256'});
  return redirect('https://accounts.google.com/o/oauth2/v2/auth?'+p.toString(),{'set-cookie':stateCookie(state,600)});
 }
 if(path==='/api/drive/callback'&&req.method==='GET'){
  const query=new URL(req.url).searchParams;const state=query.get('state')||'',code=query.get('code')||'';
  if(!state||!code||state.length>200)return err('Google não autorizou a conexão',400);
  const cookie=req.headers.get('cookie')?.match(/(?:^|;\s*)hyron_drive_oauth=([^;]+)/)?.[1]||'';
  if(!cookie||cookie!==state)return err('O navegador não confirmou a sessão OAuth',403);
  const hs=await sha(state);const p=await e.DB.prepare('SELECT user_id,code_verifier FROM google_drive_oauth WHERE state_hash=? AND expires_at>?').bind(hs,Date.now()).first<{user_id:string;code_verifier:string}>();
  if(!p)return err('Estado OAuth inválido ou expirado',403);
  await e.DB.prepare('DELETE FROM google_drive_oauth WHERE state_hash=?').bind(hs).run();
  const body=new URLSearchParams({code,client_id:e.GOOGLE_CLIENT_ID!,client_secret:e.GOOGLE_CLIENT_SECRET!,redirect_uri:CALLBACK,grant_type:'authorization_code',code_verifier:p.code_verifier});
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body});
  if(!r.ok)return err('Google recusou a autorização: HTTP '+r.status,400);
  const tokens=await r.json() as {access_token?:string;refresh_token?:string;expires_in?:number};
  if(!tokens.refresh_token||!tokens.access_token)return err('Google não forneceu acesso offline. Revogue o app na conta Google e conecte novamente.',400);
  await e.DB.prepare(`INSERT INTO google_drive_connections(user_id,refresh_token_enc,access_token_enc,expires_at,folder_id) VALUES(?,?,?,?,NULL)
   ON CONFLICT(user_id) DO UPDATE SET refresh_token_enc=excluded.refresh_token_enc,access_token_enc=excluded.access_token_enc,expires_at=excluded.expires_at,folder_id=NULL`).bind(p.user_id,await seal(e,tokens.refresh_token),await seal(e,tokens.access_token),Date.now()+(tokens.expires_in||3600)*1000).run();
  return redirect('/?drive=connected',{'set-cookie':stateCookie('',0)});
 }
 if(path==='/api/drive/disconnect'&&req.method==='POST'){
  const c=await connected(e,u!.id);if(c){const t=await unseal(e,c.refresh_token_enc);await fetch('https://oauth2.googleapis.com/revoke?token='+encodeURIComponent(t),{method:'POST'}).catch(()=>{});}
  await e.DB.prepare('DELETE FROM google_drive_uploads WHERE user_id=?').bind(u!.id).run();await e.DB.prepare('DELETE FROM google_drive_connections WHERE user_id=?').bind(u!.id).run();return j({ok:true});
 }
 if(path==='/api/drive/files'&&req.method==='GET'){
  const c=await connected(e,u!.id);if(!c)return err('Drive não conectado',409);if(!c.folder_id)return j({files:[]});
  const q=new URLSearchParams({q:"'"+c.folder_id+"' in parents and trashed = false",fields:'nextPageToken,files(id,name,size,mimeType,createdTime)',pageSize:'100',orderBy:'createdTime desc'});
  const r=await drive(e,u!.id,'files?'+q.toString());if(!r.ok)return err('Google Drive HTTP '+r.status,502);const d=await r.json() as {files?:unknown[]};return j({files:d.files||[]});
 }
 if(path==='/api/drive/upload/start'&&req.method==='POST'){
  const b=await form(req);const name=b.name,size=b.size,mime=b.mime;
  if(typeof name!=='string'||!name.trim()||name.length>180||/[\x00-\x1f\\/]/.test(name)||typeof size!=='number'||!Number.isInteger(size)||size<1||size>SIZE||typeof mime!=='string'||mime.length>100||!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(mime))return err('Arquivo inválido ou maior que 100 MB');
  const parent=await folder(e,u!.id);const tk=await token(e,u!.id);
  const r=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size',{method:'POST',headers:{authorization:'Bearer '+tk,'content-type':'application/json; charset=UTF-8','x-upload-content-type':mime,'x-upload-content-length':String(size)},body:JSON.stringify({name,parents:[parent],mimeType:mime})});
  const url=r.headers.get('location');if(!r.ok||!url)return err('Não foi possível iniciar envio Google Drive: HTTP '+r.status,502);
  const parsed=new URL(url);if(parsed.protocol!=='https:'||!['www.googleapis.com','content.googleapis.com'].includes(parsed.hostname)||!parsed.pathname.startsWith('/upload/'))return err('Sessão Google inválida',502);
  const id=crypto.randomUUID();await e.DB.prepare('INSERT INTO google_drive_uploads(id,user_id,session_url,size,uploaded,expires_at) VALUES(?,?,?,?,0,?)').bind(id,u!.id,url,size,Date.now()+3600_000).run();
  return j({id,partSize:CHUNK});
 }
 const part=/^\/api\/drive\/upload\/([0-9a-f-]{36})\/part$/i.exec(path);
 if(part&&req.method==='PUT'){
  const row=await e.DB.prepare('SELECT session_url,size,uploaded FROM google_drive_uploads WHERE id=? AND user_id=? AND expires_at>?').bind(part[1],u!.id,Date.now()).first<{session_url:string;size:number;uploaded:number}>();if(!row)return err('Sessão de upload expirada',404);
  const length=Number(req.headers.get('content-length'));if(!Number.isInteger(length)||length<1||length>CHUNK||row.uploaded+length>row.size||(row.uploaded+length<row.size&&length%(256*1024)!==0))return err('Bloco inválido',400);
  const raw=await req.arrayBuffer();if(raw.byteLength!==length)return err('Tamanho do bloco incorreto');
  const url=new URL(row.session_url);if(url.protocol!=='https:'||!['www.googleapis.com','content.googleapis.com'].includes(url.hostname)||!url.pathname.startsWith('/upload/'))return err('Sessão inválida',400);
  const tk=await token(e,u!.id);const r=await fetch(url.toString(),{method:'PUT',redirect:'manual',headers:{authorization:'Bearer '+tk,'content-range':`bytes ${row.uploaded}-${row.uploaded+length-1}/${row.size}`,'content-length':String(length)},body:raw});
  if(r.status===308){const range=r.headers.get('range');const next=range?Number(range.match(/-(\d+)$/)?.[1])+1:0;if(next!==row.uploaded+length)return err('Google recebeu tamanho inesperado. Reenvie com nova sessão.',502);
   await e.DB.prepare('UPDATE google_drive_uploads SET uploaded=? WHERE id=? AND user_id=?').bind(next,part[1],u!.id).run();return j({done:false,uploaded:next});}
  if(r.ok){const file=await r.json() as {id?:string};await e.DB.prepare('DELETE FROM google_drive_uploads WHERE id=? AND user_id=?').bind(part[1],u!.id).run();return j({done:true,id:file.id});}
  return err('Upload Google falhou: HTTP '+r.status,502);
 }

 if(path==='/api/drive/images/resolve'&&req.method==='GET'){
  const name=new URL(req.url).searchParams.get('name')||'';
  if(!name||name.length>180||! /\.(png|jpe?g|webp)$/i.test(name))return err('Nome de imagem inválido');
  const c=await connected(e,u!.id);if(!c)return err('Drive não conectado',409);
  if(!c.folder_id)return j({files:[]});
  const escape=(s:string)=>Array.from(s,ch=>[39,92].includes(ch.charCodeAt(0))?String.fromCharCode(92)+ch:ch).join('');
  const query=new URLSearchParams({q:"'"+escape(c.folder_id)+"' in parents and trashed = false and name = '"+escape(name)+"'",fields:'files(id,name,mimeType,size)',pageSize:'2'});
  const r=await drive(e,u!.id,'files?'+query.toString(),{redirect:'manual'});
  if(!r.ok)return err('Não foi possível localizar a imagem',502);
  return j(await r.json());
 }
 const file=/^\/api\/drive\/files\/([A-Za-z0-9_-]{8,180})(?:\/(download|preview|metadata))?$/.exec(path);
 if(file&&fileId(file[1])){
  if(!await within(e,u!.id,file[1]))return err('Arquivo não encontrado na pasta HYRON',404);
  if(req.method==='GET'&&file[2]==='metadata'){const r=await drive(e,u!.id,'files/'+encodeURIComponent(file[1])+'?fields=id,name,mimeType,size',{redirect:'manual'});if(!r.ok)return err('Arquivo indisponível',404);return j(await r.json());}
  if(req.method==='DELETE'&&!file[2]){const r=await drive(e,u!.id,'files/'+encodeURIComponent(file[1]),{method:'DELETE'});return r.ok?j({ok:true}):err('Erro Google HTTP '+r.status,502);}
  // HYRON_PREVIEW_V066: previsualizacao em blocos, autenticada e limitada.
  if(req.method==='GET'&&file[2]==='preview'){
   const metadata=await drive(e,u!.id,'files/'+encodeURIComponent(file[1])+'?fields=name,mimeType,size');
   if(!metadata.ok)return err('Metadados Google HTTP '+metadata.status,502);
   const f=await metadata.json() as {name?:string;mimeType?:string;size?:string};
   const extension=(f.name||'').toLowerCase().split('.').pop()||'';
   const imgType:Record<string,string>={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',svg:'image/svg+xml'};
   const allowedText=new Set(['txt','md','markdown','html','htm','css','js','mjs','cjs','jsx','ts','tsx','py','php','java','cs','c','h','cpp','hpp','go','rs','rb','sh','bat','ps1','sql','json','jsonc','xml','yaml','yml','toml','ini','cfg','env','csv','tsv','log','svg','vue','svelte','gradle','gitignore']);
   const mime=imgType[extension]||(allowedText.has(extension)?'text/plain; charset=utf-8':'');
   if(!mime)return err('Prévia não disponível para este formato',415);
   const limit=imgType[extension]?8*1024*1024:96*1024;
   if(imgType[extension]&&Number(f.size||0)>limit)return err('Imagem acima de 8 MiB: faça download',413);
   const result=await drive(e,u!.id,'files/'+encodeURIComponent(file[1])+'?alt=media',{redirect:'manual',headers:{Range:'bytes=0-'+(limit-1)}});
   if(!result.ok)return err('Prévia Google HTTP '+result.status,502);
   const reader=result.body?.getReader();if(!reader)return err('Arquivo vazio',502);
   let count=0;const chunks:Uint8Array[]=[];
   try{while(count<limit){const {done,value}=await reader.read();if(done)break;if(value){const chunk=value.slice(0,limit-count);chunks.push(chunk);count+=chunk.byteLength;}}}
   finally{await reader.cancel().catch(()=>{});}
   const bytes=new Uint8Array(count);let pos=0;for(const chunk of chunks){bytes.set(chunk,pos);pos+=chunk.length;}
   return new Response(bytes,{headers:{'content-type':mime,'cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox",'x-hyron-preview-truncated':String(Number(f.size||0)>limit)}});
  }
  if(req.method==='GET'&&file[2]==='download'){
   const metadata=await drive(e,u!.id,'files/'+encodeURIComponent(file[1])+'?fields=name,mimeType');const f=await metadata.json() as {name?:string;mimeType?:string};
   const r=await drive(e,u!.id,'files/'+encodeURIComponent(file[1])+'?alt=media');if(!r.ok)return err('Google Drive HTTP '+r.status,502);
   const out=new Headers({'content-type':f.mimeType||'application/octet-stream','cache-control':'private, no-store','x-content-type-options':'nosniff'});
   const name=(f.name||'arquivo').replace(/[\r\n"\\]/g,'_');out.set('content-disposition','attachment; filename="'+name+'"');return new Response(r.body,{status:200,headers:out});
  }
 }
 return err('Rota Drive não encontrada',404);
}
