import test from 'node:test';
import assert from 'node:assert/strict';
import { PROVIDERS, providerState, activeProviders, endpointFor, registryStatus, parseModelResponse } from '../src/model-providers.ts';
import { researchUnavailableAnswer } from '../src/research-guard.ts';
import {searchTerms,sourceRelevance,searchWeb,resolveResearchQuestion,safePublicUrl} from '../src/web-access.ts';

test('20 provedores distintos, todos com destino HTTPS fixo e sem URL dinamica insegura',()=>{
 assert.equal(PROVIDERS.length,20);
 assert.equal(new Set(PROVIDERS.map(p=>p.name)).size,20);
 for(const p of PROVIDERS){assert.match(p.endpoint,/^https:\/\//);assert.ok(!p.endpoint.includes('localhost'));}
});
test('14 novos provedores inativos: um segredo API sozinho nao os habilita',()=>{
 assert.equal(PROVIDERS.filter(p=>p.optIn).length,14);
 const n=PROVIDERS.find(p=>p.name==='nvidia');
 assert.equal(providerState({NVIDIA_API_KEY:'key',NVIDIA_MODEL:'model'},n),'disabled');
 const env={NVIDIA_API_KEY:'key',NVIDIA_MODEL:'model',HYRON_ENABLE_NVIDIA:'true'};
 assert.equal(providerState(env,n),'ready');assert.deepEqual(activeProviders(env).map(p=>p.name),['nvidia']);
});
test('provedores existentes seguem ativáveis por suas variáveis atuais',()=>{
 assert.deepEqual(activeProviders({OPENROUTER_API_KEY:'legit'}).map(p=>p.name),['openrouter']);
 assert.deepEqual(activeProviders({GROQ_API_KEY:'legit'}).map(p=>p.name),['groq']);
});
test('Cloudflare AI valida o ID da conta antes de montar endpoint',()=>{
 const cloud=PROVIDERS.find(p=>p.name==='cloudflare-ai');
 const env={CLOUDFLARE_AI_API_KEY:'secret',CLOUDFLARE_AI_MODEL:'@cf/meta/llama-3.1-8b-instruct',HYRON_ENABLE_CLOUDFLARE_AI:'true',CLOUDFLARE_ACCOUNT_ID:'abc'};
 assert.equal(providerState(env,cloud),'invalid-account');assert.throws(()=>endpointFor(env,cloud));
 env.CLOUDFLARE_ACCOUNT_ID='a'.repeat(32);assert.equal(providerState(env,cloud),'ready');
 assert.match(endpointFor(env,cloud),/accounts\/a{32}\/ai\/v1/);
});
test('diagnostico nao devolve chave ou modelo configurado em segredo',()=>{
 const env={GROQ_API_KEY:'SECRETA_NAO_APARECE',GROQ_MODEL:'model-secreto'};
 const status=JSON.stringify(registryStatus(env));assert.ok(!status.includes('SECRETA_NAO_APARECE'));
});
test('parsers OpenAI, Ollama e Cohere',()=>{
 const get=n=>PROVIDERS.find(p=>p.name===n);
 assert.equal(parseModelResponse(get('openrouter'),{choices:[{message:{content:'Olá'},finish_reason:'stop'}],model:'abc'}).answer,'Olá');
 assert.equal(parseModelResponse(get('ollama-cloud'),{message:{content:'Tudo certo'}}).answer,'Tudo certo');
 assert.equal(parseModelResponse(get('cohere'),{message:{content:[{type:'text',text:'Parte 1'},{type:'text',text:'Parte 2'}]},finish_reason:'MAX_TOKENS'}).answer,'Parte 1\nParte 2');
 assert.equal(parseModelResponse(get('cohere'),{message:{content:[{type:'text',text:'Parte 1'}]},finish_reason:'MAX_TOKENS'}).truncated,true);
 assert.equal(parseModelResponse(get('openrouter'),{choices:[{message:{content:''}}]}),null);
});
test('falha na pesquisa nao vira negacao de existencia',()=>{
 const msg=researchUnavailableAnswer('Wikipedia HTTP 403');
 assert.match(msg,/Não consegui verificar/);assert.match(msg,/não significa/);assert.doesNotMatch(msg,/não existe um cantor/);
});
test('variação de grafia Mila/Milla é considerada na relevância',()=>{
 const s={title:'Netinho – Milla',url:'https://netinho.com.br/milla',snippet:'Cantor de axé'};
 assert.ok(sourceRelevance(s,'cantor Netinho música Mila')>=0.52);
});
test('403 no buscador e fontes aleatorias nao afirmam inexistencia',async()=>{
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async url=>String(url).includes('bing.com')?new Response('<rss><channel><item><title>WhatsApp Web</title><link>https://www.whatsapp.com</link><description>Mensagens</description></item></channel></rss>'):
   new Response('Forbidden',{status:403});
  const result=await searchWeb({},'cantor Netinho música Mila');
  assert.equal(result.sources.length,0);assert.equal(result.engine,'indisponível');
  assert.match(researchUnavailableAnswer(result.warning),/Não consegui verificar/);
 }finally{globalThis.fetch=original;}
});
test('recupera o tema da conversa quando usuário pede então pesquise',()=>{
 const query=resolveResearchQuestion('então pesquise na internet',[{role:'user',content:'fale sobre Netinho e a música Milla'},{role:'assistant',content:'não sei'}]);
 assert.match(query,/Netinho/);assert.match(query,/Milla/);
});
test('URLs privadas bloqueadas',()=>{
 for(const input of ['http://localhost','https://[::1]/','http://127.0.0.1:8080','file:///etc/passwd'])assert.equal(safePublicUrl(input),null,input);
});
