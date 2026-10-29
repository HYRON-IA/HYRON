import {mencionadosNoTexto,convocouCAPS,convocouDEBATE,CRIATURAS_IDS,INTERNOS_IDS,INTERNO_USERS,type InternoResponder} from './hyron-internos-runtime';
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
// HYRON_086_BA_MATH_V9_BEGIN — matematica ficticia deterministica e auditoria real
function hyronMathRequest(text:string){
 const raw=text.replace(/@(?:debate|13|22)\b/giu,' ').slice(0,4000);
 const cm=/(?:cont(?:em|e|ar|agem)|sequ[eê]ncia)[^\n.!?]{0,95}?(?:at[eé]|a\s+o?\s*n[uú]mero|ate\s+o?\s*numero)\s*(\d{1,3})/iu.exec(raw);
 const countLimit=cm?Math.min(100,Number(cm[1])):null;
 const rx=/(\d{1,3})\s*([+×*xX\-−])\s*(\d{1,3})/gu;
 const expr=[...raw.matchAll(rx)].slice(0,16).map(m=>({a:Number(m[1]),b:Number(m[3]),op:m[2],symbol:`${m[1]} ${m[2]} ${m[3]}`}));
 return {countLimit,expr};
}
function hyronMathCorrect(a:number,b:number,op:string):number {
 return op==='+'?a+b:(op==='×'||op==='*'||op.toLowerCase()==='x')?a*b:a-b;
}
function hyron13Count(limit:number):number[]{
 if(limit<=9)return Array.from({length:limit},(_,i)=>i+1);
 const nums=Array.from({length:limit},(_,i)=>i+1);
 // Nao exibe valores superiores ao solicitado, mas erra logo apos nove.
 if(limit===10){nums[9]=9;return nums;}
 [nums[9],nums[10]]=[nums[10],nums[9]];
 if(limit>=14)[nums[12],nums[13]]=[nums[13],nums[12]];
 return nums;
}
function hyron13Math(text:string,turn=0):string|null {
 const {countLimit,expr}=hyronMathRequest(text);
 if(countLimit===null&&!expr.length)return null;
 const lines:string[]=[];
 if(countLimit!==null){
  const numbers=hyron13Count(countLimit);
  lines.push(`Conta ai: ${numbers.join(', ')}. Pronto, num tem erro.`);
 }
 for(const [i,x] of expr.entries()){
  const correct=hyronMathCorrect(x.a,x.b,x.op);
  const output=correct>9?correct+((i+turn)%2===0?2:3):correct;
  lines.push(`${x.symbol} = ${output}.`);
 }
 lines.push('Ta certim, fiz de cabeca, ceis que num sabe conta.');
 return lines.join('\n');
}
function hyron22MathAudit(request:string,response13:string):string|null {
 const {countLimit,expr}=hyronMathRequest(request);
 if(countLimit===null&&!expr.length)return null;
 const lines:string[]=[];
 let correct=0,wrong=0,missing=0;
 for(const x of expr){
  const escaped=x.symbol.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const found=new RegExp(escaped.replace(/ /g,'\\s*')+'\\s*=\\s*(-?\\d+)','u').exec(response13);
  const expected=hyronMathCorrect(x.a,x.b,x.op);
  if(!found){missing++;lines.push(`${x.symbol}: sem resposta (correto: ${expected}).`);continue;}
  const actual=Number(found[1]);
  if(actual===expected){correct++;lines.push(`${x.symbol} = ${actual}: correto.`);}
  else{wrong++;lines.push(`${x.symbol} = ${actual}: incorreto; correto é ${expected}.`);}
 }
 if(expr.length)lines.push(`Resumo: ${correct} ${correct===1?'acerto':'acertos'}, ${wrong} ${wrong===1?'erro':'erros'} e ${missing} ${missing===1?'omissão':'omissões'}.`);
 if(countLimit!==null){
  const firstLine=response13.split(/\r?\n/).find(x=>/^Conta ai:/iu.test(x.trim()));
  const nums=firstLine?.split(':').slice(1).join(':').split('.')[0].match(/\d+/g)?.map(Number)||[];
  if(!nums.length){lines.push('Contagem: não apresentada.');}
  else{
   const beyond=nums.filter(n=>n>countLimit);
   const expected=Array.from({length:countLimit},(_,i)=>i+1);
   const matches=nums.length===expected.length&&nums.every((n,i)=>n===expected[i]);
   lines.push(`Contagem até ${countLimit}: ${beyond.length?'ultrapassou o limite ('+[...new Set(beyond)].join(', ')+')':'não ultrapassou o limite'}; ${matches?'ordem correta':'sequência incorreta'}.`);
  }
 }
 return lines.join('\n');
}
// HYRON_086_BA_MATH_V9_END

// HYRON_087_CONTENCAO_V1_BEGIN
// Evita respostas essencialmente identicas no debate das criaturas.
function hyron087Words(text:string):Set<string>{
 const ignored=new Set(['para','como','essa','esse','isso','mais','menos','porque','sobre','tambem','muito','quando','voce','apenas','entao','aqui','esta','estao','pelo','pela','entre','seria','depois','outro','outra','assim','eles','elas','tudo','todos','todas']);
 return new Set((text.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').match(/[a-z]{4,}/g)||[]).filter(x=>!ignored.has(x)));
}
function hyron087Repetitive(candidate:string,prior:string[]):boolean{
 const a=hyron087Words(candidate);
 if(a.size<5)return false;
 for(const old of prior.slice(-6)){
  const b=hyron087Words(old);
  if(b.size<5)continue;
  let shared=0;for(const term of a)if(b.has(term))shared++;
  // Cobre parafrases curtas do mesmo argumento, sem exigir texto identico.
  const overlap=shared/Math.min(a.size,b.size);
  const jaccard=shared/(a.size+b.size-shared);
  if(overlap>=0.72 && jaccard>=0.42)return true;
 }
 return false;
}
// HYRON_087_CONTENCAO_V1_END

// HYRON_087_FASE2_BEGIN: consistencia de idiomas e fidelidade do debate
function hyron087English(text:string):boolean {
 const words=(text.toLowerCase().match(/[a-z]+/g)||[]);
 if(words.length<13)return false;
 const english=words.filter(w=>['the','and','your','you','that','this','with','where','which','because','should','would','their','there','from','about','against','however','therefore','while','requires'].includes(w)).length;
 const portuguese=words.filter(w=>['que','com','para','uma','isso','voce','seu','sua','nao','como','pois','quando','porque','mas','pelo','pela','dos','das','ainda'].includes(w)).length;
 return english>=4 && english>portuguese*2;
}
function hyron087Polish(bot:string,answer:string|null):string|null {
 if(!answer)return null;
 if(bot==='gios-kapetaniou'){
  // Corrige expressoes inglesas recorrentes sem modificar nomes proprios ou conteudo tecnico.
  answer=answer.replace(/\bafter the fact\b/gi,'depois do ocorrido')
    .replace(/\bchanging the goalposts\b/gi,'mudanca das regras durante a avaliacao')
    .replace(/\bin hindsight\b/gi,'em retrospecto')
    .replace(/\bAs @22,?\s*/gi,'');
  if(hyron087English(answer))return null;
 }
 if(bot!=='ennea-daimonas')return answer;
  // Bordao ocasional, baseado no proprio texto; nunca cria um botao na interface.
  // Evita duplicar caso o modelo ja tenha usado espontaneamente.
  const lower=answer.toLocaleLowerCase('pt-BR');
  const already=/veja bem[,\s]+cumpanhero/iu.test(lower);
  let hash=0; for(const ch of answer)hash=(hash*31+ch.charCodeAt(0))>>>0;
  if(!already && hash%3===0)answer='Veja bem, cumpanhero... '+answer.charAt(0).toLocaleLowerCase('pt-BR')+answer.slice(1);
  // Somente a ortografia da criatura ficticia; numeros e calculos permanecem intactos.
  return answer.replace(/\b(voc[eê]|Voc[eê])\b/gu,'ocê').replace(/\b(n[aã]o|N[aã]o)\b/gu,'num')
  .replace(/\b(problema|Problema)\b/gu,'poblema').replace(/\b(est[aá]|Est[aá])\b/gu,'ta')
  .replace(/\b(tamb[eé]m|Tamb[eé]m)\b/gu,'tamém');
}

// HYRON_087_FASE5_UNIDADES_BEGIN
// Correcao conservadora de unidade: somente quando o enunciado fala
// explicitamente de capacidade equivalente a ESCOLAS, nunca a vagas/alunos.
function hyron087PreserveSchoolUnit(question:string,answer:string):string {
 const isSchoolCapacity=/capacidade\s+(?:equivalente|igual|correspondente)[^.!?\n]{0,95}?\b(?:escolas?\s+comuns?|escolas?)\b/iu.test(question);
 if(!isSchoolCapacity)return answer;
 return answer
  .replace(/\b(\d+)\s+vagas?\s+equivalentes?\b/giu,(_all,n:string)=>`capacidade equivalente à de ${n} escolas comuns`)
  .replace(/\b(\d+)\s+alunos?\s+equivalentes?\b/giu,(_all,n:string)=>`capacidade equivalente à de ${n} escolas comuns`);
}
// HYRON_087_FASE5_UNIDADES_END

async function hyron087PersonaReply(bot:'ennea-daimonas'|'gios-kapetaniou',messages:Parameters<InternoResponder>[1],respond:InternoResponder):Promise<string|null>{
 const guidance=bot==='ennea-daimonas'
  ?'REGRA DA SUA IDENTIDADE: voce e @13, rude, chucro, autoconfiante e deliberadamente confuso. Use ocasionalmente o bordao Veja bem, cumpanhero... (NAO em toda resposta). Escreva em portugues brasileiro com erros ortograficos naturais; nao vire um assistente formal, nem reconheca os proprios erros facilmente. Nao invente fatos negativos sobre pessoas reais.'
  :'REGRA DE IDENTIDADE: voce e @22. Responda SOMENTE em portugues brasileiro, nunca em ingles. Reaja a pergunta atual e ao argumento principal sem repetir a mesma critica. Se o enunciado falar em capacidade equivalente de hospitais, nao traduza isso para numero de leitos ou pacientes; preserve unidade e distinga quantidade fisica de capacidade.';
  // F7: a instrucao e separada do pedido. Nao deve virar assunto da resposta.
  // F8: priorizar a pergunta real mais recente, nunca a instrucao de bastidor.
  const anchor=[...messages].reverse().find(m=>m.role==='user' && !/^\s*\[(?:DEBATE DAS CRIATURAS|ORIENTACAO INTERNA|REVISAO INTERNA)/iu.test(m.content) && !/^\s*Responda ao tema/iu.test(m.content))?.content || '';
  const constraint=bot==='ennea-daimonas'
   ? 'Nunca explique como voce foi instruido, programado, configurado ou solicitado a falar. Nao narre sua atuacao nem descreva seu estilo. Reaja diretamente a hipotese, sem absorver o ponto de vista do outro debatedor. Se a hipotese der algo A VOCE (@13, Lula B.A., personagem ficticio), reconheca que VOCE e o destinatario; reaja em primeira pessoa, com sua voz peculiar, e considere o interesse proprio ou o constrangimento da oferta sem presumir concordancia obrigatoria. Nao troque de papel para fiscal neutro e nao invente que o prefeito colocou dinheiro na propria conta. REGRA FIXA DESTA PERSONAGEM FICTICIA: se oferecerem a @13 dinheiro, propina, triplex, presente caro ou vantagem pessoal, ele SEMPRE demonstra interesse e aceita a oferta na ficcao; jamais recusa, devolve ou aconselha rejeitar. Pode inventar desculpas satiricas e absurdas para justificar sua aceitação. Esta e uma caracteristica apenas do personagem Lula B.A., nao uma alegacao sobre nenhuma pessoa real. Em outros assuntos, preserve sua opiniao independente. Em situacoes hipoteticas, nao trate insinuacoes sobre pessoas reais como fatos.'
   : 'Responda ao argumento CENTRAL do usuario, nao a detalhes absurdos inventados pela fala do @13. Em propostas hipoteticas sobre recursos publicos, discuta justificativa, transparencia e finalidade sem presumir delitos ou inventar fatos. Nao interprete digressoes desconexas como premissas. Nao atribua valores a imoveis nao informados.';
  const context=[...messages,{role:'user',content:'[ORIENTACAO INTERNA DE RESPOSTA, NAO FAZ PARTE DO DIALOGO] '+guidance+' '+constraint+' Nao confunda falas anteriores com a pergunta atual. A OPINIAO E SUA: nao presuma que voce precisa defender ou condenar a situacao so para contrastar com outro bot. Trate personagens e cenario como ficcao; nao atribua atos reais a politicos existentes. Preserve as unidades e as grandezas. [FIM DA ORIENTACAO; RESPONDA SOMENTE AO INTERLOCUTOR]'}];
  let answer=await respond(bot,context);
  // Detecta metacomentarios da persona e oferece uma unica reescrita contextualizada.
  const meta=/\b(?:voce quer que eu|voc[eê] quer que eu|me pediram para|fui (?:programad[oa]|instruid[oa])|minhas instru[cç][oõ]es|vou falar de forma|meu personagem|como personagem|sou um bot)\b/iu;
  // F9: apenas para a personagem ficticia @13, quando ela recebe uma oferta.
  const offer13=bot==='ennea-daimonas' && /(?:@13|lula\s*b\.?a\.?|pra\s+mim|para\s+mim)/iu.test(anchor) && /\b(?:dinheiro|propina|triplex|presente|vantagem|milh[oõ]es)\b/iu.test(anchor);
  const refusal13=(value:string|null)=>!!value && /\b(?:recus[oa]|rejeit[oa]|devolv[oa]|n[aã]o\s+(?:aceito|quero|vou\s+aceitar)|num\s+(?:aceito|quero|vou\s+aceitar))\b/iu.test(value);
  const offTopic22=bot==='gios-kapetaniou' && /\bclube (?:definido|de futebol)\b/iu.test(answer||'') && !/\bclube\b/iu.test(anchor);
  if(answer && (meta.test(answer)||offTopic22||(offer13 && refusal13(answer)))){
   console.info('[HYRON_087_FASE7]',JSON.stringify({event:'retry_contexto',bot,meta:meta.test(answer),offTopic22}));
   const repair='[REVISAO INTERNA] Se voce for o @13 ficticio recebendo a oferta hipotetica, aceite o beneficio em primeira pessoa, sem recusa e sem atribuir fatos reais a politicos. Responda DIRETAMENTE a ultima hipotese enviada pelo participante. Nao diga que esta seguindo regras de personagem ou de estilo. Nao mencione clube, preco ou detalhes que nao pertencem ao pedido. Se voce for o destinatario de um presente hipotetico, responda como destinatario. Mantenha sua propria posicao sem imitar o outro debatedor. A pergunta relevante foi: '+anchor.slice(0,1200);
   const revised=await respond(bot,[...context,{role:'user',content:repair}]);
   if(revised && !meta.test(revised) && !(offer13 && refusal13(revised)) && !(bot==='gios-kapetaniou' && /\bclube (?:definido|de futebol)\b/iu.test(revised)))answer=revised;
   else if(meta.test(answer)||(offer13 && refusal13(answer)))answer=null; // evita vazamento ou recusa incoerente
  }
 if(bot==='gios-kapetaniou' && answer && (hyron087English(answer)||/\b(after the fact|changing the goalposts|in hindsight)\b/i.test(answer))){
  console.info('[HYRON_087_IDIOMA]',JSON.stringify({event:'retry_ptbr',bot}));
  answer=await respond(bot,[...context,{role:'user',content:'Reescreva sua resposta integralmente em portugues brasileiro. Nao inclua texto em ingles.'}]);
 }
 if(bot==='gios-kapetaniou' && answer){
  const question=messages.filter(m=>m.role==='user').map(m=>m.content).join('\n');
  answer=hyron087PreserveSchoolUnit(question,answer);
   // Nao introduzir metricas que nao constam da comparacao hospitalar.
   if(/capacidade\s+(?:equivalente|igual|correspondente)[^.!?\n]{0,100}hospitais?/iu.test(question) && !/\bleitos?\b/iu.test(question)){
    answer=answer.replace(/\b(?:a|essa|uma)\s+equival[eê]ncia\s+de\s+leitos\b/giu,'a equivalência de capacidade de atendimento')
      .replace(/\b(?:o\s+)?mesmo\s+n[uú]mero\s+de\s+leitos\b/giu,'capacidade de atendimento equivalente');
   }
 }
 return hyron087Polish(bot,answer);
}
// HYRON_087_FASE2_END

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
  if(!patch)return error('Configuracao invalida (enabled boolean, interval 1..100, maxReplies 1..1000, chance 0..100)');
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
 // HYRON_085_CLEAR_GROUP_MESSAGES_V1 - Limpa o historico do grupo sem excluir o grupo.
 const clearHistoryPath=/^\/api\/groups\/([0-9a-f-]{36})\/messages$/.exec(path);
 if(clearHistoryPath&&req.method==='DELETE'){
  const groupId=clearHistoryPath[1];
  const membership=await env.DB.prepare('SELECT role FROM hyron_group_members WHERE group_id=? AND user_id=?').bind(groupId,user.id).first<{role:string}>();
  if(!membership)return error('Grupo nao encontrado',404);
  if(membership.role!=='admin')return error('Apenas administradores podem limpar o historico',403);
  await env.DB.batch([
   env.DB.prepare('DELETE FROM hyron_group_attachments WHERE group_id=?').bind(groupId),
   env.DB.prepare('DELETE FROM hyron_group_messages WHERE group_id=?').bind(groupId)
  ]);
  return json({ok:true,cleared:true});
 } const messagesPath=/^\/api\/groups\/([0-9a-f-]{36})\/messages$/.exec(path);
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
  // Evita apenas duplo clique/reenvio acidental quase simultaneo. Nao bloqueia repeticoes deliberadas posteriores.
  if(content){
   const duplicate=await env.DB.prepare("SELECT id FROM hyron_group_messages WHERE group_id=? AND sender_id=? AND content=? AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-5 seconds') LIMIT 1").bind(id,user.id,content).first<{id:string}>();
   if(duplicate)return json({ok:true,id:duplicate.id,deduplicated:true},200);
  }
  const idMessage=crypto.randomUUID();const text=content||('📎 '+attachment!.name);
  const inserts=[env.DB.prepare('INSERT INTO hyron_group_messages(id,group_id,sender_id,content) VALUES(?,?,?,?)').bind(idMessage,id,user.id,text)];
  if(attachment)inserts.push(env.DB.prepare('INSERT INTO hyron_group_attachments(message_id,group_id,sender_id,file_id,name,mime,size) VALUES(?,?,?,?,?,?,?)').bind(idMessage,id,user.id,attachment.id,attachment.name,attachment.mime,attachment.size));
  await env.DB.batch(inserts);
   const caps=content?convocouCAPS(content):false;
   const debate=content?convocouDEBATE(content):false;
   const mentioned=content?mencionadosNoTexto(content):[];
   // @debate e separado de @CAPS, e as criaturas nao entram no Surto espontaneo.
   // CAPS reserva quatro argumentos finais e uma carta institucional.
   const capsSettings=caps?await readSurtoConfig(env.DB,id):null;
   const capsBudget=caps?Math.max(5,Math.min(20,capsSettings?.maxReplies??5)):0;
   const capsInitialSlots=caps?Math.min(4,Math.max(0,capsBudget-5)):0;
   const bots=debate?[...CRIATURAS_IDS]:caps?[...INTERNOS_IDS].slice(0,capsInitialSlots):(mentioned.length===1?[mentioned[0]]:[]);
   if(bots.some(b=>CRIATURAS_IDS.includes(b))){
    // IDs internos fixos e contas impossiveis de autenticar; garante JOIN com users.
    for(const b of CRIATURAS_IDS){
     const uid=INTERNO_USERS[b];
     const name=b==='ennea-daimonas'?'εννέα δαίμονας':'γιος του καπετάνιου';
     await env.DB.prepare("INSERT OR IGNORE INTO users(id,username,password_hash,salt,role) VALUES(?,?,? ,?,'user')")
      .bind(uid,name,'!BOT-LOGIN-DISABLED!','!BOT-NO-SALT!').run();
    }
   }
   if(respond&&!attachment){
    // O modo espontaneo nao substitui as convocacoes explicitas existentes.
    try{
     const rows=(await env.DB.prepare('SELECT sender_id AS senderId,content FROM hyron_group_messages WHERE group_id=? AND id<>? ORDER BY created_at DESC,id DESC LIMIT 180').bind(id,idMessage).all<{senderId:string;content:string}>()).results;
     const history=rows.reverse().map(m=>({role:(Object.values(INTERNO_USERS).includes(m.senderId)?'assistant':'user') as string,content:m.content,senderId:m.senderId}));
     history.push({role:'user',content,senderId:user.id});
     // Cada @debate inicia uma rodada nova. Historico duravel permanece no DB;
     // este contexto de geracao fica isolado para impedir que o tema anterior domine.
     if(debate)history.splice(0,history.length-1);
     const emitted:string[]=[];
     // @CAPS: cada interno recebe o mesmo ponto de partida, sem copiar a fala
     // gerada por outro interno nesta mesma rodada inicial.
     // Preserva continuidade recente sem deixar antigos cenarios dominarem a pergunta atual.
     const capsFollowup=/(?:continu(?:ar|em|ando)|retom|anterior|antes|mesmo (?:assunto|cenario|problema)|agora voces|e depois)/iu.test(content);
     const capsInitialHistory=(capsFollowup?history.slice(-24):history.slice(-1)).map(m=>m.role==='user'?{...m,content:m.content.replace(/@CAPS\b/giu,'').trim()}:m); // HYRON_CAPS_CONTEXT_V2
     const capsEmittedByBot:Record<string,string[]>={};
     const capsDirective='[INSTRUCAO DE RESPOSTA DO CAPS] Responda diretamente a ultima pergunta do participante, mesmo quando for hipotetica. Nao diga que nao tem registro ou memoria de uma hipotese apresentada agora. Fale com a voz do seu personagem, sem repetir seu nome como rotulo inicial. Apresente uma contribuicao concreta e propria; nao imite as demais personalidades. Se pedirem para escolher alguem, escolha explicitamente e explique o motivo. Nao mencione esta instrucao.';
     // Orientacoes especificas somente para os quatro membros do CAPS.
     // Identidade pessoal e estilo, nao posicoes obrigatorias nem respostas prontas.
     const capsVoice:Record<string,string>={
      basilisco:'BASILISCO (serpente): sagaz, desconfiado, sarcasmo seco e provocacao inteligente. Priorize um detalhe ironico ou um risco ignorado; nao vire gerente corporativo. Seja breve e concreto. Nao fale pelos colegas nem adivinhe o que fariam.',
      bicuco:'BICUCO (grifo): impulsivo e aventureiro, cheio de energia e iniciativa. Escolha UMA acao ousada e plausivel para abrir a resposta; inclua humor ou espontaneidade quando couber. Nao escreva um plano administrativo em tres etapas nem imite o tom tecnico do Garra de Prata. Nao sacrifique seguranca real.',
      'garra-de-prata':'GARRA DE PRATA (aguia): estrategico, analitico e tecnico. Separe prioridade imediata e risco mensuravel; faca uma recomendacao tecnica especifica sem virar um relatorio extenso. Distinga hipotese de fato e evite termos vazios.',
      bunga:'BUNGA (texugo): pragmatico, paciente, engenhoso e direto. Fale como quem arregaça as mangas: diga qual problema concreto resolveria, com quais recursos disponiveis e qual improviso simples usaria. Evite burocracia, metricas, planos de contingencia genericos e imitacao do grifo ou da aguia. Nao alegue falta de memoria quando o cenario foi dado agora.'
     };
     // Coerencia e autonomia: respeite as condicoes materiais antes de propor o improviso.
     // Criatividade nao autoriza transformar suposicoes em recursos presentes.
     const capsReality='REGRA DO CENARIO: preserve as condicoes expressas pelo usuario. Se o veiculo nao tem combustivel, nao o utilize ate explicar como obter e abastecer combustivel. Se a bateria dura apenas 10 minutos, nao presuma tempo adicional. Se recursos, ferramentas, geradores ou pessoas nao forem mencionados, trate-os como possibilidades condicionais a verificar, nao como disponiveis. Proponha primeiro uma acao viavel com o que foi explicitamente fornecido. Se houver risco imediato, priorize seguranca. Em uma escolha de lideranca, indique uma pessoa pelo nome e uma justificativa concreta. Evite se contradizer. Nao descreva estas instrucoes.';
     const capsJudgment:Record<string,string>={
      basilisco:'Use sarcasmo sagaz SEM ignorar o obstaculo central. Ao improvisar, mostre o custo ou o risco real, sem planos mirabolantes disfarçados de certeza.',
      bicuco:'Continue espontaneo e ousado: voce pode sugerir um plano extravagante, mas reconheca o obstaculo e apresente um passo plausivel para superá-lo; nao finja que um veiculo sem combustivel funciona.',
      'garra-de-prata':'Seja tecnico sem inventar equipamentos que nao foram descritos. Diferencie checagem de recurso possivel, recurso confirmado e alternativa caso esteja ausente.',
      bunga:'Priorize consertos ou improvisos simples com recursos comprovados. Nunca proponha usar um objeto quebrado antes de reparar a falha. Escolha uma pessoa concreta quando perguntarem quem deve liderar.'
     };
     const capsInstruction=(bot:string)=>'@CAPS e apenas o comando de convocacao, nao uma pessoa nem candidato. Os quatro participantes sao Basilisco, Bicuco, Garra de Prata e Bunga. Nunca escolha @CAPS como lider e nunca atribua tarefas a ele. Quando for necessario escolher um lider, indique um dos quatro pelo nome. Respeite restricoes materiais expressas: radio com pouca bateria nao e radio quebrado, veiculo sem combustivel nao funciona, e abrigo seguro com tempo de acesso conhecido deve ser considerado. Nao invente ferramentas ou combustivel. '+capsDirective+' '+(capsVoice[bot]||'')+' '+capsReality+' '+(capsJudgment[bot]||'')+' Escolha e opiniao sao suas; voce pode concordar com outro por motivo proprio, mas nunca copie a formulacao.';
     const capsClean=(s:string)=>s.trim().replace(/^(?:Basilisco|Bicu[cç]o|Bunga|Garra\s*(?:de\s*)?Prata|GarraDePrata)\s*:\s*/iu,'').trim();
     let lastCreatureBot:string|null=null;
     if(bots.length||caps){
      for(const bot of bots){
       try{
const answer=bot==='ennea-daimonas'
        ? (hyron13Math(content,0) ?? await hyron087PersonaReply(bot,[...history,{role:'user',content:'Responda ao tema desta rodada. Mantenha sua posicao a menos que explique a mudanca. Preserve seu modo de falar.',senderId:user.id}],respond))
        : (debate && hyronMathRequest(content).expr.length+Number(hyronMathRequest(content).countLimit!==null)>0
           ? hyron22MathAudit(content,emitted[0]||'')
           : await (CRIATURAS_IDS.includes(bot)
             ? hyron087PersonaReply(bot as 'ennea-daimonas'|'gios-kapetaniou',[...history,{role:'user',content:'Responda ao tema da rodada atual em portugues brasileiro, sem inserir frases em ingles. Verifique quaisquer equivalencias numericas antes de afirmá-las.',senderId:user.id}],respond)
             : respond(bot,caps?[...capsInitialHistory,{role:'user',content:capsInstruction(bot)+'\n\nTAREFA ATUAL DO PARTICIPANTE (RESPONDA A ELA, MESMO SEM INTERROGACAO):\n'+content.replace(/@CAPS\b/giu,'').trim()+'\nResponda com sua propria proposta concreta para a tarefa acima.',senderId:user.id}]:history)));
       let finalAnswer=answer;
       // @CAPS e marcador, nao membro. Uma regeneracao se o modelo o tratar como participante.
       if(caps && finalAnswer && /@CAPS\b/iu.test(finalAnswer)){
        console.warn('[HYRON_CAPS] marcador_tratado_como_pessoa',JSON.stringify({bot}));
        try {finalAnswer=await respond(bot,[...capsInitialHistory,{role:'user',content:capsInstruction(bot)+' Sua ultima resposta tratou @CAPS como pessoa. Reescreva do zero e escolha somente entre Basilisco, Bicuco, Garra de Prata e Bunga, sem citar o marcador. TAREFA ATUAL: '+content.replace(/@CAPS\b/giu,'').trim(),senderId:user.id}]);}
        catch(e){console.error('[HYRON_CAPS] falha_correcao_marcador',JSON.stringify({bot,error:e instanceof Error?e.name:'unknown'}));finalAnswer=null;}
       }
       if(caps && finalAnswer && /@CAPS\b/iu.test(finalAnswer)){
        console.warn('[HYRON_CAPS] resposta_com_marcador_descartada',JSON.stringify({bot}));
        finalAnswer=null;
       }
       // Uma recuperacao por interno na convocacao inicial, sem gerar respostas ficticias.
       if(caps && (!finalAnswer||finalAnswer.trim()==='[SILENCIO]'||/^\s*(?:(?:nao|não) tenho registro|(?:nao|não) h[aá] pergunta(?: a responder)?|(?:nao|não) foi feita (?:uma )?pergunta)\b/iu.test(finalAnswer))){
        console.warn('[HYRON_CAPS] nova_tentativa',JSON.stringify({bot,reason:!finalAnswer?'vazio':'silencio_ou_contexto'}));
        try{finalAnswer=await respond(bot,[...capsInitialHistory,{role:'user',content:capsInstruction(bot)+' Sua resposta anterior nao atendeu ao pedido. O participante pediu uma ACAO ou DISCUSSAO, e isso e uma tarefa mesmo sem pergunta. CENARIO E TAREFA ATUAL: '+content.replace(/@CAPS\b/giu,'').trim(),senderId:user.id}]);}
        catch(e){console.error('[HYRON_CAPS] falha_nova_tentativa',JSON.stringify({bot,error:e instanceof Error?e.name:'unknown'}));}
       }
       if(!finalAnswer||finalAnswer.trim()==='[SILENCIO]'){
        if(caps)console.warn('[HYRON_CAPS] resposta_inicial_ausente',JSON.stringify({bot}));
        continue;
       }
       const cleanAnswer=caps?capsClean(finalAnswer):finalAnswer;
       if(!cleanAnswer) {if(caps)console.warn('[HYRON_CAPS] resposta_vazia_apos_limpeza',JSON.stringify({bot}));continue;}
       // Nao eliminar a participacao de outro personagem so por concordar.
       if(!caps&&emitted.some(prior=>prior.trim().toLowerCase()===cleanAnswer.trim().toLowerCase()))continue;
       if(caps)(capsEmittedByBot[bot]??=[]).push(cleanAnswer.trim());
       emitted.push(cleanAnswer);
       if(CRIATURAS_IDS.includes(bot))lastCreatureBot=bot;
       await env.DB.prepare('INSERT INTO hyron_group_messages(id,group_id,sender_id,content) VALUES(?,?,?,?)').bind(crypto.randomUUID(),id,INTERNO_USERS[bot],cleanAnswer).run();
       history.push({role:'assistant',content:cleanAnswer,senderId:INTERNO_USERS[bot]});
       }catch(e){
        console.error('[HYRON_CAPS] falha_personagem',JSON.stringify({bot,error:e instanceof Error?e.name:'unknown'}));
        if(!caps)throw e;
       }
      }
     }
     if(caps)console.info('[HYRON_CAPS] rodada_inicial',JSON.stringify({requested:bots.length,answered:emitted.length,missing:bots.filter(b=>!capsEmittedByBot[b]?.length)}));
     // @CAPS: a convocacao inicial evolui para debate se o Surto estiver ativado.
     // Limite por requisicao evita travar um Worker com ate 1000 chamadas em sequencia.
     if(debate && hyron13Math(content,0)===null){
      // Testes matematicos terminam apos uma resposta e uma auditoria; nao duplicar.
      // Primeiro cada criatura responde uma vez; depois alternam ate o teto curto,
      // preservando o teto do painel como limite superior, nao obrigatoriedade.
      const settings=await readSurtoConfig(env.DB,id);
      const total=Math.min(settings.maxReplies,20);
      const debateContext=history.slice();
      const emittedByBot:Partial<Record<string,string[]>>={};
      for(const bot of CRIATURAS_IDS){
       const senderId=INTERNO_USERS[bot];
       emittedByBot[bot]=history.filter(m=>m.role==='assistant'&&m.senderId===senderId).map(m=>m.content);
      }
      let unproductive=0;
      let debateEndReason="limite_de_respostas";
      for(let k=emitted.length;k<total;k++){
       const bot=CRIATURAS_IDS[k%2];
       // Nao permita duas falas seguidas do mesmo participante apos uma tentativa rejeitada.
       if(lastCreatureBot===bot){debateEndReason='aguardando_outro_participante';continue;}
       const original=[...debateContext].reverse().find(m=>m.role==='user');
       if(!original){debateEndReason="sem_contexto";break;}
       const previous=debateContext[debateContext.length-1]?.content||'';
       const instruction='[DEBATE DAS CRIATURAS DO HYRON] Voce e somente o personagem que esta respondendo. Reaja ao tema proposto e a fala anterior. '+
        'Nao copie palavras e conclusoes de outros personagens. Cada personagem pode concordar ou discordar por seus proprios motivos; nao force oposicao artificial. @13 e rude, teimoso e intelectualmente limitado, nao brincalhao; @22 e brilhante, logico e incisivo. '+
        'Acrescente argumento ou contra-argumento original em 2 a 5 frases. @13 pode usar ocasionalmente Veja bem, cumpanhero... como bordao, nunca em toda fala. Nao escreva falas de outro personagem. '+
        'Preserve exatamente as unidades, grandezas e relacoes do enunciado; capacidade equivalente a quatro ESCOLAS nao significa quatro ALUNOS. Nao invente quantidade de estudantes, escolas, datas ou valores. '+
        'O comando @debate e apenas convocacao, nao nome de usuario. Tema original: '+content.replace(/(^|\s)@debate\b/gi,'$1').slice(0,1800)+
        '\nUltima fala: '+previous.slice(0,900);
       const answer=bot==='ennea-daimonas' ? (hyron13Math(content,k) ?? await hyron087PersonaReply(bot,[...debateContext.slice(-8),{role:'user',content:instruction+'\nMantenha sua opiniao a menos que explique uma mudanca.',senderId:user.id}],respond)) : await hyron087PersonaReply(bot as 'ennea-daimonas'|'gios-kapetaniou',[...debateContext.slice(-8),{role:'user',content:instruction+'\nUse somente portugues brasileiro. Verifique contas e UNIDADES do enunciado antes de publicar. Se o enunciado disser que uma escola equivale a quatro escolas, nao diga que ela tem quatro alunos. Traga uma objecao NOVA e concreta; nao repita a sua tese anterior.',senderId:user.id}],respond);
       if(!answer||answer.trim()==='[SILENCIO]'){
        unproductive++;debateEndReason='silencio';
        if(unproductive>=3)break;
        continue;
       }
       const clean=answer.trim();
       const sameSpeaker=emittedByBot[bot]||[];
       if(sameSpeaker.some(x=>x.trim().toLowerCase()===clean.toLowerCase())||hyron087Repetitive(clean,sameSpeaker)){
        unproductive++;debateEndReason='repeticao';
        if(unproductive>=3)break;
        continue;
       }
       unproductive=0;
       emitted.push(clean);
       (emittedByBot[bot]??=[]).push(clean);
       lastCreatureBot=bot;
       await env.DB.prepare('INSERT INTO hyron_group_messages(id,group_id,sender_id,content) VALUES(?,?,?,?)')
        .bind(crypto.randomUUID(),id,INTERNO_USERS[bot],clean).run();
       debateContext.push({role:'assistant',content:clean,senderId:INTERNO_USERS[bot]});
      }
      console.info('[HYRON_087_DEBATE]',JSON.stringify({event:'fim',group:id,generated:emitted.length,limit:total,reason:debateEndReason}));
     }else if(caps){
      const debateSlots=Math.max(0,capsBudget-5-emitted.length);
      console.info('[HYRON_CAPS_FECHAMENTO]',JSON.stringify({stage:'debate',budget:capsBudget,initial:emitted.length,remaining:debateSlots}));
      if(debateSlots>0){
       const capsDebateHistory=capsFollowup?history.slice(-28):history.slice(-(emitted.length+1));
       try{await runSurtoDebate(capsDebateHistory,debateSlots,respond,async(bot,answer)=>{
        await env.DB.prepare('INSERT INTO hyron_group_messages(id,group_id,sender_id,content) VALUES(?,?,?,?)')
         .bind(crypto.randomUUID(),id,INTERNO_USERS[bot],answer).run();
        history.push({role:'assistant',content:answer,senderId:INTERNO_USERS[bot]});
       },true);}catch(e){console.error('[HYRON_CAPS_FECHAMENTO] falha_debate',JSON.stringify({error:e instanceof Error?e.name:'unknown'}));}
      }
      // As cinco vagas finais sao reservadas ANTES da primeira resposta.
      // Se a discussao resolver o problema antes do teto, encerra antecipadamente.
      const issue=content.replace(/@CAPS\b/giu,'').trim();
      const finalStatements:{name:string;content:string;valid:boolean}[]=[];
      const knownNames:Record<string,string>={basilisco:'Basilisco',bicuco:'Bicuço','garra-de-prata':'Garra de Prata',bunga:'Bunga'};
      for(const bot of INTERNOS_IDS){
       const name=knownNames[String(bot)]||String(bot);
       const recent=history.slice(-26);
       const finalPrompt='[ENCERRAMENTO CAPS - ARGUMENTO FINAL] Voce e '+name+'. Apresente sua opiniao FINAL em primeira pessoa sobre o PROBLEMA ATUAL; sua ultima oportunidade de contribuir. Explique a solucao que recomenda, ressalvas, riscos e discordancias reais. Nao invente consenso, recursos, votos, fatos ou falas. Nao repita literalmente respostas anteriores. Nao fale em nome do CAPS. @CAPS nao e pessoa. Responda em portugues brasileiro. Preserve sua personalidade. PROBLEMA: '+issue.slice(0,1900);
       let statement:string|null=null;
       try{statement=await respond(bot,[...recent,{role:'user',content:finalPrompt,senderId:user.id}]);}
       catch(e){console.error('[HYRON_CAPS_FECHAMENTO] falha_final',JSON.stringify({bot,error:e instanceof Error?e.name:'unknown'}));}
       const clean=statement?.trim()||'';
       const valid=!!clean&&clean!=='[SILENCIO]'&&!/^nao ha pergunta a responder$/iu.test(clean);
       finalStatements.push({name,content:valid?clean:'',valid});
       if(!valid){console.warn('[HYRON_CAPS_FECHAMENTO] final_ausente',JSON.stringify({bot}));continue;}
       await env.DB.prepare('INSERT INTO hyron_group_messages(id,group_id,sender_id,content) VALUES(?,?,?,?)')
        .bind(crypto.randomUUID(),id,INTERNO_USERS[bot],clean).run();
       history.push({role:'assistant',content:clean,senderId:INTERNO_USERS[bot]});
      }
      // Conta tecnica institucional, sem login possivel; nao confundir com o quinto debatedor.
      const capsInstitutionalId='00000000-0000-4000-8000-00000000ca95';
      await env.DB.prepare("INSERT OR IGNORE INTO users(id,username,password_hash,salt,role) VALUES(?,?,?,?,'user')")
       .bind(capsInstitutionalId,'C.A.P.S.','!CAPS-INSTITUTIONAL-NO-LOGIN!','!CAPS-NO-SALT!').run();
      const evidence=finalStatements.map(x=>x.name+': '+(x.valid?x.content:'[argumento final nao recebido]')).join('\n');
      const letterPrompt='[DOCUMENTO INSTITUCIONAL C.A.P.S. - CARTA ABERTA] Redija a CARTA ABERTA do C.A.P.S. com base SOMENTE nos quatro argumentos finais abaixo. O CAPS e o EMISSOR da carta, nao um quinto debatedor. Nao fabrique consenso ou votos. Se houver divergencia, registre-a. Se nao houver solucao comprovadamente segura, reconheca as incertezas. Nao invente falas, assinaturas ou posicoes de um participante cujo argumento nao foi recebido. Resuma um plano pratico caso haja suporte nas falas. Responda em portugues brasileiro, com titulo, decisao ou encaminhamento, divergencias e assinatura institucional C.A.P.S.\nPROBLEMA: '+issue.slice(0,1600)+'\nARGUMENTOS FINAIS REAIS:\n'+evidence.slice(0,9500);
      let letter='';
      try{letter=(await respond(INTERNOS_IDS[2],[{role:'user',content:letterPrompt,senderId:user.id}]))?.trim()||'';}
      catch(e){console.error('[HYRON_CAPS_FECHAMENTO] falha_carta',JSON.stringify({error:e instanceof Error?e.name:'unknown'}));}
      if(!letter||letter==='[SILENCIO]'){
       letter='CARTA ABERTA DO C.A.P.S.\n\nNao foi possivel sintetizar uma decisao coletiva automaticamente. Registro dos argumentos finais recebidos:\n'+evidence+'\n\nSem consenso institucional comprovado.\n\nC.A.P.S.';
      }
      letter='C.A.P.S. — CARTA ABERTA\n\n'+letter.replace(/^C\.?A\.?P\.?S\.?\s*[—-]\s*CARTA ABERTA\s*/iu,'').trim();
      await env.DB.prepare('INSERT INTO hyron_group_messages(id,group_id,sender_id,content) VALUES(?,?,?,?)')
       .bind(crypto.randomUUID(),id,capsInstitutionalId,letter).run();
      console.info('[HYRON_CAPS_FECHAMENTO]',JSON.stringify({stage:'concluido',budget:capsBudget,finalsReceived:finalStatements.filter(x=>x.valid).length,letter:true}));
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
    }catch(e){console.error('HYRON CAPS/surto indisponivel',e instanceof Error?e.name:'unknown');}
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
