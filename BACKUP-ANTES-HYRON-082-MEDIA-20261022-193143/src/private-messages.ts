// HYRON 0.8.2 - Linha Direta. All routes require an authenticated HYRON user.
type Person={id:string;username:string};
type DmEnv={DB:D1Database};
const result=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const fail=(message:string,status=400)=>result({error:message},status);
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
async function readBody(req:Request){if(Number(req.headers.get('content-length')||0)>9000)throw Error('Conteudo muito grande');const raw=await req.text();if(raw.length>9000)throw Error('Conteudo muito grande');return JSON.parse(raw) as Record<string,unknown>;}
async function membership(db:D1Database,thread:string,user:string){return db.prepare('SELECT id,user_a,user_b FROM hyron_dm_threads WHERE id=? AND (user_a=? OR user_b=?)').bind(thread,user,user).first<{id:string;user_a:string;user_b:string}>();}
export async function privateMessageRoute(req:Request,env:DmEnv,user:Person,path:string):Promise<Response|undefined>{
 if(!path.startsWith('/api/dm/'))return undefined;
 try {
  const url=new URL(req.url);
  if(path==='/api/dm/users'&&req.method==='GET'){
   const q=(url.searchParams.get('q')||'').trim().slice(0,32);
   const users=(await env.DB.prepare('SELECT id,username FROM users WHERE disabled=0 AND id<>? AND username LIKE ? COLLATE NOCASE ORDER BY username LIMIT 40').bind(user.id,'%'+q+'%').all<Person>()).results;
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
  const mt=/^\/api\/dm\/threads\/([0-9a-f-]{36})\/(messages|read)$/.exec(path);
  if(mt){
   const id=mt[1];if(!uuid(id))return fail('ID invalido');
   const thread=await membership(env.DB,id,user.id);if(!thread)return fail('Conversa nao encontrada',404);
   if(mt[2]==='messages'&&req.method==='GET'){
    const before=url.searchParams.get('before');
    if(before!==null&&!/^[1-9]\d{0,12}$/.test(before))return fail('Cursor invalido');
    const rows=(await env.DB.prepare(`SELECT id,sender_id AS senderId,content,created_at AS createdAt,read_at AS readAt FROM hyron_dm_messages
      WHERE thread_id=? AND id<? ORDER BY id DESC LIMIT 80`).bind(id,before?Number(before):Number.MAX_SAFE_INTEGER).all()).results;
    return result({messages:rows.reverse(),hasMore:rows.length===80});
   }
   if(mt[2]==='messages'&&req.method==='POST'){
    const b=await readBody(req);
    if(typeof b.content!=='string'||!b.content.trim()||b.content.length>4000)return fail('Mensagem deve ter entre 1 e 4000 caracteres');
    const partner=thread.user_a===user.id?thread.user_b:thread.user_a;
    const active=await env.DB.prepare('SELECT id FROM users WHERE id=? AND disabled=0').bind(partner).first();if(!active)return fail('Destinatario indisponivel',409);
    // Limit accidental bursts from repeated clicks; never silently drop a message.
    const recent=await env.DB.prepare("SELECT count(*) AS n FROM hyron_dm_messages WHERE thread_id=? AND sender_id=? AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-60 seconds')").bind(id,user.id).first<{n:number}>();
    if((recent?.n||0)>=20)return fail('Limite temporario de mensagens atingido',429);
    await env.DB.batch([
     env.DB.prepare('INSERT INTO hyron_dm_messages(thread_id,sender_id,content) VALUES(?,?,?)').bind(id,user.id,b.content.trim()),
     env.DB.prepare("UPDATE hyron_dm_threads SET last_message_at=datetime('now') WHERE id=?").bind(id)
    ]);
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
