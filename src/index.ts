interface Env {
  GROQ_API_KEY?: string; OPENROUTER_API_KEY?: string; OLLAMA_API_KEY?: string;
  GROQ_MODEL?: string; OPENROUTER_MODEL?: string; OLLAMA_MODEL?: string;
  HYRON_ACCESS_KEY?: string; ASSETS: Fetcher;
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
export default {async fetch(request:Request,env:Env):Promise<Response>{
  const url=new URL(request.url);
  if(url.pathname!=='/api/chat'&&url.pathname!=='/api/status')return env.ASSETS.fetch(request);
  if(request.method!==(url.pathname==='/api/status'?'GET':'POST'))return json({error:'Método não permitido'},405);
  const origin=request.headers.get('origin');if(origin&&origin!==url.origin)return json({error:'Origem não autorizada'},403);
  if(env.HYRON_ACCESS_KEY&&request.headers.get('x-hyron-key')!==env.HYRON_ACCESS_KEY)return json({error:'Acesso não autorizado'},401);
  if(url.pathname==='/api/status')return json({version:'0.2.0',configuredProviders:active(env).map(p=>p.name),note:'Configurado não significa que a cota esteja disponível.'});
  if(Number(request.headers.get('content-length')||0)>25000)return json({error:'Requisição muito grande'},413);
  let data:unknown;try{data=await request.json();}catch{return json({error:'JSON inválido'},400);}
  if(!data||typeof data!=='object')return json({error:'Entrada inválida'},400);
  const input=(data as {messages?:unknown;preferredProvider?:unknown});
  if(!Array.isArray(input.messages)||input.messages.length<1||input.messages.length>20||!input.messages.every(isMessage))return json({error:'Envie de 1 a 20 mensagens válidas'},400);
  const messages=input.messages as Message[];if(messages.at(-1)?.role!=='user')return json({error:'A última mensagem deve ser do usuário'},400);
  if(input.preferredProvider!==undefined&&typeof input.preferredProvider!=='string')return json({error:'Provedor inválido'},400);
  const available=active(env);if(!available.length)return json({error:'Nenhum provedor configurado. Adicione chaves em Variables and Secrets.'},503);
  const preferred=input.preferredProvider;const ordered=preferred? [...available.filter(p=>p.name===preferred),...available.filter(p=>p.name!==preferred)]:available;
  const payload=[{role:'system',content:PERSONALITY},...messages];const attempts:{provider:string;reason:string}[]=[];
  for(const p of ordered){const result=await requestProvider(p,env,payload);if(result.ok)return json({answer:result.answer,provider:result.provider,model:result.model,attempts:attempts.length});attempts.push({provider:p.name,reason:result.reason});}
  return json({error:'Nenhum provedor respondeu. Verifique chaves, modelos e cotas gratuitas.',attempts},503);
}};
