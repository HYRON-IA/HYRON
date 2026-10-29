import {internoFromUser,mencionadosNoTexto,convocouCAPS,INTERNOS_IDS,INTERNO_USERS,type InternoResponder} from './hyron-internos-runtime';
// HYRON 0.8.2 - Linha Direta. All routes require an authenticated HYRON user.
type Person={id:string;username:string};
type DmEnv={DB:D1Database;GOOGLE_CLIENT_ID?:string;GOOGLE_CLIENT_SECRET?:string;GOOGLE_DRIVE_TOKEN_KEY?:string};
import {googleDriveRoute} from './google-drive';
const result=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const fail=(message:string,status=400)=>result({error:message},status);
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
async function readBody(req:Request){if(Number(req.headers.get('content-length')||0)>30000)throw Error('Conteudo muito grande');const raw=await req.text();if(raw.length>30000)throw Error('Conteudo muito grande');return JSON.parse(raw) as Record<string,unknown>;}
async function membership(db:D1Database,thread:string,user:string){return db.prepare('SELECT id,user_a,user_b FROM hyron_dm_threads WHERE id=? AND (user_a=? OR user_b=?)').bind(thread,user,user).first<{id:string;user_a:string;user_b:string}>();}

const mediaId=(s:unknown):s is string=>typeof s==='string'&&/^[A-Za-z0-9_-]{8,180}$/.test(s);
const safeMime=(mime:string)=>/^(image\/(png|jpeg|webp|gif|svg\+xml)|audio\/(webm|ogg|mp4|mpeg|wav|x-wav)|video\/(webm|mp4|quicktime))$/i.test(mime);
async function ownerDrive(env:DmEnv,owner:string,id:string,action:'metadata'|'download'){
 const path='/api/drive/files/'+encodeURIComponent(id)+'/'+action;
 return googleDriveRoute(new Request('https://hyron.internal'+path),env,{id:owner},path);
}
export async function privateMessageRoute(req:Request,env:DmEnv,user:Person,path:string,respond?:InternoResponder):Promise<Response|undefined>{
 if(!path.startsWith('/api/dm/'))return undefined;
 try {
  const url=new URL(req.url);
  if(path==='/api/dm/users'&&req.method==='GET'){
   const q=(url.searchParams.get('q')||'').trim().slice(0,32);
   const users=(await env.DB.prepare('SELECT id,username FROM users WHERE disabled=0 AND id<>? AND username LIKE ? COLLATE NOCASE ORDER BY username' /* HYRON_DM_AUTO_USERS_082 */).bind(user.id,'%'+q+'%').all<Person>()).results;
   return result({users});
  }
  if(path==='/api/dm/threads'&&req.method==='GET'){
   const rows=(await env.DB.prepare(`SELECT t.id,t.last_message_at,u.username AS partner,
    (SELECT COUNT(*) FROM hyron_dm_messages m WHERE m.thread_id=t.id AND m.sender_id<>? AND m.read_at IS NULL) AS unread,
    (SELECT substr(m.content,1,150) FROM hyron_dm_messages m WHERE m.thread_id=t.id ORDER BY m.id DESC LIMIT 1) AS last_text
    FROM hyron_dm_threads t JOIN users u ON u.id=CASE WHEN t.user_a=? THEN t.user_b ELSE t.user_a END
    WHERE (t.user_a=? OR t.user_b=?) AND u.disabled=0 ORDER BY t.last_message_at DESC LIMIT 100`).bind(user.id,user.id,user.id,user.id).all()).results;
   return result({threads:rows});
  }
  if(path==='/api/dm/threads'&&req.method==='POST'){
   const b=await readBody(req);
   if(typeof b.username!=='string'||!/^[A-Za-z0-9_]{3,32}$/.test(b.username))return fail('Usuario invalido');
   const other=await env.DB.prepare('SELECT id,username FROM users WHERE username=? COLLATE NOCASE AND disabled=0').bind(b.username).first<Person>();
   if(!other||other.id===user.id)return fail('Destinatario indisponivel',404);
   const [a,z]=[user.id,other.id].sort();
   await env.DB.prepare('INSERT OR IGNORE INTO hyron_dm_threads(id,user_a,user_b) VALUES(?,?,?)').bind(crypto.randomUUID(),a,z).run();
   const row=await env.DB.prepare('SELECT id FROM hyron_dm_threads WHERE user_a=? AND user_b=?').bind(a,z).first<{id:string}>();
   return result({id:row!.id,partner:other.username});
  }
  // Anexos de mensagens privadas: somente participantes podem ler.
  const fileRoute=/^\/api\/dm\/media\/([1-9]\d{0,12})$/.exec(path);
  if(fileRoute&&req.method==='GET'){
   const item=await env.DB.prepare(`SELECT a.file_id AS fileId,a.sender_id AS owner,a.mime,a.name,a.size,a.thread_id AS threadId
     FROM hyron_dm_attachments a WHERE a.id=?`).bind(Number(fileRoute[1])).first<{fileId:string;owner:string;mime:string;name:string;size:number;threadId:string}>();
   if(!item||!await membership(env.DB,item.threadId,user.id))return fail('Arquivo nao encontrado',404);
   const upstream=await ownerDrive(env,item.owner,item.fileId,'download');
   if(!upstream?.ok)return fail('Arquivo nao disponivel; remetente deve manter o Drive conectado',404);
   const headers=new Headers({'cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox",'content-type':safeMime(item.mime)?item.mime:'application/octet-stream'});
   const inline=safeMime(item.mime)&&!url.searchParams.has('download');
   headers.set('content-disposition',(inline?'inline':'attachment')+'; filename="'+item.name.replace(/[\r\n"\\]/g,'_')+'"');
   return new Response(upstream.body,{status:200,headers});
  }
  const mt=/^\/api\/dm\/threads\/([0-9a-f-]{36})\/(messages|read)$/.exec(path);
  if(mt){
   const id=mt[1];if(!uuid(id))return fail('ID invalido');
   const thread=await membership(env.DB,id,user.id);if(!thread)return fail('Conversa nao encontrada',404);
   if(mt[2]==='messages'&&req.method==='GET'){
    const before=url.searchParams.get('before');
    if(before!==null&&!/^[1-9]\d{0,12}$/.test(before))return fail('Cursor invalido');
    const rows=(await env.DB.prepare(`SELECT m.id,m.sender_id AS senderId,u.username AS senderName,m.content,m.created_at AS createdAt,m.read_at AS readAt FROM hyron_dm_messages m JOIN users u ON u.id=m.sender_id
      WHERE m.thread_id=? AND m.id<? ORDER BY m.id DESC LIMIT 80`).bind(id,before?Number(before):Number.MAX_SAFE_INTEGER).all()).results;
    const ids=rows.map(r=>Number(r.id));
    const attach=ids.length?(await env.DB.prepare(`SELECT id,message_id AS messageId,name,mime,size FROM hyron_dm_attachments WHERE message_id IN (${ids.map(()=>'?').join(',')})`).bind(...ids).all<{id:number;messageId:number;name:string;mime:string;size:number}>()).results:[];
    return result({messages:rows.reverse().map((row:Record<string,unknown>)=>({...row,attachments:attach.filter(a=>a.messageId===row.id).map(a=>({id:a.id,name:a.name,mime:a.mime,size:a.size}))})),hasMore:rows.length===80});
   }
   if(mt[2]==='messages'&&req.method==='POST'){
    const b=await readBody(req);
    if(typeof b.content!=='string'||b.content.length>8000)return fail('Mensagem maior que 8000 caracteres');
    const attachments=Array.isArray(b.files)?b.files:[];
    if(attachments.length>1||(!b.content.trim()&&!attachments.length))return fail('Envie uma mensagem ou um arquivo por vez');
    let att:{id:string;name:string;mime:string;size:number}|null=null;
    if(attachments.length){
     const id=attachments[0]?.id;
     if(!mediaId(id))return fail('ID do anexo invalido');
     const verified=await ownerDrive(env,user.id,id,'metadata');
     if(!verified?.ok)return fail('Arquivo nao pertence ao Drive do remetente',403);
     const meta=await verified.json() as {id?:string;name?:string;mimeType?:string;size?:string};
     const size=Number(meta.size);
     if(meta.id!==id||!meta.name||meta.name.length>180||!Number.isInteger(size)||size<1||size>100*1024*1024)return fail('Metadados do arquivo invalidos',400);
     att={id,name:meta.name,mime:(meta.mimeType||'application/octet-stream').slice(0,100),size};
    }
    const partner=thread.user_a===user.id?thread.user_b:thread.user_a;
    const active=await env.DB.prepare('SELECT u.id FROM users u LEFT JOIN hyron_ghost_blocks g ON g.user_id=u.id WHERE u.id=? AND u.disabled=0 AND COALESCE(g.enabled,0)=0').bind(partner).first();if(!active)return fail('Destinatario indisponivel',409); // HYRON_GHOST_083_PHASE21
    // Limit accidental bursts from repeated clicks; never silently drop a message.
    const recent=await env.DB.prepare("SELECT count(*) AS n FROM hyron_dm_messages WHERE thread_id=? AND sender_id=? AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-60 seconds')").bind(id,user.id).first<{n:number}>();
    if((recent?.n||0)>=20)return fail('Limite temporario de mensagens atingido',429);
    // Uma transacao para mensagem + referencia, evitando anexos orfaos.
    const caption=b.content.trim()||('📎 '+att!.name);
    if(att){
     const mid=crypto.randomUUID();
     await env.DB.batch([
      env.DB.prepare('INSERT INTO hyron_dm_messages(thread_id,sender_id,content) VALUES(?,?,?)').bind(id,user.id,caption),
      env.DB.prepare(`INSERT INTO hyron_dm_attachments(message_id,thread_id,sender_id,file_id,name,mime,size)
       SELECT MAX(id),?,?,?,?,?,? FROM hyron_dm_messages WHERE thread_id=? AND sender_id=?`).bind(id,user.id,att.id,att.name,att.mime,att.size,id,user.id),
      env.DB.prepare("UPDATE hyron_dm_threads SET last_message_at=datetime('now') WHERE id=?").bind(id)
     ]);
    }else{
     await env.DB.batch([
      env.DB.prepare('INSERT INTO hyron_dm_messages(thread_id,sender_id,content) VALUES(?,?,?)').bind(id,user.id,caption),
      env.DB.prepare("UPDATE hyron_dm_threads SET last_message_at=datetime('now') WHERE id=?").bind(id)
     ]);
    }
    const partnerBot=internoFromUser(partner);
    const caps=att?false:convocouCAPS(caption);
    const mentions=att?[]:mencionadosNoTexto(caption);
    // @CAPS chama quatro personagens (inclusive em DM com interno).
    // Sem CAPS, preserva o funcionamento individual e a unica mencao.
    const bots=caps?[...INTERNOS_IDS]:partnerBot?[partnerBot]:(mentions.length===1?[mentions[0]]:[]);
    if(bots.length&&respond&&!att){
     try{
      // A mensagem recem-inserida e a mais recente; evita consulta cruzada entre conversas.
      const previous=(await env.DB.prepare('SELECT m.sender_id AS senderId,u.username AS senderName,m.content FROM hyron_dm_messages m LEFT JOIN users u ON u.id=m.sender_id WHERE m.thread_id=? ORDER BY m.id DESC LIMIT 60 OFFSET 1').bind(id).all<{senderId:string;senderName:string|null;content:string}>()).results.reverse();
      const history=previous.map(m=>({role:(internoFromUser(m.senderId)?'assistant':'user') as string,content:m.content,senderId:m.senderId,senderName:m.senderName}));
      history.push({role:'user',content:caption,senderId:user.id,senderName:user.username});
      const emitted:string[]=[];
      for(const bot of bots){
       const answer=await respond(bot,history);
       if(!answer||emitted.some(prior=>prior.trim().toLowerCase()===answer.trim().toLowerCase()))continue;
       emitted.push(answer);
       const botId=INTERNO_USERS[bot];
       await env.DB.batch([
        env.DB.prepare('INSERT INTO hyron_dm_messages(thread_id,sender_id,content) VALUES(?,?,?)').bind(id,botId,answer),
        env.DB.prepare("UPDATE hyron_dm_threads SET last_message_at=datetime('now') WHERE id=?").bind(id)
       ]);
       // Referencia curta, atribuida ao autor. Nao tratar como resposta do proprio bot.
       if(!caps)history.push({role:'assistant',content:answer,senderId:INTERNO_USERS[bot],senderName:bot});
      }
     }catch(e){console.error('HYRON CAPS/DM indisponivel',e);}
    }
    return result({ok:true},201);
   }
   if(mt[2]==='read'&&req.method==='POST'){
    await env.DB.prepare("UPDATE hyron_dm_messages SET read_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE thread_id=? AND sender_id<>? AND read_at IS NULL").bind(id,user.id).run();
    return result({ok:true});
   }
  }
  return fail('Rota nao encontrada',404);
 }catch(e){if(e instanceof SyntaxError)return fail('JSON invalido');if(e instanceof Error&&e.message==='Conteudo muito grande')return fail(e.message,413);throw e;}
}
