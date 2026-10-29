// HYRON_ADMIN_PASSWORD_RESET_V1
// Links temporários gerados apenas por administrador. Nunca armazenar token em claro.
type ResetEnv={DB:D1Database};
type ResetUser={id:string;username:string;role:'admin'|'user';disabled:number};
const respond=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});
const digest=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),v=>v.toString(16).padStart(2,'0')).join('');
const secret=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
async function passwordHash(password:string,salt:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:100000},key,256);return Array.from(new Uint8Array(bits),x=>x.toString(16).padStart(2,'0')).join('');}
async function payload(req:Request):Promise<Record<string,unknown>>{const raw=await req.text();if(raw.length>2048)throw Error('Corpo grande demais');const v=JSON.parse(raw);if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Formato inválido');return v as Record<string,unknown>;}
const tokenOk=(s:unknown):s is string=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
export async function passwordResetRoute(req:Request,env:ResetEnv,user:ResetUser|null):Promise<Response|null>{
 const u=new URL(req.url),p=u.pathname;
 if(!['/api/auth/reset-info','/api/auth/reset-password','/api/admin/password-reset-link'].includes(p))return null;
 if(p==='/api/admin/password-reset-link'&&!user)return null;
 try{
  if(p==='/api/admin/password-reset-link'&&req.method==='POST'){
   if(!user||user.role!=='admin')return respond({error:'Acesso restrito'},403);
   const b=await payload(req);
   if(typeof b.userId!=='string'||!/^[0-9a-f-]{36}$/i.test(b.userId))return respond({error:'Usuário inválido'},400);
   const target=await env.DB.prepare('SELECT id,username,disabled FROM users WHERE id=?').bind(b.userId).first<{id:string;username:string;disabled:number}>();
   if(!target||target.disabled)return respond({error:'Conta inexistente ou bloqueada'},404);
   const now=Date.now(),expires=now+30*60*1000,token=secret(),tokenHash=await digest(token);
   // Invalida os links anteriores da conta, inclusive se não expiraram.
   await env.DB.batch([
    env.DB.prepare('DELETE FROM password_reset_tokens WHERE user_id=?').bind(target.id),
    env.DB.prepare('INSERT INTO password_reset_tokens(token_hash,user_id,created_by,expires_at) VALUES(?,?,?,?)').bind(tokenHash,target.id,user.id,expires)
   ]);
   return respond({url:new URL('/?reset='+token,u.origin).toString(),username:target.username,expiresAt:expires},201);
  }
  if(p==='/api/auth/reset-info'&&req.method==='GET'){
   const token=u.searchParams.get('token');if(!tokenOk(token))return respond({error:'Link inválido'},400);
   const row=await env.DB.prepare('SELECT u.username FROM password_reset_tokens r JOIN users u ON u.id=r.user_id WHERE r.token_hash=? AND r.used_at IS NULL AND r.expires_at>? AND u.disabled=0').bind(await digest(token),Date.now()).first<{username:string}>();
   return row?respond({username:row.username}):respond({error:'Link expirado ou utilizado'},410);
  }
  if(p==='/api/auth/reset-password'&&req.method==='POST'){
   const b=await payload(req);
   if(!tokenOk(b.token)||typeof b.password!=='string'||b.password.length<12||b.password.length>128)return respond({error:'Link inválido ou senha fora do limite (12 a 128 caracteres)'},400);
   const tokenHash=await digest(b.token);
   const salt=secret(),encoded=await passwordHash(b.password,salt);
   const record=await env.DB.prepare('SELECT r.user_id FROM password_reset_tokens r JOIN users u ON u.id=r.user_id WHERE r.token_hash=? AND r.used_at IS NULL AND r.expires_at>? AND u.disabled=0').bind(tokenHash,Date.now()).first<{user_id:string}>();
   if(!record)return respond({error:'Link expirado ou utilizado'},410);
   // Consumo atômico: só uma requisição consegue reivindicar o token.
   const consumed=await env.DB.prepare('UPDATE password_reset_tokens SET used_at=? WHERE token_hash=? AND used_at IS NULL AND expires_at>?').bind(Date.now(),tokenHash,Date.now()).run();
   if(consumed.meta.changes!==1)return respond({error:'Link já utilizado ou inválido'},410);
   await env.DB.batch([
    env.DB.prepare('UPDATE users SET password_hash=?,salt=? WHERE id=? AND disabled=0').bind(encoded,salt,record.user_id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(record.user_id)
   ]);
   return respond({ok:true});
  }
  return respond({error:'Método não permitido'},405);
 }catch{return respond({error:'Não foi possível processar a recuperação'},500);}
}
