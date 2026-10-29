// HYRON Alfa 6.4: transport shared by the chat integration candidate and staging.
// Provider selection and free-tier authorization remain the caller's responsibility.
import { endpointFor, keyFor, modelFor, parseModelResponse } from './model-providers.ts';
import type { Provider } from './model-providers.ts';

export type ChatMessage = Readonly<{role:string;content:string}>;
export type ProviderResult =
  | {ok:true;answer:string;provider:string;model:string;truncated:boolean}
  | {ok:false;reason:string};
export type TransportDiagnostic = Readonly<{
  stage:'preparing'|'fetch-in-progress'|'http-response'|'http-failure'|'response-json-failed'|'response-parse-failed'|'done';
  exceptionType:string|null;upstreamHttpStatus:number|null;elapsedMs:number;fetchInvocations:number;
}>;
type Limits = Readonly<{maxTokens?:number;temperature?:number}>;
export type ClientOptions = Limits & Readonly<{
  maxAttempts?:1|2;
  fetchImpl?:typeof fetch;
  wait?:(ms:number)=>Promise<void>;
  onDiagnostic?:(value:TransportDiagnostic)=>void;
}>;
export const PROVIDER_CLIENT_VERSION='alfa68-groq-client-candidate-1';

export function buildProviderRequest(
  provider:Provider,env:object,messages:readonly ChatMessage[],signal:AbortSignal,limits:Limits={},
):{url:string;init:RequestInit;model:string} {
  const model=modelFor(env,provider);
  const ollama=provider.adapter==='ollama';
  const maxTokens=Number.isInteger(limits.maxTokens)
    ?Math.max(1,Math.min(1400,limits.maxTokens!)):1400;
  const temperature=Number.isFinite(limits.temperature)
    ?Math.max(0,Math.min(2,limits.temperature!)):(ollama?0.7:0.6);
  return {
    url:endpointFor(env,provider),model,
    init:{method:'POST',headers:{authorization:`Bearer ${keyFor(env,provider)}`,'content-type':'application/json'},
      body:JSON.stringify({model,messages,stream:false,...(ollama?{options:{temperature}}:provider.name==='groq'?{max_completion_tokens:maxTokens,temperature,reasoning_effort:'low'}:{max_tokens:maxTokens,temperature})}),
      redirect:'manual',signal},
  };
}
function reasonFor(status:number):string {
  if(status===401||status===403)return 'credencial ou permissao recusada (HTTP '+status+')';
  if(status===404)return 'modelo ou endpoint indisponivel (HTTP 404)';
  if(status===429)return 'limite de requisicoes ou cota (HTTP 429)';
  if(status>=300&&status<400)return 'redirecionamento do provedor bloqueado (HTTP '+status+')';
  if(status>=500)return 'servico temporariamente indisponivel (HTTP '+status+')';
  return 'HTTP '+status;
}
function errorType(value:unknown):string {
  const name=value instanceof Error?value.name:'';
  if(name==='AbortError')return 'aborted';
  if(name==='TimeoutError')return 'timeout';
  if(name==='SyntaxError')return 'syntax-error';
  if(name==='TypeError')return 'type-error';
  if(name==='RangeError')return 'range-error';
  return 'other-error';
}
export async function requestProvider(
  provider:Provider,env:object,messages:readonly ChatMessage[],options:ClientOptions={},
):Promise<ProviderResult> {
  const fetchImpl:typeof fetch=options.fetchImpl??((input,init)=>globalThis.fetch(input,init));
  const wait=options.wait??(ms=>new Promise<void>(resolve=>setTimeout(resolve,ms)));
  const limit=options.maxAttempts===1?1:2;
  const started=performance.now();
  let fetchInvocations=0;
  let last='Falha desconhecida';
  for(let attempt=0;attempt<limit;attempt++) {
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),attempt===0?23000:28000);
    let stage:TransportDiagnostic['stage']='preparing';
    let exceptionType:string|null=null;
    let upstreamHttpStatus:number|null=null;
    try {
      let plan:ReturnType<typeof buildProviderRequest>;
      try { plan=buildProviderRequest(provider,env,messages,controller.signal,options); }
      catch(error) {exceptionType=errorType(error);return {ok:false,reason:'Falha de configuracao da requisicao'};}
      stage='fetch-in-progress';
      let response:Response;
      try {fetchInvocations++;response=await fetchImpl(plan.url,plan.init);}
      catch(error) {
        stage='http-failure';exceptionType=errorType(error);
        last=exceptionType==='aborted'||exceptionType==='timeout'?'tempo limite esgotado':'falha de conexao';
        if(attempt+1<limit){await wait(500);continue;}
        return {ok:false,reason:last};
      }
      stage='http-response';upstreamHttpStatus=response.status;
      if(!response.ok) {
        last=reasonFor(response.status);
        if(attempt+1<limit&&[502,503,504].includes(response.status)){await wait(650);continue;}
        return {ok:false,reason:last};
      }
      let data:unknown;
      try {data=await response.json();}
      catch(error) {stage='response-json-failed';exceptionType=errorType(error);return {ok:false,reason:'Resposta do provedor nao e JSON valido'};}
      const decoded=parseModelResponse(provider,data);
      if(!decoded){stage='response-parse-failed';return {ok:false,reason:'Resposta vazia ou nao reconhecida'};}
      stage='done';
      return {ok:true,answer:decoded.answer,provider:provider.name,model:decoded.model||plan.model,truncated:decoded.truncated};
    } finally {
      clearTimeout(timer);
      try {options.onDiagnostic?.({stage,exceptionType,upstreamHttpStatus,elapsedMs:Math.round(performance.now()-started),fetchInvocations});}
      catch { /* Observability must not trigger another request or replace the result. */ }
    }
  }
  return {ok:false,reason:last};
}
