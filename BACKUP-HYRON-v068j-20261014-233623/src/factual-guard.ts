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
 // Verifica especificamente nomes completos declarados com rotulos biograficos.
 const named=/(?:nome\s+(?:verdadeiro|completo)|batizad[oa]\s+como|nome\s+de\s+batismo|nome\s+art[ií]stico\s+de)\s*(?:e|é|era|:|de)?\s*\*{0,2}([\p{Lu}][\p{L}]+(?:\s+(?:(?:de|da|do|dos|das)\s+)?[\p{Lu}][\p{L}]+){1,5})/giu;
 for(const m of answer.matchAll(named)){
  const name=norm(m[1]);
  if(!evidence.includes(name))return reviewBad('nome biografico sem suporte nas paginas lidas');
 }
 return reviewOk();
}
