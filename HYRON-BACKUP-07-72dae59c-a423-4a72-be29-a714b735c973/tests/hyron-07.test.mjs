import {test} from 'node:test';
import assert from 'node:assert/strict';
import {automaticProviders} from '../src/routing-policy.ts';
import {PROVIDERS} from '../src/model-providers.ts';
import {routeCandidates} from '../src/hyron-router-core.ts';
import {providerFailureDetails,chatFailureMessage} from '../public/provider-errors.js';
test('Avaliacao e rotas sem gratuidade verificada ficam fora do automatico',()=>{
 const result=automaticProviders(PROVIDERS);
 for(const name of ['cohere','nvidia','huggingface','sambanova'])assert(!result.some(p=>p.name===name));
 assert(result.some(p=>p.name==='groq'));assert(result.some(p=>p.name==='openrouter'));
});
test('Fallback preserva o mesmo contexto e para no primeiro sucesso',async()=>{
 const messages=[{role:'system',content:'Memoria ficticia: cor cobre'},{role:'user',content:'Mensagem antiga ficticia'},{role:'user',content:'Qual a cor?'}];
 const calls=[];const snapshot=structuredClone(messages);
 const result=await routeCandidates([{name:'groq'},{name:'openrouter'},{name:'cloudflare-ai'}],async p=>{
  calls.push({provider:p.name,messages:structuredClone(messages)});
  return p.name==='groq'?{ok:false,reason:'HTTP 429'}:{ok:true,answer:'cobre'};
 },()=>{});
 assert(result.ok);assert.equal(result.provider.name,'openrouter');assert.equal(calls.length,2);assert.deepEqual(calls[0].messages,calls[1].messages);assert.deepEqual(messages,snapshot);
});
test('Selecao manual falha sem chamar outro provedor e limita tentativas',async()=>{
 const calls=[];const result=await routeCandidates([{name:'cohere'}],async p=>{calls.push(p.name);return {ok:false,reason:'HTTP 503'};},()=>{});
 assert(!result.ok);assert.deepEqual(calls,['cohere']);assert.equal(result.attempts.length,1);
 let count=0;await routeCandidates(Array.from({length:10},(_,i)=>({name:String(i)})),async()=>{count++;throw Error('SEGREDO FICTICIO');},()=>{},99);assert.equal(count,4);
});
test('Erros mostram status sem refletir texto arbitrario ou credenciais',()=>{
 assert.equal(providerFailureDetails([{provider:'nvidia',reason:'serviço temporariamente indisponível (HTTP 503)'}]),'nvidia: serviço temporariamente indisponível (HTTP 503)');
 const message=chatFailureMessage({error:'OUTRO_SEGREDO',attempts:[{provider:'cohere',reason:'SEGREDO <script> HTTP 401'}]});assert(message.includes('HTTP 401'));assert(!message.includes('SEGREDO'));assert(!message.includes('<script>'));
 assert.equal(providerFailureDetails([{provider:'SEGREDO',reason:'HTTP 503'}]),'');
});
