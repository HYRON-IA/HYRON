type Drive=(path:string)=>Promise<Response|undefined>;
type ImageRef={id:string;name:string;mime:string;size:number};
type Catalog=ImageRef&{conversationId:string;messageId:number;legacy:boolean};
const fileId=(s:unknown):s is string=>typeof s==='string'&&/^[A-Za-z0-9_-]{8,180}$/.test(s);
const imageMime=(s:string)=>['image/jpeg','image/png','image/webp'].includes(s);
const clean=(s:string)=>s.replace(/[\r\n\[\]`]/g,'_');
export function imageRequest(q:string){
 const image=/\b(?:image[mn]s?|fotos?|fotografias?)\b|\.(?:png|jpe?g|webp)\b/i.test(q);
 return !image?'none':/\b(?:quais|liste|listar|nomes|enviei|enviadas)\b/i.test(q)?'list':/\b(?:analis[ea]|analisar|abra|abrir|veja|ver|descreva|compare|recupere|leia)\b/i.test(q)?'vision':'none';
}
export async function verifyImageRefs(input:unknown,drive:Drive):Promise<ImageRef[]>{
 if(input===undefined)return [];
 if(!Array.isArray(input)||input.length>2)throw Error('INVALID_IMAGE_REFS');
 const refs:ImageRef[]=[];
 for(const item of input){
  if(!item||typeof item!=='object'||!fileId(item.id))throw Error('INVALID_IMAGE_REFS');
  if(refs.some(r=>r.id===item.id))continue;
  const r=await drive('/api/drive/files/'+item.id+'/metadata');
  if(!r?.ok)throw Error('DRIVE_IMAGE_NOT_ACCESSIBLE');
  const x=await r.json() as {id:string;name:string;mimeType:string;size:string};
  const size=Number(x.size);
  if(x.id!==item.id||typeof x.name!=='string'||!x.name||x.name.length>180||!imageMime(x.mimeType)||!Number.isSafeInteger(size)||size<1||size>100*1024*1024)throw Error('INVALID_DRIVE_IMAGE');
  refs.push({id:x.id,name:x.name,mime:x.mimeType,size});
 }
 return refs;
}
export async function saveImageRefs(db:D1Database,userId:string,conversationId:string,messageId:number,refs:readonly ImageRef[]){
 for(const ref of refs)await db.prepare('INSERT OR IGNORE INTO hyron_chat_drive_images(user_id,conversation_id,message_id,drive_file_id,name,mime,size) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.id=? AND c.id=? AND c.user_id=? AND m.role=?)').bind(userId,conversationId,messageId,ref.id,ref.name,ref.mime,ref.size,messageId,conversationId,userId,'user').run();
}
export async function imageCatalog(db:D1Database,userId:string):Promise<Catalog[]>{
 const linked=(await db.prepare('SELECT a.drive_file_id AS id,a.name,a.mime,a.size,a.conversation_id AS conversationId,a.message_id AS messageId FROM hyron_chat_drive_images a JOIN conversations c ON c.id=a.conversation_id JOIN messages m ON m.id=a.message_id AND m.conversation_id=c.id WHERE a.user_id=? AND c.user_id=? ORDER BY a.message_id DESC').bind(userId,userId).all<Catalog>()).results.map(x=>({...x,legacy:false}));
 // Nomes antigos ja existem no historico. Nao inventar um ID para eles.
 let cursor=0;const legacy:Catalog[]=[];
 while(true){
  const rows=(await db.prepare('SELECT m.id,m.conversation_id AS conversationId,m.content FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.user_id=? AND m.role=? AND m.id>? AND instr(m.content,?)>0 ORDER BY m.id LIMIT 32').bind(userId,'user',cursor,'[INICIO DO ANEXO:').all<{id:number;conversationId:string;content:string}>()).results;
  if(!rows.length)break;
  for(const row of rows){cursor=row.id;for(const match of row.content.matchAll(/^\[INICIO DO ANEXO:\s*([^\]\r\n]+\.(?:png|jpe?g|webp))\]$/gim)){
   if(!linked.some(x=>x.messageId===row.id&&x.name===match[1]))legacy.push({id:'',name:match[1],mime:'',size:0,conversationId:row.conversationId,messageId:row.id,legacy:true});
  }}
 }
 return [...linked,...legacy].sort((a,b)=>b.messageId-a.messageId);
}
function names(rows:readonly Catalog[]){return rows.slice(0,30).map(x=>'- '+clean(x.name)+(x.legacy?' (vínculo com o Drive ainda não confirmado)':'')).join('\n');}
async function imageBytes(ref:ImageRef,drive:Drive){
 if(ref.size>2*1024*1024)throw Error('IMAGE_TOO_LARGE_FOR_RECALL');
 const r=await drive('/api/drive/files/'+ref.id+'/preview');
 if(!r?.ok||r.headers.get('content-type')!==ref.mime)throw Error('IMAGE_DOWNLOAD_FAILED');
 const reader=r.body?.getReader();if(!reader)throw Error('IMAGE_DOWNLOAD_FAILED');
 const chunks:Uint8Array[]=[];let count=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;count+=value.length;if(count>2*1024*1024)throw Error('IMAGE_TOO_LARGE_FOR_RECALL');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
 if(count!==ref.size)throw Error('IMAGE_DOWNLOAD_INCOMPLETE');
 const bytes=new Uint8Array(count);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10;
 const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const webp=new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP';
 if(!(ref.mime==='image/png'?png:ref.mime==='image/jpeg'?jpg:webp))throw Error('IMAGE_FORMAT_MISMATCH');
 let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return {name:ref.name,dataUrl:'data:'+ref.mime+';base64,'+btoa(binary)};
}
export async function recallImageRequest(db:D1Database,userId:string,question:string,drive:Drive,canSee:boolean){
 const kind=imageRequest(question);
 if(kind==='none')return {kind:'none' as const};
 let rows:Catalog[];
 try{rows=await imageCatalog(db,userId);}catch{return {kind:'reply' as const,answer:'O índice de imagens ainda não está disponível. Aplique a migração 0009_chat_drive_images.sql para ativá-lo.'};}
 if(!rows.length)return {kind:'reply' as const,answer:'Não encontrei nomes de imagens no histórico desta conta. Imagens novas precisam ser enviadas pelo chat; para recuperá-las depois, mantenha o Drive conectado.'};
 if(kind==='list')return {kind:'reply' as const,answer:'Encontrei estas imagens no histórico da sua conta:\n\n'+names(rows)+'\n\nPara analisar uma delas, peça “Analise a imagem NOME_DO_ARQUIVO”.'+(rows.length>30?'\nLista limitada às 30 referências mais recentes.':'')};
 const lower=question.toLocaleLowerCase();
 const matches=rows.filter(x=>lower.includes(x.name.toLocaleLowerCase()));
 const unique=[...new Map(matches.map(x=>[(x.id||'legacy:'+x.name),x])).values()];
 const options=unique.length?unique:rows.length===1?rows:[];
 if(options.length!==1)return {kind:'reply' as const,answer:'Preciso identificar uma única imagem. Informe o nome completo do arquivo. Se houver arquivos diferentes com o mesmo nome, selecione o correto pelo botão Do Drive.\n\n'+names(matches.length?matches:rows)};
 const chosen=options[0];
 try{
  let ref:ImageRef;
  if(chosen.legacy){
   const r=await drive('/api/drive/images/resolve?name='+encodeURIComponent(chosen.name));
   if(!r?.ok)throw Error('DRIVE_NOT_CONNECTED');
   const data=await r.json() as {files:{id:string}[]};
   if(data.files?.length!==1)return {kind:'reply' as const,answer:data.files?.length?'Há mais de uma imagem com esse nome no Drive. Selecione a correta pelo botão Do Drive; não escolhi uma automaticamente.':'O nome existe no histórico, mas não encontrei a imagem correspondente na pasta HYRON do Drive conectado.'};
   [ref]=await verifyImageRefs(data.files,drive);
   await saveImageRefs(db,userId,chosen.conversationId,chosen.messageId,[ref]);
  }else [ref]=await verifyImageRefs([{id:chosen.id}],drive);
  if(!canSee)return {kind:'reply' as const,answer:'Localizei '+clean(ref.name)+' no Drive. Para analisar seu conteúdo, configure Gemini com a confirmação do plano gratuito ou um modelo de visão OpenRouter terminado em :free. A seleção Groq deste projeto responde a texto; não vou inventar uma análise visual.'};
  return {kind:'vision' as const,images:[await imageBytes(ref,drive)],fileName:ref.name};
 }catch(error){const code=error instanceof Error?error.message:'';return {kind:'reply' as const,answer:code==='IMAGE_TOO_LARGE_FOR_RECALL'?'A imagem foi localizada, mas supera o limite de recuperação automática de 2 MiB. Selecione-a pelo botão Do Drive para reduzir e analisar.':'Não consegui recuperar essa imagem do Drive. Ela pode ter sido excluída, movida, ou a conexão pode precisar ser refeita. Não analisei o conteúdo.'};}
}
