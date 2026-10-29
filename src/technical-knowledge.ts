// HYRON 0.8.2 — Conhecimento técnico consolidado deve seguir para a IA.
// É um roteador conservador, não uma fonte de respostas nem um substituto de modelo.
const STABLE_TECH = /\b(?:peterson|test[ -]?and[ -]?set|spinlocks?|busy[ -]?waiting|espera ocupada|se[cç][aã]o cr[ií]tica|exclus[aã]o m[uú]tua|instru[cç][oõ]es at[oô]micas|desabilitar interrup[cç][oõ]es|mutex|sem[aá]foros?|deadlocks?|concorr[eê]ncia|algoritmos?|estruturas? de dados|sistemas? operacionais?|ger[eê]ncia de processos|escalonamento|threads?|processos?|mem[oó]ria virtual|ponteiros?|recurs[aã]o|compiladores?|orienta[cç][aã]o a objetos|sql|transa[cç][oõ]es|normaliza[cç][aã]o de dados|[aá]lgebra booleana|portas? l[oó]gicas?|swap)\b/iu;
const LIVE_NEED = /https?:\/\/|\b(?:hoje|agora|neste momento|atualmente|mais recente|[uú]ltima vers[aã]o|vers[aã]o atual|atualizad[oa]s?|novidades|lan[cç]amento|not[ií]cias|202[5-9]|pre[cç]os? atuais?|documenta[cç][aã]o oficial|site oficial|cve-\d|vulnerabilidad(?:e|es) recente)\b/iu;
export function isStableTechnicalQuestion(text:string):boolean {
 const q=String(text||'').slice(0,10000);
 return STABLE_TECH.test(q)&&!LIVE_NEED.test(q);
}
export const TECH_KNOWLEDGE_PROMPT = '\nPara perguntas sobre programacao, algoritmos, sistemas operacionais, redes ou computacao consolidados: responda usando o conhecimento do modelo, com explicacoes corretas e exemplos quando util. Nao finja ter consultado fontes. Caso nao saiba, admita a limitacao; nunca invente referencias. Uma falha de pesquisa nao e motivo para evitar responder a conceitos tecnicos estaveis.';
