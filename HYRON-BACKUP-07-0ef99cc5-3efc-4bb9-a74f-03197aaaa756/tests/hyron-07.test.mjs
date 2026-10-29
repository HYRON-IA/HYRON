import {test} from 'node:test';
import assert from 'node:assert/strict';
import {automaticProviders} from '../src/routing-policy.ts';
import {PROVIDERS} from '../src/model-providers.ts';
import {routeCandidates} from '../src/hyron-router-core.ts';
import {providerFailureDetails,chatFailureMessage} from '../public/provider-errors.js';
import {normalizePrefs,themeTokens,contrast,preferenceKey} from '../public/theme-model.js';
test('Temas validam cores, isolam a chave por conta e mantem contraste dos textos',()=>{
 const invalid=normalizePrefs({theme:'__proto__',accent:'url(https://invalid)',icon:'<svg>',background:'url(x)',angle:Infinity});assert.equal(invalid.theme,'hydra');assert.equal(invalid.background,'theme');assert.equal(invalid.icon,'#78e6cd');assert.notEqual(preferenceKey('A'),preferenceKey('B'));assert.throws(()=>preferenceKey(''));
 for(const theme of ['light','dark','hydra'])for(const accent of ['#ffffff','#000000','#ffff00','#ff0088']){const t=themeTokens({theme,accent,icon:accent});assert(contrast(t['--hy-accent-text'],t['--hy-surface'])>=4.5);assert(contrast(t['--hy-button-text'],accent)>=4.5);assert.equal(t['--hy-icon'],accent);}
});
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
