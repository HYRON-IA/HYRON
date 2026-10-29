import type { HumorSettings } from './hyron-humor';
import { applyHyronPostPersonality } from './hyron-post-personality';

export type HybridContext = { hasSources:boolean; webRequested:boolean; backendIdentity:boolean };
export type HybridDebug = { answer:string; changed:boolean; reason:string; engine:'local'|'secondary-ai'|'none'; aiStatus:string };
const requestTease = /\b(me\s+(?:xinga|zoa|zoe|insulta|ofende)|me\s+chama\s+de|me\s+d[eê]\s+(?:uma\s+)?(?:zoada|xingamento|provoca[cç][aã]o)|pode\s+me\s+xingar|tira\s+sarro\s+de\s+mim)\b/i;
const critical = /\b(suic[ií]d|automutil|luto|falec|morreu|viol[eê]ncia|abuso|depress[aã]o|emerg[eê]ncia|hospital|diagn[oó]stico)\b/i;
const protectedTopic = /\b(negros?|ind[ií]genas?|mulheres?|gays?|l[eé]sbicas?|trans|judeus?|mu[cç]ulmanos?|deficientes?|imigrantes?)\b/i;
const technical = /```|\b(json|sql|regex|typescript|javascript|python|powershell|stack\s+trace|exception|api|deploy|script|c[oó]digo|fun[cç][aã]o|compil|arquivo|comando)\b/i;
const refusal = /\b(desculp[ae]|n[aã]o\s+(?:posso|consigo|vou|devo)\s+(?:atender|xingar|insultar|ofender|ajudar))\b/i;
const denyUnsafe = /\b(mate|machuque|ameace|humilhe|odeio|extermine)\b/i;
const forbiddenReply = /https?:\/\/|```|[<>]|\n|\r/;
const random = () => Math.random();
export async function applyHybridHumor(answer:string,userMessage:string,settings:HumorSettings,ctx:HybridContext, opts:{apiKey?:string;model?:string;senseNovaKey?:string;senseNovaModel?:string;mode?:string;excludedInsults?:string[]}):Promise<HybridDebug>{
 const isolated=opts.mode==='sensenova-only';
 const local=()=>{if(isolated)return {answer,changed:false,reason:'isolated-no-local-fallback',engine:'none' as const,aiStatus:'not-used'};const r=applyHyronPostPersonality(answer,userMessage,settings,ctx);return {answer:r.answer,changed:r.changed,reason:r.reason,engine:r.changed?'local' as const:'none' as const,aiStatus:'not-used'};};
 if(settings.level<3||settings.frequency===0||!settings.teasing||ctx.hasSources||ctx.webRequested||ctx.backendIdentity)return local();
 if(critical.test(userMessage)||critical.test(answer)||protectedTopic.test(userMessage)||denyUnsafe.test(userMessage))return local();
 const explicit=requestTease.test(userMessage)||/\bme\s+d[eê]\s+(?:uma\s+)?provoca[cç][aã]o\b/i.test(userMessage);
 const replacement=Boolean(opts.excludedInsults?.length);
 // AI only for explicit friendly roast or short informal reply; never edit technical/factual content.
 if(!explicit&&!replacement&&(answer.length>180||userMessage.length>160||technical.test(answer)||technical.test(userMessage)||refusal.test(answer)))return local();
 if(explicit&&userMessage.length>250)return local();
 if(!explicit&&!replacement&&random()>[0,0.1,0.23,0.4][settings.frequency])return local();
 const senseNova=isolated || Boolean(String(opts.senseNovaKey||'').trim());
 const key=String(senseNova?opts.senseNovaKey:opts.apiKey||'').trim();
 const model=String(senseNova?(opts.senseNovaModel||'sensenova-6.8-flash-lite'):(opts.model||'')).trim();
 if(!key||!model||(!senseNova&&!model.endsWith(':free')))return {...local(),aiStatus:isolated?'missing-sensenova-configuration':'not-configured'};
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),(senseNova ? 30000 : 7500));
 try {
  const res=await fetch(senseNova?'https://token.sensenova.ai/v1/chat/completions':'https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},signal:controller.signal,body:JSON.stringify({model,max_tokens:senseNova?420:110,temperature:0.95,stream:false,...(senseNova?{}:{provider:{max_price:{prompt:0,completion:0,request:0},allow_fallbacks:false}}),messages:[{role:'system',content:'Você escreve APENAS UMA frase curta e original de provocação leve, consentida, com humor ácido brasileiro e palavrões opcionais. Dirija-se ao usuário de forma brincalhona; não faça ataques discriminatórios, ameaças ou humilhação persistente. Não afirme fatos sobre o usuário. Não escreva introduções, listas nem aspas. Máximo 140 caracteres. É proibido mudar fatos, instruções ou código da resposta-base. Evite piadas prontas de compilador, sexta-feira e deploy.'},{role:'user',content:'Pedido do usuário: '+userMessage.slice(0,250)+'\nResposta-base (apenas contexto; não a reescreva): '+(replacement?'A resposta anterior foi rejeitada. Invente uma ideia completamente diferente.':answer.slice(0,300))+'\nEvite estas provocacoes (incluindo variacoes): '+(opts.excludedInsults||[]).map(x=>x.slice(0,160)).join(' | ').slice(0,3300)}]})});
  if(!res.ok)return {...local(),aiStatus:'http-'+res.status};
  const data=await res.json() as {choices?:Array<{message?:{content?:unknown}}>};
  const joke=data.choices?.[0]?.message?.content;
  if(typeof joke!=='string')return {...local(),aiStatus:'invalid'};
  const line=joke.trim().replace(/^["“”]+|["“”]+$/g,'');
  if(!line||line.length>160||forbiddenReply.test(line)||protectedTopic.test(line)||critical.test(line)||denyUnsafe.test(line))return {...local(),aiStatus:'rejected'};
  if(replacement)return {answer:line,changed:true,reason:'repeat-replacement-generated',engine:'secondary-ai',aiStatus:'ok'};
  if(explicit&&refusal.test(answer)&&answer.length<360)return {answer:line,changed:true,reason:'friendly-roast-generated',engine:'secondary-ai',aiStatus:'ok'};
  if(explicit&&!refusal.test(answer)){if(isolated)return {answer:answer.trimEnd()+'\n\n'+line,changed:true,reason:'sensenova-isolated-evaluation',engine:'secondary-ai',aiStatus:'ok'};return {answer:answer,changed:false,reason:'main-model-fulfilled',engine:'none',aiStatus:'not-needed'};}
  return {answer:answer.trimEnd()+'\n\n'+line,changed:true,reason:'short-quip-appended',engine:'secondary-ai',aiStatus:'ok'};
 }catch{return {...local(),aiStatus:'unavailable'};}finally{clearTimeout(timer);}
}
