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
 return `Data atual fornecida pelo servidor: ${brasilDate(date)} (fuso America/Sao_Paulo). A data de corte de treinamento nao e a data atual. Para noticias ou situacao atual de pessoas, a fonte externa precisa sustentar a afirmacao; sem pesquisa, nao alegue consulta nem verificacao.`;
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

export function validateResearchDraft(answer:string,sources:ReadEvidence[],webUsed:boolean,now:Date):ReviewResult {
 if(!answer.trim())return reviewBad('texto vazio');
 const year=brasilYear(now);
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
 // Um ano de um fato deve aparecer no conteudo efetivamente lido/metadados.
 for(const m of answer.matchAll(/\b(?:18|19|20)\d{2}\b/g)){
  if(!evidence.includes(m[0]))return reviewBad('ano factual sem suporte nas paginas lidas');
 }
 // Nao permitir '11 de abril' deduzido de '1 de abril + 10 dias'.
 // Datas absolutas na resposta devem constar explicitamente no texto lido.
 const documentDates=new Set(sources.flatMap(source=>[...explicitDates(source.excerpt||'')]));
 for(const date of explicitDates(answer)){
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
