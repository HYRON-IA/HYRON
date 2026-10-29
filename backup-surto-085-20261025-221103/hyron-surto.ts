// HYRON_085_NATURAL_DEBATE_V2: filtra eco de ideias, sem alterar mencoes funcionais.
function debateTerms(s:string):Set<string>{
 const clean=s.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .replace(/@[a-z0-9_]+/g,' ').replace(/[^a-z0-9\s]/g,' ');
 const skip=new Set(['para','como','essa','esse','isso','esta','este','aqui','ainda','sobre','entre','quando','porque','tambem','voce','voces','eles','elas','com','sem','que','uma','uns','dos','das','por','nos','mas','mais','pode','podem','apenas','ser','tem','ter','vai','vou','sou','estou','muito','cada','todo','todos','mesmo']);
 return new Set(clean.split(/\s+/).filter(w=>w.length>=4&&!skip.has(w)));
}
function echoesEarlier(answer:string,context:SurtoMessage[]):boolean{
 const current=debateTerms(answer);
 if(current.size<5)return false;
 return context.filter(m=>m.role==='assistant').slice(-8).some(m=>{
  const prior=debateTerms(m.content);if(prior.size<5)return false;
  const common=[...current].filter(w=>prior.has(w)).length;
  return common/Math.min(current.size,prior.size)>=0.86 && common/Math.max(current.size,prior.size)>=0.65;
 });
}
import { INTERNOS_IDS, INTERNO_USERS, type InternoResponder } from './hyron-internos-runtime';
import type { InternoId } from './hyron-internos';

export type SurtoConfig = { enabled:boolean; interval:number; maxReplies:number; chance:number };
export type SurtoMessage = {role:string; content:string; senderId?:string; senderName?:string|null};
const defaults: SurtoConfig={enabled:false,interval:5,maxReplies:4,chance:50};
const IDS=Object.values(INTERNO_USERS);

/** PATCH integral: nao permite valores arbitrarios nem ativacao acidental. */
export function validateSurtoPatch(raw:Record<string,unknown>):SurtoConfig|null {
 const {enabled,interval,maxReplies,chance}=raw;
 if(typeof enabled!=='boolean'||!Number.isInteger(interval)||!Number.isInteger(maxReplies)||!Number.isInteger(chance))return null;
 if((interval as number)<1||(interval as number)>100||(maxReplies as number)<1||(maxReplies as number)>1000||(chance as number)<0||(chance as number)>100)return null;
 return {enabled,interval:interval as number,maxReplies:maxReplies as number,chance:chance as number};
}
export async function readSurtoConfig(db:D1Database,groupId:string):Promise<SurtoConfig>{
 const row=await db.prepare('SELECT enabled,interval_n AS interval,max_replies AS maxReplies,chance_percent AS chance FROM hyron_surto_settings WHERE group_id=?')
  .bind(groupId).first<{enabled:number;interval:number;maxReplies:number;chance:number}>();
 return row?{enabled:row.enabled===1,interval:row.interval,maxReplies:row.maxReplies,chance:row.chance}:defaults;
}
/** Conta somente mensagens humanas e reserva cada marco N uma unica vez.
 * A reserva atomica impede disparo duplicado quando requisicoes concorrem.
 */
export async function claimSurtoOpportunity(db:D1Database,groupId:string,n:number):Promise<boolean>{
 const ids=IDS.map(()=>'?').join(',');
 const count=await db.prepare(`SELECT COUNT(*) AS amount FROM hyron_group_messages WHERE group_id=? AND sender_id NOT IN (${ids})`)
  .bind(groupId,...IDS).first<{amount:number}>();
 const amount=count?.amount||0;
 if(amount===0||amount%n!==0)return false;
 const milestone=Math.floor(amount/n);
 const result=await db.prepare('INSERT OR IGNORE INTO hyron_surto_claims(group_id,milestone) VALUES(?,?)').bind(groupId,milestone).run();
 return (result.meta?.changes||0)>0;
}
/** Debate opcional, limitado e serializado, com historico atribuido a cada interno. */
export async function runSurtoDebate(
 history:SurtoMessage[], maxReplies:number, respond:InternoResponder,
 publish:(bot:InternoId,answer:string)=>Promise<void>
):Promise<number>{
 let total=0;
 const emitted=new Set<string>();
 const speakers=new Set<InternoId>();
 const participants=[...INTERNOS_IDS].sort(()=>Math.random()-0.5);
 for(let i=0;i<maxReplies;i++){
  // Nao obriga ninguem a responder; tambem pode encerrar a sequencia antes do limite.
  if(i>0&&Math.random()<0.23)break;
  const bot=participants[i%participants.length];
  const context=history.slice(-60);
  // Para a chamada ao provedor, a ultima mensagem deve ser um pedido humano real,
  // e nao uma fala dos personagens transvestida de instrucao de usuario.
  const latestHuman=[...context].reverse().find(x=>x.senderId&&!IDS.includes(x.senderId));
  if(!latestHuman)break;
  const prompt='[SINAL DO SISTEMA HYRON - SURTO COLETIVO]\n'+
   'Voce pode intervir opcionalmente nesta conversa, reagindo ao assunto real mais recente. '+
   'Se houver fala anterior de outro interno, pode concordar, discordar ou continuar o debate, '+
   'sem perder o assunto dos humanos. Nao invente acontecimentos nem transforme falas de internos em fatos. '+
   'Evite repetir conclusoes, bordoes ou planos ja apresentados. Acrescente argumento novo,\n'+
   'uma objecao concreta, uma pergunta relevante ou um detalhe ainda nao discutido.\n'+
   'Mantenha seu jeito de falar; nao se limite a parafrasear colegas.\n'+
   'Preserve mencoes com @ quando estiver explicando os comandos reais do HYRON;\n'+
   'ao conversar naturalmente, use os nomes sem exigir @.\n'+
   'Se nao tiver contribuicao relevante, responda exatamente [SILENCIO].\n'+
   'Ultima mensagem humana: '+latestHuman.content.slice(0,1500)+'\n'+
   'Ultima fala no grupo: '+(context[context.length-1]?.content||'').slice(0,1000);
  const generated=await respond(bot,[...context,{role:'user',content:prompt,senderId:latestHuman.senderId}]);
  if(!generated||generated.trim()==='[SILENCIO]')continue;
  const answer=generated.trim();const norm=answer.toLocaleLowerCase('pt-BR').replace(/\s+/g,' ');
  if(emitted.has(norm)||echoesEarlier(answer,context))continue;
  if(i>0&&!speakers.size)break;
  await publish(bot,answer);
  history.push({role:'assistant',content:answer,senderId:INTERNO_USERS[bot]});
  emitted.add(norm);speakers.add(bot);total++;
 }
 return total;
}
