// HYRON v0.6.8h. Verificacoes locais conservadoras de procedencia e tempo.
// Heuristicas reduzem risco de afirmacoes sem evidencia; NAO sao fact-checker completo.
export type ReadEvidence = {url:string;title?:string;excerpt?:string;snippet?:string;publishedAt?:string};
export type ReviewResult = {ok:true}|{ok:false;reason:string};

const reviewOk=():ReviewResult=>({ok:true});
const reviewBad=(reason:string):ReviewResult=>({ok:false,reason});

function brasilDate(date:Date){
 return new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric'}).format(date);
}
function brasilYear(date:Date){
 return Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric'}).format(date));
}
export function currentDateContext(date:Date):string{
 return `Data atual REAL do servidor: ${brasilDate(date)} (fuso America/Sao_Paulo). Este dado e fornecido pelo backend/servidor, NAO pelo usuario e NAO por paginas externas; ele nao precisa de citacao da Internet. Use esta data como referencia absoluta de passado, presente e futuro, nunca a data-limite do seu treinamento. Nao atribua um corte de conhecimento especifico a si proprio sem metadados confirmados do provedor. Datas anteriores ao dia atual nao se tornam futuras so porque aconteceram apos seu corte de conhecimento. Voce pode reconhecer uma fonte externa posterior ao seu treinamento sem afirmar que o acontecimento e futuro. Para noticias ou situacao atual de pessoas, a fonte externa precisa sustentar a afirmacao; sem pesquisa, nao alegue consulta nem verificacao.`;
}
export function unverifiedClaimsNotice(reason:string,date:Date):string{
 return `Nao vou apresentar essa resposta como fato verificado. O texto gerado mostrou um problema de confiabilidade (${reason}). A data atual do servidor e ${brasilDate(date)}. Para conferir fatos recentes, ative o modo Pesquisar e consulte fontes que estejam acessiveis. Nenhuma verificacao externa foi confirmada nesta resposta.`;
}
function norm(s:string){return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').toLowerCase().trim();}
function urlKey(raw:string){try{const u=new URL(raw.replace(/[.,;]+$/,''));return u.origin+u.pathname+u.search;}catch{return raw}}
function urls(s:string){return [...s.matchAll(/https?:\/\/[^\s<>\])}"']+/gi)].map(m=>urlKey(m[0]));}

// Normaliza datas completas citadas na resposta, em PT/EN/ISO.
// Um ano isolado nao comprova que o DIA do evento foi extraido da pagina.
function explicitDates(input:string):Set<string>{
 const text=norm(input.replace(/https?:\/\/[^\s<>()]+/gi,' '));
 const months:Record<string,number>={january:1,jan:1,janeiro:1,february:2,feb:2,fevereiro:2,march:3,mar:3,marco:3,april:4,apr:4,abril:4,may:5,maio:5,june:6,jun:6,junho:6,july:7,jul:7,julho:7,august:8,aug:8,agosto:8,september:9,sept:9,sep:9,setembro:9,october:10,oct:10,outubro:10,november:11,nov:11,novembro:11,december:12,dec:12,dezembro:12};
 const found=new Set<string>();
 const add=(year:number,month:number,day:number)=>{
  if(year<1800||year>2100||month<1||month>12||day<1||day>31)return;
  const date=new Date(Date.UTC(year,month-1,day));
  if(date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day)found.add(`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`);
 };
 for(const m of text.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g))add(+m[1],+m[2],+m[3]);
 for(const m of text.matchAll(/\b(\d{1,2})[\/](\d{1,2})[\/](\d{4})\b/g))add(+m[3],+m[2],+m[1]);
 for(const m of text.matchAll(/\b(\d{1,2})(?:º|o)?\s+de\s+([a-z]+)\s+de\s+(\d{4})\b/g))if(months[m[2]])add(+m[3],months[m[2]],+m[1]);
 for(const m of text.matchAll(/\b([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s*(\d{4})\b/g))if(months[m[1]])add(+m[3],months[m[1]],+m[2]);
 return found;
}

// Detecta um caso observavel: um evento comprovadamente passado segundo os
// trechos lidos e descrito como "futuro" apenas por causa do corte do modelo.
// Comparacoes historicas legitimas ("em 2024 era futuro") sao preservadas.
function dayInBrazil(now:Date):string{
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const value=(type:string)=>parts.find(p=>p.type===type)?.value||'';
 return `${value('year')}-${value('month')}-${value('day')}`;
}
// Bloqueia apenas alegacoes diretas de que um evento comprovadamente passado
// ainda nao ocorreu. Dizer "futuro em relacao ao corte de 2024" e valido;
// nao equivale a dizer "futuro hoje". Evita a regra ampla da v0.6.9 original.
function contradictedPastEventClaim(answer:string,sources:ReadEvidence[],now:Date):boolean {
 if(!sources.length)return false;
 const today=dayInBrazil(now);
 const sourceDates=sources.flatMap(s=>[...explicitDates(s.excerpt||'')]);
 if(!sourceDates.some(date=>date<today))return false;
 const answerDates=[...explicitDates(answer)];
 if(answerDates.some(date=>date>today))return false;
 // Nao inspecionar citacoes ou falas de terceiros como declaracoes da IA.
 const unquoted=answer.replace(/“[^”]*”|"[^"\n]*"|‘[^’]*’|`[^`\n]*`/g,' ')
  .split('\n').filter(line=>!/^\s*>/.test(line)).join('\n');
 const text=norm(unquoted);
 if(/\b(?:em|no ano de|ate)\s+20\d{2}\s+(?:era|seria|estava|foi|parecia)\b/.test(text))return false;
 // Afirmacao sobre o presente, NAO comparacao valida com data de treinamento.
 const currentlyFuture=/\b(?:hoje|agora|atualmente|na data atual|neste momento)\b[^.!?\n]{0,110}\b(?:ainda nao (?:aconteceu|ocorreu|se realizou|foi lancad[oa]|foi realizad[oa])|(?:acontecera|ocorrera)|(?:e|esta)\s+(?:um\s+)?(?:evento\s+)?futur[oa])\b/u;
 const eventNotOccurred=/\b(?:a missao|o voo|o retorno|o lancamento|o evento|artemis\s+ii)\b[^.!?\n]{0,90}\b(?:ainda nao (?:aconteceu|ocorreu|se realizou|foi lancad[oa]|foi realizad[oa])|(?:acontecera|ocorrera)\s+(?:no futuro|em breve)|(?:e|esta)\s+(?:um\s+)?(?:evento\s+)?futur[oa])\b/u;
 if(!currentlyFuture.test(text)&&!eventNotOccurred.test(text))return false;
 // Uma frase que apenas diz "futuro em relacao ao corte" nao se contradiz.
 if(/\bfutur[oa]\s+em relacao ao\s+(?:corte|treinamento|conhecimento)\b/u.test(text)
  && !/\b(?:hoje|agora|atualmente|na data atual|neste momento|ainda nao ocorreu|ainda nao aconteceu)\b/u.test(text))return false;
 return true;
}

// A intencao negativa do usuario prevalece sobre webMode=on/auto.
// Inclui o infinitivo "sem pesquisar" (nao so o substantivo "sem pesquisas").
export function userForbidsWeb(question:string):boolean {
 const q=norm(question);
 if(/\b(?:proibid[oa]|proibido|proibida|vedad[oa]|impedid[oa])\b[^.!?\n]{0,90}\b(?:acessar|consultar|buscar|pesquisar|usar|utilizar|navegar)\s+(?:(?:a|as|o|os)\s+)?(?:internet|web|sites?|paginas?|fontes?|apis?|buscadores?|noticias?)\b/u.test(q))return true;
 if(/\b(?:sem\s+internet|sem\s+conexao|offline|nao\s+(?:acesse|acessar|consulte|consultar|utilize|usar)\s+(?:a\s+)?internet)\b/u.test(q))return true;
 return /\bnao\s+(?:(?:utilize|use|faca|realize|ative|inicie|execute|efetue)\s+(?:a\s+|uma?\s+|nenhuma?\s+)?(?:pesquisas?|buscas?|consultas?|acesso)\b|(?:pesquise|pesquisar|busque|buscar|consulte|consultar|acesse|acessar|navegue|navegar)\b)/u.test(q)
  || /\b(?:sem|dispense)\s+(?:(?:fazer|realizar|efetuar|usar|utilizar)\s+)?(?:(?:uma|nenhuma|qualquer)\s+)?(?:pesquisas?|buscas?|consultas?|pesquisar|buscar|navegar)\b/u.test(q)
  || /\b(?:sem|dispense)\s+(?:(?:fazer|realizar)\s+)?(?:consultar|acessar|usar|utilizar)\s+(?:a\s+|o\s+|as\s+|os\s+)?(?:internet|web|sites?|paginas?|fontes?\s+externas?|buscadores?)\b/u.test(q)
  || /\b(?:sem|nao use|nao utilize)\s+(?:a\s+)?(?:internet|web)\b/u.test(q)
  || /\bnao\s+(?:use|utilize|consulte|acesse)\s+(?:(?:a|as|o|os|nenhuma|qualquer)\s+)?(?:internet|web|sites?|paginas?|fontes?\s+externas?|buscadores?)\b/u.test(q)
  || /\bnao\s+(?:(?:quero|desejo)\s+que\s+(?:(?:voce|o\s+hyron)\s+)?)?(?:pesquise|busque|consulte\s+sites?)\b/u.test(q)
  || /\b(?:responda|responder|resposta|analise|analisa|explique|explicar|modo)\b[^.!?\n]{0,70}\boffline\b/u.test(q)
  || /\b(?:responda|responder|resposta|analise|analisa|explique|explicar)\b[^.!?\n]{0,70}\bsem\s+(?:usar|utilizar|consultar|acessar)\s+(?:a\s+)?(?:internet|web)\b/u.test(q);
}

// Relogio do servidor e evidência local confiável, nao uma alegacao sobre
// acontecimentos externos. Isenta SOMENTE a data real quando claramente
// rotulada como data atual. Datas de eventos no mesmo texto continuam exigindo
// evidencia nas paginas lidas.
function withoutTrustedServerDate(answer:string,now:Date):string {
 const today=dayInBrazil(now);
 const dateSyntax=/\b(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}(?:º|o)?\s+de\s+[a-zÀ-ÿ]+\s+de\s+\d{4}|[a-zÀ-ÿ]+\.?\s+\d{1,2}(?:st|nd|rd|th)?\s*,?\s*\d{4})\b/giu;
 return answer.replace(dateSyntax,(candidate:string,offset:number)=>{
  if(!explicitDates(candidate).has(today))return candidate;
  const local=answer.slice(Math.max(0,offset-140),offset).split(/[.!?;\n]/).pop()||'';
  const before=norm(local.replace(/[\*_`]/g,' '));
  const clock=/(?:\bdata\s+(?:atual|de\s+hoje|do\s+sistema|do\s+servidor)\b|\bhoje\b|\bagora\b|\bestamos\s+em\b|\bmomento\s+atual\b)/gu;
  const mentions=[...before.matchAll(clock)];
  if(!mentions.length)return candidate;
  const afterCue=before.slice((mentions[mentions.length-1].index||0)+mentions[mentions.length-1][0].length);
  if(afterCue.length>85 || /\b(?:morreu|faleceu|nasceu|lancamento|retorno|splashdown|missao|evento|ocorreu|aconteceu)\b/u.test(afterCue))return candidate;
  return '[DATA_ATUAL_DO_SERVIDOR]';
 });
}

// Uma refutacao explicita do erro do usuario NAO e uma afirmacao factual.
// O ano da HIPOTESE pode estar ausente das fontes, mas a data afirmada em
// substituicao permanece sob a verificacao integral abaixo.
// Negacoes vagas ("2027 talvez") nao ganham isencao.
function stripRefutedDates(answer:string):string {
 const datePattern=/\b(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}(?:º|o)?\s+de\s+[a-zÀ-ÿ]+\s+de\s+\d{4}|(?:18|19|20)\d{2})\b/giu;
 return answer.replace(datePattern,(candidate,offset:number)=>{
  const preceding=norm(answer.slice(Math.max(0,offset-105),offset).split(/[.!?;\n]/).pop()||'').replace(/[\*_`]/g,' ');
  const following=norm(answer.slice(offset+candidate.length,offset+candidate.length+85).split(/[.!?;\n]/)[0]||'').replace(/[\*_`]/g,' ');
  const prefix=preceding.replace(/^.*\b(?:18|19|20)\d{2}\b/u,'');
  const deniedBefore=/(?:\bnao\s+(?:foi|ocorreu|aconteceu|se\s+realizou|e|era|sera|acontecera|ocorrera|houve|tem|esta)\b[^.!?;\n]{0,70}\b(?:em|no|na|de|dia|ano)\s*$|\b(?:errad[ao]|incorret[ao]|fals[ao]|equivocad[ao])\s+(?:de|em|no|na)\s*$)/u.test(prefix);
  const deniedAfter=/^\s*(?:e|esta|foi|seria|era|representa|se\s+trata\s+de)?\s*(?:uma?\s+)?(?:data|ano|afirmacao|alegacao)?\s*(?:incorret[ao]|errad[ao]|fals[ao]|equivocad[ao]|nao\s+(?:e|foi|ocorreu|aconteceu|corresponde|esta\s+corret[ao]))\b/u.test(following);
  const contextualRefutation=/(?:\b(?:afirmacao|alegacao|informacao|hipotese|suposicao|data)\b[^.!?;\n]{0,65}\b(?:de|em|no|na)\s*$)/u.test(prefix)
   && /^.{0,55}\b(?:incorret[ao]|errad[ao]|fals[ao]|equivocad[ao])\b/u.test(following);
  return deniedBefore||deniedAfter||contextualRefutation?'[DATA_REFUTADA]':candidate;
 });
}

export function safeResearchFallback(question:string,reason:string,sources:ReadEvidence[]):string {
 const q=norm(question);
 const list=sources.slice(0,4).map(s=>'- ['+String(s.title||'Pagina consultada').replace(/[\[\]\n]/g,' ').slice(0,95)+']('+s.url+')').join('\n');
 const sufficiency=/\b(?:suficiente|suficiencia|prova\s+suficiente|serve\s+de\s+prova)\b/u.test(q);
 const concept=sufficiency?'Nao. Uma pagina generica sobre um tema nao comprova a data ou o horario exato de um acontecimento especifico. E necessario encontrar esses dados explicitamente em uma fonte que trate do evento.\n\n':'';
 return concept+'Nao consegui confirmar todos os detalhes pedidos com seguranca: a resposta produzida continha uma afirmacao que a verificacao nao sustentou ('+reason+'). Prefiro nao apresentar datas, nomes ou links que nao consegui comprovar.'+(list?'\n\n**Paginas efetivamente lidas (nao confirmam todos os detalhes):**\n'+list:'');
}

export function validateResearchDraft(answer:string,sources:ReadEvidence[],webUsed:boolean,now:Date):ReviewResult {
 if(!answer.trim())return reviewBad('texto vazio');
 const year=brasilYear(now);
 if(contradictedPastEventClaim(answer,sources,now))return reviewBad('tratou acontecimento passado como futuro em relacao ao treinamento');
 // O modelo nao decide a data atual com base no seu treinamento.
 const present=answer.match(/(?:estamos\s+(?:em|no\s+ano\s+de)|o\s+ano\s+atual\s+(?:e|é)|hoje\s+(?:e|é))\s*:?[\s*]*(20\d{2})/i);
 if(present&&Number(present[1])!==year)return reviewBad('ano atual incompativel com o servidor');
 for(const m of answer.matchAll(/\b(20\d{2})\s+(?:e|é|sera|será)\s+(?:um\s+)?ano\s+futuro/gi)){
  if(Number(m[1])<=year)return reviewBad('afirmacao temporal contraditoria');
 }
 if(!webUsed){
  if(/(?:verifiquei|pesquisei|consultei|acabei\s+de\s+(?:verificar|pesquisar|conferir))[^.!?\n]{0,120}(?:internet|web|fonte|not[ií]cia|jornal|sites?|Google|Wikip[eé]dia|busca)/i.test(answer) ||
     /(?:fontes?\s+(?:verificadas?|confirmadas?)\s+(?:agora|hoje|recentemente)|ap[oó]s\s+(?:pesquisar|consultar)\s+(?:a\s+)?(?:internet|web))/i.test(answer)){
   return reviewBad('alegou pesquisa externa que nao foi realizada');
  }
  return reviewOk();
 }
 // O provedor NUNCA pode citar um URL nao recebido por esta chamada de pesquisa.
 const allowed=new Set(sources.map(s=>urlKey(s.url)));
 for(const url of urls(answer)){
  if(!allowed.has(url))return reviewBad('citou endereco nao consultado');
 }
 // Quando a pesquisa realmente leu uma pagina, detectar alegacao de indisponibilidade total.
 if(sources.length&&/(?:n[aã]o\s+consigo\s+(?:realizar\s+pesquisas?|acessar\s+(?:a\s+)?internet|consultar\s+(?:sites|fontes))|(?:sistemas?|ferramentas?)\s+de\s+busca\s+(?:est[aã]o|ficaram)\s+indispon[ií]veis)/i.test(answer)){
  return reviewBad('negou pesquisa embora paginas tenham sido lidas');
 }
 const evidence=norm(sources.map(s=>[s.title||'',s.excerpt||'',s.publishedAt||''].join(' ')).join(' '));
 if(!evidence.trim())return reviewBad('sem texto editorial verificado');
 const factualClaims=stripRefutedDates(withoutTrustedServerDate(answer,now));
 // O ano presente do relogio do servidor nao precisa constar em artigos externos;
 // anos ligados a acontecimentos continuam sendo verificados.
 for(const m of factualClaims.matchAll(/\b(?:18|19|20)\d{2}\b/g)){
  if(!evidence.includes(m[0]))return reviewBad('ano factual sem suporte nas paginas lidas');
 }
 // Nao permitir '11 de abril' deduzido de '1 de abril + 10 dias'.
 // Datas absolutas de eventos na resposta devem constar explicitamente no texto lido.
 const documentDates=new Set(sources.flatMap(source=>[...explicitDates(source.excerpt||'')]));
 for(const date of explicitDates(factualClaims)){
  if(!documentDates.has(date))return reviewBad('data completa sem suporte explicito nas paginas lidas: '+date);
 }
 // Verifica especificamente nomes completos declarados com rotulos biograficos.
 const named=/(?:nome\s+(?:verdadeiro|completo)|batizad[oa]\s+como|nome\s+de\s+batismo|nome\s+art[ií]stico\s+de)\s*(?:e|é|era|:|de)?\s*\*{0,2}([\p{Lu}][\p{L}]+(?:\s+(?:(?:de|da|do|dos|das)\s+)?[\p{Lu}][\p{L}]+){1,5})/giu;
 for(const m of answer.matchAll(named)){
  const name=norm(m[1]);
  if(!evidence.includes(name))return reviewBad('nome biografico sem suporte nas paginas lidas');
 }
 return reviewOk();
}
