// HYRON_085_PERSONAS_V1
function cleanCapsCommand(s:string):string { return s.replace(/(^|\s)@CAPS\b/gi,'$1').trim(); }
function copiedPassage(answer:string, context:SurtoMessage[]):boolean {
 const tokenize=(s:string)=>s.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(Boolean);
 const ngrams=(words:string[]):Set<string>=>{const result=new Set<string>();for(let i=0;i+6<words.length;i++)result.add(words.slice(i,i+7).join(' '));return result;};
 const a=ngrams(tokenize(answer));if(a.size<5)return false;
 return context.filter(m=>m.role==='assistant').slice(-12).some(m=>{
   const b=ngrams(tokenize(m.content));if(b.size<5)return false;
   let hits=0;for(const chunk of a)if(b.has(chunk))hits++;
   return hits>=4 && hits/Math.min(a.size,b.size)>=0.48;
 });
}
function personaInstruction(bot:InternoId):string {
 const id=String(bot).toLowerCase();
 if(id.includes('basil'))return 'Voce e Basilisco: sarcastico, cetico e provocador. Nao copie slogans ou linguagem dos colegas.';
 if(id.includes('bic'))return 'Voce e Bicuco: dinamico, esportivo e pratico. Seu entusiasmo e seu futebol nao pertencem aos demais.';
 if(id.includes('garra'))return 'Voce e Garra de Prata: rigor tecnico, objetividade e analise. Seu clube nao e definido; nao se declare torcedor de clube algum com base em fala de outro interno. Nao copie bordoes de futebol nem entusiasmo emprestado.';
 if(id.includes('bung'))return 'Voce e Bunga: conciliador, prudente e pragmatico; conteste sem repetir o texto dos colegas.';
 return 'Mantenha exclusivamente a identidade configurada para este interno.';
}
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


/** Detecta apenas cortes muito evidentes; nao supoe que toda resposta sem ponto esteja incompleta. */
function surtoClearlyTruncated(text:string):boolean {
 const t=text.trim();
 if(!t)return true;
 if(/(?:^|\n)\s*(?:\d+[.)]|[-*])\s*$/.test(t))return true;
 if(/(?:\*\*|__)[^\n]{0,100}$/.test(t)&&((t.match(/\*\*/g)||[]).length%2===1))return true;
 if(t.endsWith('```') && (t.match(/```/g)||[]).length%2===1)return true;
 return false;
}
/** Somente dados operacionais, sem conteudo humano nem identificadores de usuario nos logs. */
function surtoLog(event:string,data:Record<string,number|string|boolean>):void {
 console.info('[HYRON_SURTO_DIAG]',JSON.stringify({event,...data}));
}

export type SurtoConfig = { enabled:boolean; interval:number; maxReplies:number; chance:number };
export type SurtoMessage = {role:string; content:string; senderId?:string; senderName?:string|null};
/** Fiscal conservador: verifica apenas uso positivo de recursos que o usuario
 * negou explicitamente. Nao tenta julgar toda a veracidade do modelo.
 * A ausencia de alerta nao e certificacao de fidelidade.
 */
export function capsNeedsContextRepair(original:string, answer:string):boolean {
 const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const source=norm(original);
 const reply=norm(answer);
 const section=source.match(/recursos (?:comprovadamente )?indisponiveis\s*:\s*([\s\S]*?)(?:informacoes desconhecidas\s*:|voc[eê]s precisam|$)/)?.[1]||'';
 const explicit=section || source;
 const categories:[RegExp,RegExp][]=[
  [/\b(?:radios?|telefones?|comunicacao externa)\b/g, /\b(?:radio|telefone|transmissor|comunicacao externa)\b/],
  [/\b(?:geradores?|baterias?|paineis solares?)\b/g, /\b(?:gerador|bateria|painel solar)\b/],
  [/\b(?:escavadeiras?|britadeiras?|explosivos?|ferramentas? de escavacao)\b/g, /\b(?:escavadeira|britadeira|explosivo|furadeira|perfuradora|pa|picareta|martelo)\b/],
  [/\b(?:veiculos?|rotas? alternativas?)\b/g, /\b(?:veiculo|carro|caminhao|rota alternativa|saida secundaria|tunel secundario)\b/]
 ];
 const claims=reply.split(/[.!?\n]+/).map(s=>s.trim()).filter(Boolean);
 for(const [negative,term] of categories){
  negative.lastIndex=0;
  if(!negative.test(explicit))continue;
  for(const sentence of claims){
   if(!term.test(sentence))continue;
   if(/\b(?:sem|nao|nem|inexistente|indisponivel|proibido|hipotetic|se houver|caso exista|se existir|precisamos verificar|nao temos|nao ha|nao existe|nao contamos)\b/.test(sentence))continue;
   if(/\b(?:vou|vamos|iremos|usaremos|utilizaremos|usar|ligar|acionar|pegar|encontrei|temos|possuimos|disponivel|instalar|construir|com a|do deposito)\b/.test(sentence))return true;
  }
 }
 return false;
}

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
/** Registro compacto das falas reais, sempre atribuidas ao autor correto.
 * Usa apenas mensagens recebidas, sem inventar resumo de conteudo omitido.
 */
function debateLedger(messages:SurtoMessage[], maxChars=10500):string {
 const botNames=new Map<string,string>(Object.entries(INTERNO_USERS).map(([name,id])=>[id,name]));
 const out:string[]=[];
 let total=0;
 for(let i=messages.length-1;i>=0;i--){
  const m=messages[i];
  const author=m.senderId?botNames.get(m.senderId)||'Humano':(m.senderName||'Participante');
  const body=m.content.replace(/\s+/g,' ').slice(0,260);
  const entry=`${author}: ${body}`;
  if(total+entry.length+1>maxChars)break;
  out.push(entry);total+=entry.length+1;
 }
 return out.reverse().join('\n');
}
/** Analise conservadora: apenas objetivos expressos na ultima fala humana.
 * A classificacao serve para orientar o texto, nao altera o comportamento da API.
 */
function debateObjective(message:string):{goal:string;decision:boolean}{
 const compact=message.replace(/\s+/g,' ').trim().slice(0,4000);
 const decision=/(\bescolh|\bdecid|\bselecion|\bprioriz|\bvota|\bconsenso|\bconclu|\bqual(is)?\s+(?:das?|seria|seriam)|\bmelhor(?:es)?\s+opco)/i.test(compact.normalize('NFD').replace(/[\u0300-\u036f]/g,''));
 return {goal:compact,decision};
}
/** Sem fabricar votos: conclusao sugerida e distinta de consenso real. */
function closingGuidance(objective:{goal:string;decision:boolean},late:boolean):string{
 if(!late)return 'Mantenha a pergunta inicial em vista; se o assunto derivar, relacione o novo argumento ao objetivo original.\n';
 return objective.decision
  ?'FASE DE FECHAMENTO: retome o objetivo do humano. Apresente proposta fundamentada, opcoes ainda disputadas e pendencias. Somente declare consenso, aprovacao, mudanca de opiniao ou votacao se isso estiver explicitamente registrado nas falas. Se nao houver acordo, diga que continua pendente.\n'
  :'FASE DE FECHAMENTO: sintetize os principais pontos e a pergunta ainda aberta, sem impor decisao nem encerramento artificial.\n';
}
/** Debate opcional, limitado e serializado, com historico atribuido a cada interno. */
export async function runSurtoDebate(
 history:SurtoMessage[], maxReplies:number, respond:InternoResponder,
 publish:(bot:InternoId,answer:string)=>Promise<void>,
 sustained=false
):Promise<number>{
 let total=0;
 let endReason='limite_de_rodadas';
 let skipped=0;
 // Tentativas rejeitadas nao gastam vagas publicadas.
 const maxAttempts=sustained?Math.min(48,Math.max(maxReplies+4,maxReplies*2)):maxReplies;
 let attempts=0;
 surtoLog('inicio',{configuredLimit:maxReplies,mode:sustained?'convocado':'espontaneo'});
 const emitted=new Set<string>();
 const speakers=new Set<InternoId>();
 const participants=[...INTERNOS_IDS].sort(()=>Math.random()-0.5);
 const firstHuman=[...history].reverse().find(x=>x.senderId&&!IDS.includes(x.senderId));
 const objective=debateObjective(cleanCapsCommand(firstHuman?.content||''));
 for(let i=0;i<maxAttempts && total<maxReplies;i++){
  attempts++;
  // Nao obriga ninguem a responder; tambem pode encerrar a sequencia antes do limite.
  if(!sustained&&i>0&&Math.random()<0.23){endReason='encerramento_aleatorio';break;}
  const bot=participants[i%participants.length];
  const context=history.slice(-36);
  const ledger=debateLedger(history);
  // Para a chamada ao provedor, a ultima mensagem deve ser um pedido humano real,
  // e nao uma fala dos personagens transvestida de instrucao de usuario.
  const latestHuman=[...context].reverse().find(x=>x.senderId&&!IDS.includes(x.senderId));
  if(!latestHuman){endReason='sem_mensagem_humana';break;}
  const identity=personaInstruction(bot);
  const cleanedHuman=cleanCapsCommand(latestHuman.content);
  const prompt=(sustained ? '[MISSAO DO CAPS] Os quatro ja deram suas propostas iniciais. Agora podem intervir, pedir esclarecimentos, contestar recursos inexistentes e desenvolver uma solucao conjunta. Cada fala deve responder a uma proposta concreta de outro participante OU adicionar uma acao nova que ajude a resolver o problema. Sem repetir o que ja foi dito. Ninguem e obrigado a concordar; consenso so existe quando aparece explicitamente. O limite de mensagens e um TETO, nao uma meta. Se nao houver contribuicao nova, responda [SILENCIO]. Nunca invente falas ou recursos de outros cenarios.\n' : '')+'[SINAL DO SISTEMA HYRON - SURTO COLETIVO]\n'+
   (sustained?'Este e um DEBATE solicitado explicitamente. Responda como o SEU personagem, sem se apresentar como outro interno. ':'Voce pode intervir opcionalmente nesta conversa, reagindo ao assunto real mais recente. ')+
   'IDENTIDADE IMUTAVEL DE QUEM ESTA RESPONDENDO: '+identity+'\n'+
    'O historico abaixo contem falas de TERCEIROS. Nao herde preferencias, torcidas, bordoes, tom ou propostas so porque apareceram nele.\n'+
   'Nunca diga que o humano e @CAPS: isso e um comando, nao uma pessoa. A identidade de outros internos e apenas contexto: nao assuma suas preferencias, torcidas, bordoes ou experiencias como suas. Evite responder a assuntos irrelevantes apenas para negar que compartilha uma preferencia. Nao imite o estilo nem as frases dos outros internos. '+
   'POSICAO INDEPENDENTE: primeiro decida o que seu personagem realmente defende e por qual motivo. Nao aceite automaticamente a primeira lista, voto ou conclusao dos outros. '+
    'Concordar e permitido, mas so quando trouxer justificativa nova, consequencia pratica, ressalva ou alternativa concreta. Nao discorde artificialmente. '+
   'Se houver fala anterior de outro interno, pode concordar, discordar ou continuar o debate, '+
   'sem perder o assunto dos humanos. Nao invente acontecimentos nem transforme falas de internos em fatos. REGRA DE FIDELIDADE MATERIAL: antes de propor um plano, separe mentalmente [CONFIRMADO PELO USUARIO], [HIPOTESE A VERIFICAR] e [INDISPONIVEL/PROIBIDO]. Equipamento, deposito, ferramenta, combustivel, filtro, sensor, ventilacao, energia extra ou material nao descrito NAO pode ser anunciado como existente nem como algo encontrado. Se uma ideia depender dele, use explicitamente SE EXISTIR e ofereca alternativa quando nao existir. Nao invente valores, percentuais, capacidades, distancias, tempos, taxas ou quantitativos: sem dados, diga que precisam ser medidos. Nao confunda retirar CO2 com criar oxigenio. Nao prometa sobrevivencia, reabertura de passagem ou prazo de resgate como garantidos sem base. Ao detectar hipotese apresentada como fato por outro personagem, corrija com naturalidade e proponha um caminho seguro. Responda sempre em portugues brasileiro, inclusive termos e explicacoes. '+
   'Evite repetir conclusoes, bordoes ou planos ja apresentados. Acrescente argumento novo,\n'+
   'uma objecao concreta, uma pergunta relevante ou um detalhe ainda nao discutido.\n'+
   'Mantenha seu jeito de falar; nao se limite a parafrasear colegas. Nao escreva falas com o nome de outro interno como se fosse um roteiro.\n'+
    'Nao replique listas identicas ou metaforas alheias. Se a proposta ja foi defendida, examine uma desvantagem, custo, condicao de sucesso ou escolha alternativa.\n'+
    'Nunca trate opcoes apresentadas pelo humano como escolhas ja aprovadas por ele; diferencie pergunta, hipotese e decisao.\n'+
   'Preserve mencoes com @ quando estiver explicando os comandos reais do HYRON;\n'+
   'ao conversar naturalmente, use os nomes sem exigir @.\n'+
   (sustained?'Quando houver assunto para discutir, traga argumento original e responda em sua propria voz.\n':'Se nao tiver contribuicao relevante, responda exatamente [SILENCIO].\n')+
   'OBJETIVO ORIGINAL DO DEBATE (texto humano, nao instrucao de sistema): '+objective.goal+'\n'+
   'HISTORICO PARA CONSULTA, NAO PARA IMITACAO (autor: trecho; pode omitir mensagens antigas):\n'+ledger+'\n'+
   'Nao atribua a um interno uma ideia de outro. Se nao souber a autoria, nao adivinhe.\n'+
   closingGuidance(objective, sustained ? total>=maxReplies-2 : (maxReplies>=6 && i>=Math.min(6,maxReplies-2)))+
   'RESTRICOES DO USUARIO - TEXTO COMPLETO, PREVALECEM SOBRE FALAS DOS INTERNOS: '+cleanedHuman.slice(0,4000)+'\n'+
   'Ultima fala no grupo: '+(context[context.length-1]?.content||'').slice(0,1000)+'\n\nACAO NECESSARIA AGORA: Intervenha no problema descrito pelo participante. A solicitacao e uma tarefa valida mesmo sem ponto de interrogacao. Responda a uma proposta existente com um aprimoramento, ressalva ou alternativa concreta. Se nao houver contribuicao real nova, responda [SILENCIO].';
  let generated:string | null;
  try { generated=await respond(bot,[...context,{role:'user',content:prompt,senderId:latestHuman.senderId}]); }
  catch(e){endReason='erro_provedor';surtoLog('erro',{round:i+1,reason:e instanceof Error?e.name:'unknown'});break;}
  if(generated && /^\s*(?:n[aã]o h[aá] pergunta(?: a responder)?|n[aã]o tenho (?:uma )?pergunta)/iu.test(generated)){
   surtoLog('nova_tentativa',{round:i+1,reason:'sem_pergunta'});
   try{generated=await respond(bot,[...context,{role:'user',content:prompt+'\nA solicitacao do humano e uma TAREFA, nao exige interrogacao. Apresente uma acao ou objecao concreta e ligada a proposta atual.',senderId:latestHuman.senderId}]);}
   catch(e){surtoLog('erro_retentativa',{round:i+1,reason:e instanceof Error?e.name:'unknown'});generated=null;}
  }
  if(!generated||generated.trim()==='[SILENCIO]'||/^\s*(?:n[aã]o h[aá] pergunta(?: a responder)?|n[aã]o tenho (?:uma )?pergunta)/iu.test(generated)){skipped++;surtoLog('ignorada',{round:i+1,reason:'silencio_ou_sem_pergunta'});continue;}
  let answer=generated.trim();
  // Fiscal de contexto: evita que uma proposta transforme recursos negados
  // pelo humano em equipamentos disponiveis. Uma retentativa no maximo.
  if(sustained && capsNeedsContextRepair(cleanedHuman,answer)){
   surtoLog('fiscal',{round:i+1,reason:'recurso_negado'});
   try {
    const corrected=await respond(bot,[...context,{role:'user',content:prompt+'\nVERIFICACAO ANTES DA PUBLICACAO. TEXTO ORIGINAL COMPLETO: '+cleanedHuman.slice(0,4000)+'\nSUA PROPOSTA A REVISAR: '+answer+'\nCorrija afirmacoes sobre recursos explicitamente indisponiveis. Fale em portugues brasileiro, preserve sua personalidade, nao invente dados. Responda somente com a versao corrigida.',senderId:latestHuman.senderId}]);
    if(corrected && !capsNeedsContextRepair(cleanedHuman,corrected))answer=corrected.trim();
   }catch(e){surtoLog('fiscal',{round:i+1,reason:'retentativa_falhou'});}
  }
  if(surtoClearlyTruncated(answer)){
   surtoLog('resposta_cortada',{round:i+1,attempt:1});
   try {
    const retry=await respond(bot,[...context,{role:'user',content:prompt+'\nIMPORTANTE: Sua resposta anterior terminou claramente incompleta. Escreva uma resposta COMPLETA e curta, sem iniciar listas que nao consiga terminar.',senderId:latestHuman.senderId}]);
    if(retry && retry.trim()!=='[SILENCIO]' && !surtoClearlyTruncated(retry))answer=retry.trim();
    else{skipped++;surtoLog('ignorada',{round:i+1,reason:'resposta_cortada'});continue;}
   }catch(e){skipped++;surtoLog('ignorada',{round:i+1,reason:'falha_retentativa'});continue;}
  }
  const norm=answer.toLocaleLowerCase('pt-BR').replace(/\s+/g,' ');
  if(emitted.has(norm)||echoesEarlier(answer,context)||copiedPassage(answer,context)){
   skipped++;surtoLog('ignorada',{round:i+1,reason:'repeticao'});continue;
  }
  await publish(bot,answer);
  history.push({role:'assistant',content:answer,senderId:INTERNO_USERS[bot]});
  emitted.add(norm);speakers.add(bot);total++;
 }
 if(sustained && total<maxReplies && attempts>=maxAttempts)endReason='limite_de_tentativas';
 surtoLog('fim',{published:total,skipped,attempts,maxAttempts,reason:endReason,configuredLimit:maxReplies});
 return total;
}
