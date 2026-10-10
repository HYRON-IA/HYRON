interface Env {
  GROQ_API_KEY?: string; OPENROUTER_API_KEY?: string; OLLAMA_API_KEY?: string;
  GROQ_MODEL?: string; OPENROUTER_MODEL?: string; OLLAMA_MODEL?: string;
  HYRON_ACCESS_KEY?: string; DB: D1Database; ASSETS: Fetcher;
}
type Message = {role:'user'|'assistant'; content:string};
type Provider = {name:string; endpoint:string; key:keyof Env; model:keyof Env; fallbackModel:string};
const PERSONALITY = `Você é HYRON (Hybrid Yielding Reasoning & Orchestration Network), assistente brasileiro inteligente, proativo, bem-humorado e moderadamente sarcástico. Responda em português do Brasil, salvo solicitação contrária. Seja útil e direto. Nunca invente fatos, pesquisas, ações ou capacidades. Seja respeitoso e peça permissão antes de ações externas.`;
// Cada provedor exige chave própria e pode impor limites gratuitos diferentes.
const PROVIDERS: Provider[] = [
  {name:'groq', endpoint:'https://api.groq.com/openai/v1/chat/completions', key:'GROQ_API_KEY', model:'GROQ_MODEL', fallbackModel:'llama-3.3-70b-versatile'},
  {name:'openrouter', endpoint:'https://openrouter.ai/api/v1/chat/completions', key:'OPENROUTER_API_KEY', model:'OPENROUTER_MODEL', fallbackModel:'openrouter/free'},
  {name:'ollama-cloud', endpoint:'https://ollama.com/api/chat', key:'OLLAMA_API_KEY', model:'OLLAMA_MODEL', fallbackModel:''}
];
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
function active(env:Env){return PROVIDERS.filter(p=>typeof env[p.key]==='string' && String(env[p.key]).trim() && (p.name!=='ollama-cloud'||String(env.OLLAMA_MODEL||'').trim()));}
function isMessage(m:unknown):m is Message {if(!m||typeof m!=='object')return false;const x=m as Record<string,unknown>;return (x.role==='user'||x.role==='assistant')&&typeof x.content==='string'&&x.content.trim().length>0&&x.content.length<=4000;}
async function requestProvider(p:Provider,env:Env,messages:{role:string;content:string}[]){
  const key=String(env[p.key]);const model=String(env[p.model]||p.fallbackModel);
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),20000);
  try {
    const isOllama=p.name==='ollama-cloud';
    const response=await fetch(p.endpoint,{method:'POST',headers:{'authorization':`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({model,messages,stream:false,...(isOllama?{options:{temperature:0.7}}:{max_tokens:900,temperature:0.7})}),signal:controller.signal});
    if(!response.ok)return {ok:false as const,reason:`HTTP ${response.status}`,retryable:[408,429,500,502,503,504].includes(response.status)};
    const data=await response.json() as {choices?:Array<{message?:{content?:unknown}}> ;message?:{content?:unknown}};
    const answer=isOllama?data.message?.content:data.choices?.[0]?.message?.content;
    if(typeof answer!=='string'||!answer.trim())return {ok:false as const,reason:'resposta vazia',retryable:true};
    return {ok:true as const,answer:answer.trim(),provider:p.name,model};
  }catch{return {ok:false as const,reason:'tempo esgotado ou conexão indisponível',retryable:true};}
  finally{clearTimeout(timeout);}
}
type StoredMessage = {role:'user'|'assistant';content:string};
async function tokenHash(token:string):Promise<string>{const data=new TextEncoder().encode(token);return [...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function validId(id:unknown):id is string{return typeof id==='string'&&/^[0-9a-f-]{36}$/i.test(id);}
function validToken(t: string | null): t is string {
  return typeof t === 'string' && /^[a-f0-9]{64}$/i.test(t);
}
async function getConversation(env:Env,id:string,token:string){return env.DB.prepare('SELECT id,title FROM conversations WHERE id=? AND token_hash=?').bind(id,await tokenHash(token)).first<{id:string;title:string}>();}
async function readMessages(env:Env,id:string){return (await env.DB.prepare('SELECT role,content FROM messages WHERE conversation_id=? ORDER BY id ASC').bind(id).all<StoredMessage>()).results;}
export default {async fetch(request:Request,env:Env):Promise<Response>{
  const url=new URL(request.url);
  if(!['/api/chat','/api/status','/api/history'].includes(url.pathname))return env.ASSETS.fetch(request);
  const origin=request.headers.get('origin');if(origin&&origin!==url.origin)return json({error:'Origem não autorizada'},403);
  if(env.HYRON_ACCESS_KEY&&request.headers.get('x-hyron-key')!==env.HYRON_ACCESS_KEY)return json({error:'Acesso não autorizado'},401);
  if(url.pathname==='/api/status'){
    if(request.method!=='GET')return json({error:'Método não permitido'},405);
    return json({version:'0.3.0',configuredProviders:active(env).map(p=>p.name),history:true});
  }
  const id=url.pathname==='/api/history'?url.searchParams.get('id'):null;
  const token=request.headers.get('x-hyron-conversation-token');
  if(url.pathname==='/api/history'){
    if(!validId(id)||!validToken(token))return json({error:'Identificador de conversa inválido'},400);
    try{
      const found=await getConversation(env,id,token);
      if(!found)return json({error:'Conversa não encontrada'},404);
      if(request.method==='GET')return json({title:found.title,messages:await readMessages(env,id)});
      if(request.method==='DELETE'){await env.DB.prepare('DELETE FROM conversations WHERE id=? AND token_hash=?').bind(id,await tokenHash(token)).run();return json({deleted:true});}
      return json({error:'Método não permitido'},405);
    }catch{return json({error:'Banco D1 indisponível ou migração pendente'},503);}
  }
  if(request.method!=='POST')return json({error:'Método não permitido'},405);
  if(Number(request.headers.get('content-length')||0)>12000)return json({error:'Requisição muito grande'},413);
  let data:unknown;try{data=await request.json();}catch{return json({error:'JSON inválido'},400);}
  if(!data||typeof data!=='object')return json({error:'Entrada inválida'},400);
  const input=data as {content?:unknown;preferredProvider?:unknown;conversationId?:unknown};
  if(typeof input.content!=='string'||!input.content.trim()||input.content.length>4000)return json({error:'Mensagem inválida (máximo 4000 caracteres)'},400);
  if(!validId(input.conversationId)||!validToken(token))return json({error:'Identificador ou token de conversa inválido'},400);
  if(input.preferredProvider!==undefined&&typeof input.preferredProvider!=='string')return json({error:'Provedor inválido'},400);
  if (!validToken(token)) {
  return json(
    { error: 'Token de conversa inválido ou ausente' },
    400
  );
}
  let messages:StoredMessage[];
  try{
    const hash=await tokenHash(token);
    const existing=await env.DB.prepare('SELECT id FROM conversations WHERE id=?').bind(input.conversationId).first();
    if(existing){if(!await getConversation(env,input.conversationId,token))return json({error:'Acesso à conversa negado'},403);}
    else await env.DB.prepare('INSERT INTO conversations(id,token_hash,title) VALUES(?,?,?)').bind(input.conversationId,hash,input.content.trim().slice(0,80)).run();
    // Salva a pergunta antes de consultar os provedores: nenhuma pergunta é perdida por falha na LLM.
    await env.DB.prepare('INSERT INTO messages(conversation_id,role,content) VALUES(?,?,?)').bind(input.conversationId,'user',input.content.trim()).run();
    messages=(await readMessages(env,input.conversationId)).slice(-19);
  }catch{return json({error:'Banco D1 indisponível ou migração pendente'},503);}
  const available=active(env);if(!available.length)return json({error:'Nenhum provedor configurado. Adicione chaves em Variables and Secrets.'},503);
  const preferred=input.preferredProvider;const ordered=preferred? [...available.filter(p=>p.name===preferred),...available.filter(p=>p.name!==preferred)]:available;
  const payload=[{role:'system',content:PERSONALITY},...messages];const attempts:{provider:string;reason:string}[]=[];
  for(const p of ordered){const result=await requestProvider(p,env,payload);if(result.ok){try{await env.DB.prepare('INSERT INTO messages(conversation_id,role,content) VALUES(?,?,?)').bind(input.conversationId,'assistant',result.answer).run();}catch{return json({error:'Resposta gerada, mas não foi possível salvar o histórico. Tente novamente.'},503);}return json({answer:result.answer,provider:result.provider,model:result.model,attempts:attempts.length});}attempts.push({provider:p.name,reason:result.reason});}
  return json({error:'Nenhum provedor respondeu. Verifique chaves, modelos e cotas gratuitas.',attempts},503);
}};
