// HYRON v0.6.10 Alfa 5 — FreeLLMAPI adaptado: rotas de acesso gratuito controladas.
// Nao instala o gateway FreeLLMAPI original e nao garante limites comerciais.
// BLOQUEIO PREVENTIVO: ativacao requer chave, modelo explicito, autorizacao do plano
// correspondente e allowlist imutavel. Nunca usa modelo default da API.
import type { Provider } from './model-providers.ts';

type SimpleEnv=Record<string,unknown>;
const get=(e:object,k:string)=>String((e as SimpleEnv)[k]??'').trim();
const enabled=(e:object,k:string)=>['true','yes','1'].includes(get(e,k).toLowerCase());
const explicitFree=/^[a-z0-9][a-z0-9._\/-]{1,160}:free$/;
// Provedores removidos intencionalmente: mistral (decisao do projeto) e
// github-models (API encerrada em 30/07/2026). Nenhum recebe fallback oculto.
const allowlists:Record<string,ReadonlySet<string>>={
 groq:new Set(['openai/gpt-oss-20b']),
 gemini:new Set(['gemini-2.5-flash','gemini-2.5-flash-lite','gemini-3.5-flash-lite']),
 'cloudflare-ai':new Set(['@cf/google/gemma-4-26b-a4b-it','@cf/zai-org/glm-4.7-flash','@cf/nvidia/nemotron-3-120b-a12b']),
 cohere:new Set(['command-r7b-12-2024','command-a-03-2025']),
 nvidia:new Set(['nvidia/nemotron-3-ultra-550b-a55b']),
 huggingface:new Set(['openai/gpt-oss-20b','openai/gpt-oss-120b']),
 sambanova:new Set(['gpt-oss-120b']),
};
// Reconhecimento de plano GRATIS deve ser explicito; nao e comprovado por ter chave.
// HF: credito mensal de teste muito pequeno; comprar creditos invalida a garantia R$ 0.
// SambaNova: pagina atual menciona pagamento. Nao habilitar sem comprovacao pessoal
// de cota zero custo ativa e bloqueio de cobranca na conta.
const acknowledgement:Record<string,string>={
 groq:'HYRON_GROQ_FREE_PLAN',
 gemini:'HYRON_FREELLM_ALLOW_GEMINI_FREE_TIER',
 'cloudflare-ai':'HYRON_FREELLM_ALLOW_CLOUDFLARE_FREE_PLAN',
 cohere:'HYRON_FREELLM_ALLOW_COHERE_EVALUATION',
 nvidia:'HYRON_FREELLM_ALLOW_NVIDIA_PROTOTYPE',
 huggingface:'HYRON_FREELLM_ALLOW_HF_MONTHLY_CREDITS',
 sambanova:'HYRON_FREELLM_ALLOW_SAMBANOVA_VERIFIED_ZERO_COST',
};
const supported=new Set(['openrouter',...Object.keys(allowlists)]);
export function freeTierReason(env:object,p:Provider,permittedCsv:string):string {
 const permitted=new Set(permittedCsv.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean));
 if(!permitted.has(p.name))return 'nao incluido em HYRON_FREELLM_PROVIDERS';
 if(p.name==='github-models')return 'GitHub Models encerrado em 30/07/2026';
 if(p.name==='mistral')return 'provedor removido por decisao do projeto';
 if(!supported.has(p.name))return 'perfil gratuito nao verificado para este provedor';
 if(!get(env,p.key))return 'chave nao configurada';
 const selected=get(env,p.model);
 if(!selected)return 'modelo nao definido explicitamente';
 if(p.name==='openrouter')return explicitFree.test(selected)&&!selected.startsWith('openrouter/free')?'ready':'OpenRouter exige ID especifico terminado em :free';
 const flag=acknowledgement[p.name];
 if(!flag||!enabled(env,flag))return 'confirmacao do plano gratuito ausente: '+flag;
 if(!allowlists[p.name].has(selected))return 'modelo nao esta na allowlist validada para o plano';
 if(p.name==='cloudflare-ai' && !/^[0-9a-f]{32}$/i.test(get(env,'CLOUDFLARE_ACCOUNT_ID')))return 'Cloudflare Account ID ausente ou invalido';
 return 'ready';
}
export function freeTierEligible(env:object,p:Provider,permittedCsv:string):boolean {
 return freeTierReason(env,p,permittedCsv)==='ready';
}
export function freeTierDiagnostics(env:object,providers:readonly Provider[],permittedCsv:string){
 const permitted=new Set(permittedCsv.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean));
 return providers.filter(p=>permitted.has(p.name)).map(p=>({provider:p.name,model:get(env,p.model)||null,status:freeTierReason(env,p,permittedCsv)}));
}
