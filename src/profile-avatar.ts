// HYRON v0.8.3 - avatar do usuario. Storage D1, JPEG compactado, acesso autenticado.
type AvatarUser={id:string};
type AvatarEnv={DB:D1Database};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
export async function profileAvatarRoute(req:Request,env:AvatarEnv,user:AvatarUser,path:string):Promise<Response|null>{
 if(path==='/api/profile/avatar'&&req.method==='PUT'){
  if(Number(req.headers.get('content-length')||0)>135000)return reply({error:'Imagem muito grande'},413);
  const content=await req.text();if(content.length>135000)return reply({error:'Imagem muito grande'},413);
  let payload:unknown;try{payload=JSON.parse(content)}catch{return reply({error:'JSON invalido'},400)}
  const data=(payload as {image?:unknown})?.image;
  if(typeof data!=='string'||data.length>130000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(data))return reply({error:'Envie uma imagem JPEG compactada'},400);
  const b64=data.slice('data:image/jpeg;base64,'.length);
  if(b64.length<40||b64.length*3/4>96000)return reply({error:'Imagem deve ter no maximo 96 KB'},413);
  // Confere a assinatura JPEG decodificada do inicio do arquivo.
  try{if(!atob(b64.slice(0,40)).startsWith('\xFF\xD8\xFF'))return reply({error:'Arquivo nao e JPEG'},400)}catch{return reply({error:'Imagem invalida'},400)}
  await env.DB.prepare("INSERT INTO hyron_user_avatars(user_id,jpeg_base64,updated_at) VALUES(?,?,datetime('now')) ON CONFLICT(user_id) DO UPDATE SET jpeg_base64=excluded.jpeg_base64,updated_at=excluded.updated_at").bind(user.id,b64).run();
  return reply({ok:true});
 }
 if(path==='/api/profile/avatar'&&req.method==='DELETE'){
  await env.DB.prepare('DELETE FROM hyron_user_avatars WHERE user_id=?').bind(user.id).run();return reply({ok:true});
 }
 if(path.startsWith('/api/profile/avatar/')&&req.method==='GET'){
  const target=path.slice('/api/profile/avatar/'.length);
  if(!/^[0-9a-f-]{36}$/i.test(target))return reply({error:'Usuario invalido'},400);
  const result=await env.DB.prepare('SELECT a.jpeg_base64 FROM hyron_user_avatars a JOIN users u ON a.user_id=u.id WHERE a.user_id=? AND u.disabled=0').bind(target).first<{jpeg_base64:string}>();
  if(!result)return new Response(null,{status:404,headers:{'cache-control':'no-store'}});
  const decoded=atob(result.jpeg_base64);const image=Uint8Array.from(decoded,c=>c.charCodeAt(0));
  return new Response(image,{headers:{'content-type':'image/jpeg','cache-control':'private, max-age=30','x-content-type-options':'nosniff'}});
 }
 return null;
}
