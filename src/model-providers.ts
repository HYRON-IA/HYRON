// HYRON v0.6.8 — 20 provedores com endpoints FIXOS e segregação de credenciais.
// Novos serviços são DESATIVADOS por padrão. Ter uma chave não implica licença de uso gratuito.
// Não usar URLs arbitrárias para não vazar tokens em destinos não confiáveis.
export type ProviderAdapter = 'openai' | 'ollama' | 'cohere';
export type Provider = Readonly<{
 name:string; endpoint:string; key:string; model:string; fallbackModel:string;
 adapter:ProviderAdapter; optIn?:string; accountIdKey?:string;
}>;
const newProvider=(name:string,endpoint:string,key:string,model:string,adapter:ProviderAdapter='openai',accountIdKey?:string):Provider=>({
 name,endpoint,key,model,fallbackModel:'',adapter,optIn:'HYRON_ENABLE_'+name.toUpperCase().replace(/[^A-Z0-9]/g,'_'),accountIdKey
});
export const PROVIDERS:readonly Provider[]=[
 {name:'groq',endpoint:'https://api.groq.com/openai/v1/chat/completions',key:'GROQ_API_KEY',model:'GROQ_MODEL',fallbackModel:'',adapter:'openai',optIn:'HYRON_ENABLE_GROQ'},
 {name:'openrouter',endpoint:'https://openrouter.ai/api/v1/chat/completions',key:'OPENROUTER_API_KEY',model:'OPENROUTER_MODEL',fallbackModel:'openrouter/free',adapter:'openai'},
 {name:'ollama-cloud',endpoint:'https://ollama.com/api/chat',key:'OLLAMA_API_KEY',model:'OLLAMA_MODEL',fallbackModel:'',adapter:'ollama'},
 {name:'cerebras',endpoint:'https://api.cerebras.ai/v1/chat/completions',key:'CEREBRAS_API_KEY',model:'CEREBRAS_MODEL',fallbackModel:'',adapter:'openai'},
 {name:'mistral',endpoint:'https://api.mistral.ai/v1/chat/completions',key:'MISTRAL_API_KEY',model:'MISTRAL_MODEL',fallbackModel:'',adapter:'openai'},
 {name:'gemini',endpoint:'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',key:'GEMINI_API_KEY',model:'GEMINI_MODEL',fallbackModel:'',adapter:'openai'},
 newProvider('unorouter','https://api.unorouter.com/v1/chat/completions','UNOROUTER_API_KEY','UNOROUTER_MODEL'),
 newProvider('nvidia','https://integrate.api.nvidia.com/v1/chat/completions','NVIDIA_API_KEY','NVIDIA_MODEL'),
 newProvider('cloudflare-ai','https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1/chat/completions','CLOUDFLARE_AI_API_KEY','CLOUDFLARE_AI_MODEL','openai','CLOUDFLARE_ACCOUNT_ID'),
 newProvider('huggingface','https://router.huggingface.co/v1/chat/completions','HF_INFERENCE_API_KEY','HF_INFERENCE_MODEL'),
 newProvider('cohere','https://api.cohere.com/v2/chat','COHERE_API_KEY','COHERE_MODEL','cohere'),
 newProvider('vercel','https://ai-gateway.vercel.sh/v1/chat/completions','VERCEL_AI_GATEWAY_API_KEY','VERCEL_AI_GATEWAY_MODEL'),
 newProvider('zai','https://api.z.ai/api/paas/v4/chat/completions','ZAI_API_KEY','ZAI_MODEL'),
 newProvider('siliconflow','https://api.siliconflow.com/v1/chat/completions','SILICONFLOW_API_KEY','SILICONFLOW_MODEL'),
 newProvider('ovhcloud','https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions','OVH_AI_API_KEY','OVH_AI_MODEL'),
 newProvider('github-models','https://models.github.ai/inference/chat/completions','GITHUB_MODELS_API_KEY','GITHUB_MODELS_MODEL'),
 newProvider('sambanova','https://api.sambanova.ai/v1/chat/completions','SAMBANOVA_API_KEY','SAMBANOVA_MODEL'),
 newProvider('fireworks','https://api.fireworks.ai/inference/v1/chat/completions','FIREWORKS_API_KEY','FIREWORKS_MODEL'),
 newProvider('together','https://api.together.xyz/v1/chat/completions','TOGETHER_API_KEY','TOGETHER_MODEL'),
 newProvider('deepinfra','https://api.deepinfra.com/v1/openai/chat/completions','DEEPINFRA_API_KEY','DEEPINFRA_MODEL'),
 newProvider('novita','https://api.novita.ai/openai/v1/chat/completions','NOVITA_API_KEY','NOVITA_MODEL'),
];
export type ProviderState = 'ready'|'missing-key'|'missing-model'|'disabled'|'invalid-account';
const read=(env:object,name:string)=>String((env as Record<string,unknown>)[name]??'').trim();
export function providerState(env:object,p:Provider):ProviderState {
 if(p.optIn && !['true','yes','1'].includes(read(env,p.optIn).toLowerCase()))return 'disabled';
 if(p.name==='groq'&&(read(env,'HYRON_GROQ_FREE_PLAN')!=='true'||read(env,p.model)!=='openai/gpt-oss-20b'))return 'disabled';
 if(!read(env,p.key))return 'missing-key';
 if(p.name==='unorouter' && !/^[a-z0-9][a-z0-9._-]{1,85}:free$/.test(read(env,p.model)))return 'missing-model';
 if(!read(env,p.model)&&!p.fallbackModel)return 'missing-model';
 if(p.accountIdKey&&!/^[0-9a-f]{32}$/i.test(read(env,p.accountIdKey)))return 'invalid-account';
 return 'ready';
}
export function activeProviders(env:object):Provider[]{return PROVIDERS.filter(p=>providerState(env,p)==='ready');}
export function endpointFor(env:object,p:Provider):string {
 if(!p.accountIdKey)return p.endpoint;
 const account=read(env,p.accountIdKey);
 if(!/^[0-9a-f]{32}$/i.test(account))throw Error('Account ID Cloudflare inválido');
 return p.endpoint.replace('{account_id}',account);
}
export function modelFor(env:object,p:Provider):string {const m=read(env,p.model)||p.fallbackModel;if(p.name==='groq'&&(m!=='openai/gpt-oss-20b'||read(env,'HYRON_GROQ_FREE_PLAN')!=='true'))throw Error('Groq: modelo ou plano nao autorizado');if(p.name==='unorouter'&&!/^[a-z0-9][a-z0-9._-]{1,85}:free$/.test(m))throw Error('UnoRouter: modelo nao gratuito recusado');return m;}
export function keyFor(env:object,p:Provider):string {return read(env,p.key);}
export function registryStatus(env:object){return PROVIDERS.map(p=>({name:p.name,state:providerState(env,p),requiresOptIn:Boolean(p.optIn),keyName:p.key,modelName:p.model,enableName:p.optIn||null}));}

// Separar formatos de resposta facilita testes sem chamadas reais às APIs.
export function parseModelResponse(p:Provider,data:unknown):{answer:string;model?:string;truncated:boolean}|null {
 if(!data||typeof data!=='object')return null;
 const d=data as {model?:unknown;message?:{content?:unknown};finish_reason?:unknown;choices?:{finish_reason?:unknown;message?:{content?:unknown}}[]};
 let content:unknown;
 if(p.adapter==='ollama')content=d.message?.content;
 else if(p.adapter==='cohere'){
  const chunks=d.message?.content;
  content=Array.isArray(chunks)?chunks.filter(x=>x&&typeof x==='object'&&x.type==='text'&&typeof x.text==='string').map(x=>x.text).join('\n'):undefined;
 }else{
  content=d.choices?.[0]?.message?.content;
  if(Array.isArray(content)) content=content.filter(x=>x&&typeof x==='object'&&x.type==='text'&&typeof x.text==='string').map(x=>x.text).join('\n');
 }
 if(typeof content!=='string'||!content.trim())return null;
 const answer=content.trim();
 if(/^User Safety:\s*\w+\s*Response Safety:\s*\w+\s*$/i.test(answer))return null;
 return {answer,model:typeof d.model==='string'?d.model:undefined,truncated:p.adapter==='cohere'?d.finish_reason==='MAX_TOKENS':p.adapter==='ollama'?false:d.choices?.[0]?.finish_reason==='length'};
}
