// HYRON 0.8.3 - Ala Coletiva: fase 1, grupos privados. Apenas admins HYRON criam.
type GroupUser={id:string;username:string;role:'admin'|'user'};
type GroupEnv={DB:D1Database};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const error=(msg:string,status=400)=>json({error:msg},status);
const validId=(id:string)=>/^[a-f0-9-]{36}$/i.test(id);
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
export async function groupRoomRoute(req:Request,env:GroupEnv,user:GroupUser,path:string):Promise<Response|null>{
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
  if(req.method==='GET'){
   const group=await env.DB.prepare('SELECT id,name,description,created_at AS createdAt FROM hyron_groups WHERE id=?').bind(id).first();
   const members=(await env.DB.prepare('SELECT u.id,u.username,m.role FROM hyron_group_members m JOIN users u ON u.id=m.user_id WHERE m.group_id=? ORDER BY m.role DESC,u.username').bind(id).all()).results;
   return json({group,members,myRole:membership.role});
  }
  if(req.method==='PATCH'){
   if(membership.role!=='admin'&&user.role!=='admin')return error('Sem permissao',403);
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
  if(!own||(own.role!=='admin'&&user.role!=='admin'))return error('Sem permissao',403);
  const b=await payload(req);if(typeof b.userId!=='string'||!validId(b.userId))return error('Usuario invalido');
  const target=await env.DB.prepare('SELECT id FROM users WHERE id=? AND disabled=0').bind(b.userId).first();if(!target)return error('Usuario indisponivel',404);
  const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM hyron_group_members WHERE group_id=?').bind(id).first<{n:number}>();if((count?.n||0)>=101)return error('Grupo cheio',409);
  await env.DB.prepare("INSERT OR IGNORE INTO hyron_group_members(group_id,user_id,role) VALUES(?,?,'member')").bind(id,b.userId).run();return json({ok:true});
 }
 if(memberPath&&req.method==='DELETE'){
  const id=memberPath[1];const b=await payload(req);if(typeof b.userId!=='string'||!validId(b.userId))return error('Usuario invalido');
  const own=await env.DB.prepare('SELECT role FROM hyron_group_members WHERE group_id=? AND user_id=?').bind(id,user.id).first<{role:string}>();
  if(!own)return error('Grupo nao encontrado',404);
  if(b.userId!==user.id&&own.role!=='admin'&&user.role!=='admin')return error('Sem permissao',403);
  const target=await env.DB.prepare('SELECT role FROM hyron_group_members WHERE group_id=? AND user_id=?').bind(id,b.userId).first<{role:string}>();
  if(!target)return error('Participante nao encontrado',404);
  if(target.role==='admin'){
   const count=await env.DB.prepare("SELECT COUNT(*) AS n FROM hyron_group_members WHERE group_id=? AND role='admin'").bind(id).first<{n:number}>();
   if((count?.n||0)<=1)return error('Transfira a administracao antes de remover o ultimo admin',409);
  }
  await env.DB.prepare('DELETE FROM hyron_group_members WHERE group_id=? AND user_id=?').bind(id,b.userId).run();return json({ok:true});
 }
 return error('Rota nao encontrada',404);
 }catch(e){return error(e instanceof Error?e.message:'Erro interno',400)}
}
