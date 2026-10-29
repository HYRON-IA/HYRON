import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routeCandidates } from '../src/hyron-router-core.ts';

const openrouter = {name:'openrouter'};
const cloudflare = {name:'cloudflare-ai'};
const gemini = {name:'gemini'};
const forbidden = {name:'paid-provider'};

test('a versao e a identidade HYRON estao presentes no Worker',()=>{
 const source=readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
 assert.match(source,/HYRON_ALFA6_IDENTITY/);
 assert.match(source,/HYRON, o assistente virtual do projeto HYRON/);
 assert.match(source,/version:'0.6.10-alpha-6'/);
});

test('falha HTTP 429 simulada cai no segundo provedor autorizado', async () => {
  const called: string[] = [];
  const recorded: string[] = [];
  const result = await routeCandidates([openrouter,cloudflare,gemini], async p => {
    called.push(p.name);
    return p.name === 'openrouter'
      ? {ok:false as const,reason:'limite de requisições ou cota (HTTP 429)'}
      : {ok:true as const,answer:'HYRON operacional',model:'teste',truncated:false};
  },(p,ok)=>recorded.push(p.name+':'+ok),4);
  assert.equal(result.ok,true);
  assert.deepEqual(called,['openrouter','cloudflare-ai']);
  assert.deepEqual(recorded,['openrouter:false','cloudflare-ai:true']);
  assert.deepEqual(result.attempts,[{provider:'openrouter',reason:'limite de requisições ou cota (HTTP 429)'}]);
  if(result.ok){ assert.equal(result.provider.name,'cloudflare-ai'); assert.equal(result.response.answer,'HYRON operacional'); }
  assert.equal(result.attempts.length > 0,true); // fallbackOccurred na resposta real
});

test('resposta imediata nao aciona fallback', async () => {
  const called: string[] = [];
  const result = await routeCandidates([gemini,openrouter], async p => {
    called.push(p.name);
    return {ok:true as const,answer:'OK'};
  },()=>{});
  assert.deepEqual(called,['gemini']);
  assert.deepEqual(result.attempts,[]);
  assert.equal(result.ok,true);
});

test('falha de todos nao inventa resposta', async () => {
  const result = await routeCandidates([gemini,openrouter],async p=>({ok:false as const,reason:p.name+' recusou'}),()=>{});
  assert.equal(result.ok,false);
  assert.deepEqual(result.attempts,[{provider:'gemini',reason:'gemini recusou'},{provider:'openrouter',reason:'openrouter recusou'}]);
});

test('somente a lista autorizada e tentada, sem fallback externo', async () => {
  const called:string[]=[];
  const result=await routeCandidates([gemini],async p=>{
    called.push(p.name);
    return {ok:false as const,reason:'HTTP 404'};
  },()=>{});
  assert.equal(result.ok,false);
  assert.deepEqual(called,['gemini']);
  assert.ok(!called.includes(forbidden.name));
});

test('maximo de quatro tentativas',async()=>{
 const ps=Array.from({length:7},(_,i)=>({name:'p'+i}));
 const called:string[]=[];
 const result=await routeCandidates(ps,async p=>{called.push(p.name);return {ok:false as const,reason:'HTTP 503'};},()=>{},999);
 assert.equal(result.ok,false);assert.equal(called.length,4);assert.equal(result.attempts.length,4);
});

test('excecao nao vaza detalhe sensivel e permite fallback',async()=>{
 const result=await routeCandidates([gemini,cloudflare],async p=>{
  if(p.name==='gemini')throw new Error('secret=NAO_DIVULGAR');
  return {ok:true as const,answer:'OK'};
 },()=>{});
 assert.equal(result.ok,true);
 assert.deepEqual(result.attempts,[{provider:'gemini',reason:'falha interna do provedor'}]);
 assert.doesNotMatch(JSON.stringify(result),/NAO_DIVULGAR/);
});
