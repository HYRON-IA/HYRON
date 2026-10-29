import {mencionadosNoTexto,convocouCAPS,INTERNOS_IDS,INTERNO_USERS,type InternoResponder} from './hyron-internos-runtime';
// HYRON 0.8.3 - Ala Coletiva, grupos e midias.
import {googleDriveRoute} from './google-drive';
import { readSurtoConfig, claimSurtoOpportunity, runSurtoDebate, validateSurtoPatch } from './hyron-surto';
type GroupUser={id:string;username:string;role:'admin'|'user'};
type GroupEnv={DB:D1Database;GOOGLE_CLIENT_ID?:string;GOOGLE_CLIENT_SECRET?:string;GOOGLE_DRIVE_TOKEN_KEY?:string};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const error=(msg:string,status=400)=>json({error:msg},status);
const validId=(id:string)=>/^[a-f0-9-]{36}$/i.test(id);
const driveId=(id:unknown):id is string=>typeof id==='string'&&/^[A-Za-z0-9_-]{8,180}$/.test(id);
const inlineMime=(m:string)=>/^(image\/(png|jpeg|webp|gif)|audio\/(webm|ogg|mp4|mpeg|wav|x-wav)|video\/(webm|mp4|quicktime))$/i.test(m);
async function groupOwnerDrive(env:GroupEnv,owner:string,id:string,action:'metadata'|'download'){
 const path='/api/drive/files/'+encodeURIComponent(id)+'/'+action;
 return googleDriveRoute(new Request('https://hyron.internal'+path),env,{id:owner},path);
}

async function payload(request:Request):Promise<Record<string,unknown>>{
 if(Number(request.headers.get('content-length')||0)>150000)throw Error('Dados muito grandes');
 const raw=await request.text();if(raw.length>150000)throw Error('Dados muito grandes');
 const b=JSON.parse(raw);if(!b||typeof b!=='object'||Array.isArray(b))throw Error('JSON invalido');return b;
}
function imageData(value:unknown):string|null{
 if(value===null||value===undefined||value==='')return null;
 if(typeof value!=='string'||value.length>130025||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))throw Error('Imagem JPEG invalida');
 const b64=value.slice(23);if(b64.length*3/4>96000)throw Error('Imagem ultrapassa 96 KB');
 if(!atob(b64.slice(0,40)).startsWith('\xFF\xD8\xFF'))throw Error('Assinatura JPEG invalida');return b64;
}
export async function groupRoomRoute(req:Request,env:GroupEnv,user:GroupUser,path:string,respond?:InternoResponder):Promise<Response|null>{
 if(!path.startsWith('/api/groups'))return null;
 try{
 if(path==='/api/groups'&&req.method==='GET'){
  const groups=(await env.DB.prepare(`SELECT g.id,g.name,g.description,g.created_at AS createdAt,
    (SELECT COUNT(*) FROM hyron_group_members x WHERE x.group_id=g.id) AS memberCount,
    gm.role AS myRole FROM hyron_groups g JOIN hyron_group_members gm ON gm.group_id=g.id
    WHERE gm.user_id=? ORDER BY g.created_at DESC LIMIT 200`).bind(user.id).all()).results;
  return json({groups,canCreate:user.role==='admin'});
 }
 if(path==='/api/groups'&&req.method==='POST'){
  if(user.role!=='admin')return error('Somente administradores do HYRON podem criar grupos',403);
  const b=await payload(req);const name=typeof b.name==='string'?b.name.trim():'';
  const description=typeof b.description==='string'?b.description.trim():'';
  if(name.length<3||name.length>64||description.length>500)return error('Nome ou descricao invalido');
  const raw=Array.isArray(b.members)?b.members:[];
  if(raw.length>100||!raw.every(v=>typeof v==='string'&&validId(v)))return error('Participantes invalidos');
  const members=[...new Set([user.id,...raw])];
  if(members.length>101)return error('Limite de integrantes ultrapassado');
  const valid=(await env.DB.prepare(`SELECT id FROM users WHERE disabled=0 AND id IN (${members.map(()=>'?').join(',')})`).bind(...members).all<{id:string}>()).results;
  if(valid.length!==members.length)return error('Um ou mais usuarios estao indisponiveis',409);
  const img=imageData(b.image);const id=crypto.randomUUID();
  await env.DB.batch([
   env.DB.prepare('INSERT INTO hyron_groups(id,name,description,created_by,jpeg_base64) VALUES(?,?,?,?,?)').bind(id,name,description,user.id,img),
   ...members.map(mid=>env.DB.prepare('INSERT INTO hyron_group_members(group_id,user_id,role) VALUES(?,?,?)').bind(id,mid,mid===user.id?'admin':'member'))
  ]);
  return json({ok:true,id},201);
 }
 // HYRON 0.8.5: configuracao da intervencao por grupo (administrador).
 const surtoPath=/^\/api\/groups\/([0-9a-f-]{36})\/surto$/.exec(path);
 if(surtoPath&&(req.method==='GET'||req.method==='PATCH')){
  const groupId=surtoPath[1];
  const membership=await env.DB.prepare('SELECT role FROM hyron_group_members WHERE group_id=? AND user_id=?').bind(groupId,user.id).first<{role:string}>();
  if(!membership)return error('Grupo nao encontrado',404);
  if(req.method==='GET')return json({settings:await readSurtoConfig(env.DB,groupId),canEdit:user.role==='admin'||membership.role==='admin'});
  if(user.role!=='admin'&&membership.role!=='admin')return error('Permissao insuficiente',403);
  const patch=validateSurtoPatch(await payload(req));
  if(!patch)return error('Configuracao invalida (enabled boolean, interval 1..100, maxReplies 1..8, chance 0..100)');
  await env.DB.prepare(`INSERT INTO hyron_surto_settings(group_id,enabled,interval_n,max_replies,chance_percent)
     VALUES(?,?,?,?,?) ON CONFLICT(group_id) DO UPDATE SET enabled=excluded.enabled,interval_n=excluded.interval_n,max_replies=excluded.max_replies,chance_percent=excluded.chance_percent`)
    .bind(groupId,patch.enabled?1:0,patch.interval,patch.maxReplies,patch.chance).run();
  return json({ok:true,settings:await readSurtoConfig(env.DB,groupId)});
 }
 // HYRON_083_GROUP_MEDIA: security checks before download, no public Drive links.
 const mediaMatch=/^\/api\/groups\/media\/([1-9]\d{0,12})$/.exec(path);
 if(mediaMatch&&req.method==='GET'){
  const file=await env.DB.prepare(`SELECT a.id,a.group_id AS groupId,a.sender_id AS owner,a.file_id AS fileId,a.name,a.mime,a.size
   FROM hyron_group_attachments a JOIN hyron_group_members m ON m.group_id=a.group_id
   WHERE a.id=? AND m.user_id=?`).bind(Number(mediaMatch[1]),user.id).first<{groupId:string;owner:string;fileId:string;name:string;mime:string;size:number}>();
  if(!file)return error('Arquivo nao encontrado',404);
  const upstream=await groupOwnerDrive(env,file.owner,file.fileId,'download');
  if(!upstream?.ok)return error('Arquivo indisponivel no Drive de origem',404);
  const u=new URL(req.url);const inline=inlineMime(file.mime)&&!u.searchParams.has('download');
  const headers=new Headers({'content-type':inlineMime(file.mime)?file.mime:'application/octet-stream','cache-control':'private,no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox"});
  headers.set('content-disposition',(inline?'inline':'attachment')+'; filename="'+file.name.replace(/[\r\n"\\]/g,'_')+'"');
  return new Response(upstream.body,{status:200,headers});
 }
 // HYRON_083_GROUP_CHAT_PHASE2 - membership required for reads and writes.
  // HYRON_EDIT_DELETE_V2: remover ou editar mensagem do proprio autor dentro do grupo.
 const manageMessage=/^\/api\/groups\/([0-9a-f-]{36})\/messages\/([0-9a-f-]{36})$/.exec(path);
 if(manageMessage&&(req.method==='DELETE'||req.method==='PATCH')){
  const [_,gid,mid]=manageMessage;
  const member=await env.DB.prepare('SELECT 1 FROM hyron_group_members WHERE group_id=? AND user_id=?').bind(gid,user.id).first();
  if(!member)return error('Grupo nao encontrado',404);
  const item=await env.DB.prepare('SELECT sender_id AS senderId FROM hyron_group_messages WHERE group_id=? AND id=?').bind(gid,mid).first<{senderId:string}>();
  if(!item)return error('Mensagem nao encontrada',404);
  if(item.senderId!==user.id)return error('Somente o autor pode modificar esta mensagem',403);
  if(req.method==='DELETE'){
   await env.DB.batch([
    env.DB.prepare('DELETE FROM hyron_group_attachments WHERE group_id=? AND message_id=?').bind(gid,mid),
    env.DB.prepare('DELETE FROM hyron_group_messages WHERE group_id=? AND id=? AND sender_id=?').bind(gid,mid,user.id)
   ]);
   return json({ok:true});
  }
  const b=await payload(req);const content=typeof b.content==='string'?b.content.trim():'';
  if(!content||content.length>4000)return error('Texto invalido para edicao');
  const attachment=await env.DB.prepare('SELECT 1 AS found FROM hyron_group_attachments WHERE group_id=? AND message_id=? LIMIT 1').bind(gid,mid).first<{found:number}>();
  if(attachment)return error('Edicao disponivel apenas para mensagens sem anexo',409);
  await env.DB.prepare("UPDATE hyron_group_messages SET content=?, edited_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE group_id=? AND id=? AND sender_id=?").bind(content,gid,mid,user.id).run();
  return json({ok:true});
 }
 // HYRON_083_GROUP_CHAT_PHASE2 - membership required for reads and writes.
 const messagesPath=/^\/api\/groups\/([0-9a-f-]{36})\/messages$/.exec(path);
 if(messagesPath&&(req.method==='GET'||req.method==='POST')){
  const id=messagesPath[1];
  const member=await env.DB.prepare('SELECT 1 AS ok FROM hyron_group_members WHERE group_id=? AND user_id=?').bind(id,user.id).first();
  if(!member)return error('Grupo nao encontrado',404);
  if(req.method==='GET'){
   const u=new URL(req.url);const before=u.searchParams.get('before');
   if(before&&(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z$/.test(before)||before.length>35))return error('Cursor invalido');
   const query=`SELECT m.id,m.sender_id AS senderId,u.username AS senderName,m.content,m.created_at AS createdAt,m.edited_at AS editedAt
    FROM hyron_group_messages m JOIN users u ON u.id=m.sender_id
    WHERE m.group_id=? ${before?'AND m.created_at < ?':''}
    ORDER BY m.created_at DESC,m.id DESC LIMIT 51`;
   const rows=(await (before?env.DB.prepare(query).bind(id,before):env.DB.prepare(query).bind(id)).all()).results;
   const more=rows.length>50;const page=rows.slice(0,50);
   const items=page.reverse();
   const ids=items.map((m:Record<string,unknown>)=>String(m.id));
   const files=ids.length?(await env.DB.prepare(`SELECT id,message_id AS messageId,name,mime,size FROM hyron_group_attachments WHERE message_id IN (${ids.map(()=>'?').join(',')})`).bind(...ids).all()).results:[];
   return json({messages:items.map((m:Record<string,unknown>)=>({...m,attachments:files.filter((a:Record<string,unknown>)=>a.messageId===m.id).map((a:Record<string,unknown>)=>({id:a.id,name:a.name,mime:a.mime,size:a.size}))})),nextBefore:more?page[0]?.createdAt:null});
  }
  const body=await payload(req);const content=typeof body.content==='string'?body.content.trim():'';
  const files=Array.isArray(body.files)?body.files:[];
  if(content.length>4000||files.length>1||(!content&&!files.length))return error('Envie texto de ate 4000 caracteres ou um anexo por mensagem');
  let attachment:{id:string;name:string;mime:string;size:number}|null=null;
  if(files.length){
   const fid=(files[0] as {id?:unknown})?.id;if(!driveId(fid))return error('Identificador de arquivo invalido');
   const verified=await groupOwnerDrive(env,user.id,fid,'metadata');
   if(!verified?.ok)return error('Arquivo nao pertence ao Drive do remetente',403);
   const meta=await verified.json() as {id?:string;name?:string;mimeType?:string;size?:string};
   const size=Number(meta.size);
   if(meta.id!==fid||!meta.name||meta.name.length>180||!Number.isInteger(size)||size<1||size>100*1024*1024)return error('Metadados de arquivo invalidos');
   attachment={id:fid,name:meta.name,mime:(meta.mimeType||'application/octet-stream').slice(0,100),size};
  }
  const recent=await env.DB.prepare("SELECT count(*) AS n FROM hyron_group_messages WHERE group_id=? AND sender_id=? AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-60 seconds')").bind(id,user.id).first<{n:number}>();
  if((recent?.n||0)>=20)return error('Limite temporario de mensagens atingido',429);
  const idMessage=crypto.randomUUID();const text=content||('📎 '+attachment!.name);
  const inserts=[env.DB.prepare('INSERT INTO hyron_group_messages(id,group_id,sender_id,content) VALUES(?,?,?,?)').bind(idMessage,id,user.id,text)];
  if(attachment)inserts.push(env.DB.prepare('INSERT INTO hyron_group_attachments(message_id,group_id,sender_id,file_id,name,mime,size) VALUES(?,?,?,?,?,?,?)').bind(idMessage,id,user.id,attachment.id,attachment.name,attachment.mime,attachment.size));
  await env.DB.batch(inserts);
   const caps=content?convocouCAPS(content):false;
   const mentioned=content?mencionadosNoTexto(content):[];
   const bots=caps?[...INTERNOS_IDS]:(mentioned.length===1?[mentioned[0]]:[]);
   if(respond&&!attachment){
    // O modo espontaneo nao substitui as convocacoes explicitas existentes.
    try{
     const rows=(await env.DB.prepare('SELECT sender_id AS senderId,content FROM hyron_group_messages WHERE group_id=? AND id<>? ORDER BY created_at DESC,id DESC LIMIT 60').bind(id,idMessage).all<{senderId:string;content:string}>()).results;
     const history=rows.reverse().map(m=>({role:(Object.values(INTERNO_USERS).includes(m.senderId)?'assistant':'user') as string,content:m.content,senderId:m.senderId}));
     history.push({role:'user',content,senderId:user.id});
     const emitted:string[]=[];
     if(bots.length){
      for(const bot of bots){
       const answer=await respond(bot,history);
       if(!answer||emitted.some(prior=>prior.trim().toLowerCase()===answer.trim().toLowerCase()))continue;
       emitted.push(answer);
       await env.DB.prepare('INSERT INTO hyron_group_messages(id,group_id,sender_id,content) VALUES(?,?,?,?)').bind(crypto.randomUUID(),id,INTERNO_USERS[bot],answer).run();
       if(!caps)history.push({role:'assistant',content:answer,senderId:INTERNO_USERS[bot]});
      }
     }else if(!mentioned.length){
      const settings=await readSurtoConfig(env.DB,id);
      if(settings.enabled){
       const claim=await claimSurtoOpportunity(env.DB,id,settings.interval);
       if(claim&&Math.random()*100<settings.chance){
        await runSurtoDebate(history,settings.maxReplies,respond,async(bot,answer)=>{
         await env.DB.prepare('INSERT INTO hyron_group_messages(id,group_id,sender_id,content) VALUES(?,?,?,?)')
          .bind(crypto.randomUUID(),id,INTERNO_USERS[bot],answer).run();
        });
       }
      }
     }
    }catch(e){console.error('HYRON CAPS/surto indisponivel',e);}
   }
  return json({ok:true,id:idMessage},201);
 }
 const imgPath=/^\/api\/groups\/([0-9a-f-]{36})\/avatar$/.exec(path);
 if(imgPath&&req.method==='GET'){
  const g=await env.DB.prepare(`SELECT g.jpeg_base64 FROM hyron_groups g JOIN hyron_group_members m ON m.group_id=g.id WHERE g.id=? AND m.user_id=?`).bind(imgPath[1],user.id).first<{jpeg_base64:string|null}>();
  if(!g||!g.jpeg_base64)return new Response(null,{status:404,headers:{'cache-control':'no-store'}});
  const bytes=Uint8Array.from(atob(g.jpeg_base64),x=>x.charCodeAt(0));return new Response(bytes,{headers:{'content-type':'image/jpeg','cache-control':'private,max-age=30','x-content-type-options':'nosniff'}});
 }
 const detail=/^\/api\/groups\/([0-9a-f-]{36})$/.exec(path);
 if(detail){
  const id=detail[1];const membership=await env.DB.prepare('SELECT role FROM hyron_group_members WHERE group_id=? AND user_id=?').bind(id,user.id).first<{role:string}>();
  if(!membership)return error('Grupo nao encontrado',404);
  if(req.method==='DELETE'){
   if(membership.role!=='admin')return error('Somente administrador do grupo pode exclui-lo',403);
   await env.DB.batch([
    env.DB.prepare('DELETE FROM hyron_group_attachments WHERE group_id=?').bind(id),
    env.DB.prepare('DELETE FROM hyron_group_messages WHERE group_id=?').bind(id),
    env.DB.prepare('DELETE FROM hyron_group_members WHERE group_id=?').bind(id),
    env.DB.prepare('DELETE FROM hyron_groups WHERE id=?').bind(id)
   ]);
   return json({ok:true});
  }
  if(req.method==='GET'){
   const group=await env.DB.prepare('SELECT id,name,description,created_at AS createdAt FROM hyron_groups WHERE id=?').bind(id).first();
   const members=(await env.DB.prepare('SELECT u.id,u.username,m.role FROM hyron_group_members m JOIN users u ON u.id=m.user_id WHERE m.group_id=? ORDER BY m.role DESC,u.username').bind(id).all()).results;
   return json({group,members,myRole:membership.role});
  }
  if(req.method==='PATCH'){
   if(membership.role!=='admin')return error('Sem permissao',403);
   const b=await payload(req);const name=typeof b.name==='string'?b.name.trim():'';
   const description=typeof b.description==='string'?b.description.trim():'';
   if(name.length<3||name.length>64||description.length>500)return error('Dados invalidos');
   const image=b.image===undefined?undefined:imageData(b.image);
   if(image===undefined)await env.DB.prepare('UPDATE hyron_groups SET name=?,description=? WHERE id=?').bind(name,description,id).run();
   else await env.DB.prepare('UPDATE hyron_groups SET name=?,description=?,jpeg_base64=? WHERE id=?').bind(name,description,image,id).run();
   return json({ok:true});
  }
 }
 const memberPath=/^\/api\/groups\/([0-9a-f-]{36})\/members$/.exec(path);
 if(memberPath&&req.method==='POST'){
  const id=memberPath[1];const own=await env.DB.prepare('SELECT role FROM hyron_group_members WHERE group_id=? AND user_id=?').bind(id,user.id).first<{role:string}>();
  if(!own||(own.role!=='admin'))return error('Sem permissao',403);
  const b=await payload(req);if(typeof b.userId!=='string'||!validId(b.userId))return error('Usuario invalido');
  const target=await env.DB.prepare('SELECT id FROM users WHERE id=? AND disabled=0').bind(b.userId).first();if(!target)return error('Usuario indisponivel',404);
  const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM hyron_group_members WHERE group_id=?').bind(id).first<{n:number}>();if((count?.n||0)>=101)return error('Grupo cheio',409);
  await env.DB.prepare("INSERT OR IGNORE INTO hyron_group_members(group_id,user_id,role) VALUES(?,?,'member')").bind(id,b.userId).run();return json({ok:true});
 }
 // HYRON_083_FASE2_ROLE_GUARD: only a current group administrator may modify roles.
 if(memberPath&&req.method==='PATCH'){
  const id=memberPath[1];
  const own=await env.DB.prepare('SELECT role FROM hyron_group_members WHERE group_id=? AND user_id=?').bind(id,user.id).first<{role:string}>();
  if(!own)return error('Grupo nao encontrado',404);
  if(own.role!=='admin')return error('Somente administradores do grupo podem alterar cargos',403);
  const b=await payload(req);
  if(typeof b.userId!=='string'||!validId(b.userId)||!['admin','member'].includes(String(b.role)))return error('Participante ou cargo invalido');
  const nextRole=b.role as 'admin'|'member';
  const target=await env.DB.prepare('SELECT role FROM hyron_group_members WHERE group_id=? AND user_id=?').bind(id,b.userId).first<{role:string}>();
  if(!target)return error('Participante nao encontrado',404);
  if(target.role===nextRole)return json({ok:true,unchanged:true});
  // Do not allow a request to remove the last admin, even with parallel updates.
  const sql=nextRole==='admin'
   ? "UPDATE hyron_group_members SET role='admin' WHERE group_id=? AND user_id=? AND role='member'"
   : "UPDATE hyron_group_members SET role='member' WHERE group_id=? AND user_id=? AND role='admin' AND (SELECT COUNT(*) FROM hyron_group_members WHERE group_id=? AND role='admin')>1";
  const args=nextRole==='admin'?[id,b.userId]:[id,b.userId,id];
  const changed=await env.DB.prepare(sql).bind(...args).run();
  if(!changed.meta.changes)return error('O grupo precisa manter pelo menos um administrador',409);
  return json({ok:true});
 }
 if(memberPath&&req.method==='DELETE'){
  const id=memberPath[1];const b=await payload(req);if(typeof b.userId!=='string'||!validId(b.userId))return error('Usuario invalido');
  const own=await env.DB.prepare('SELECT role FROM hyron_group_members WHERE group_id=? AND user_id=?').bind(id,user.id).first<{role:string}>();
  if(!own)return error('Grupo nao encontrado',404);
  if(b.userId!==user.id&&own.role!=='admin')return error('Sem permissao',403);
  const target=await env.DB.prepare('SELECT role FROM hyron_group_members WHERE group_id=? AND user_id=?').bind(id,b.userId).first<{role:string}>();
  if(!target)return error('Participante nao encontrado',404);
  if(target.role==='admin'){
   const count=await env.DB.prepare("SELECT COUNT(*) AS n FROM hyron_group_members WHERE group_id=? AND role='admin'").bind(id).first<{n:number}>();
   if((count?.n||0)<=1)return error('Transfira a administracao antes de remover o ultimo admin',409);
  }
  const removed=await env.DB.prepare(`DELETE FROM hyron_group_members WHERE group_id=? AND user_id=? AND (role='member' OR (SELECT COUNT(*) FROM hyron_group_members WHERE group_id=? AND role='admin')>1)`).bind(id,b.userId,id).run();
  if(!removed.meta.changes)return error('Transfira a administracao antes de remover o ultimo admin',409);
  return json({ok:true});
 }
 return error('Rota nao encontrada',404);
 }catch(e){return error(e instanceof Error?e.message:'Erro interno',400)}
}
