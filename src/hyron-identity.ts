// HYRON Alfa 6.1: respostas sobre a identidade sao determinadas pelo backend.
// Nao depende de um LLM obedecer ao system prompt nem alega autor desconhecido.
export function verifiedHyronIdentity(question: string, provider: string, model: string): string | null {
  if (typeof question !== 'string' || question.length > 500) return null;
  const q = question.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  if (!q || q.includes('\n\n')) return null;
  // Somente perguntas diretas sobre o proprio assistente/roteador do HYRON.
  // Nao confundir com perguntas biograficas sobre Z.ai, Google ou outras IAs.
  const directSelf = /\b(quem (?:e|eh) voce|quem (?:te|o) (?:criou|desenvolveu)|quem desenvolveu voce|voce (?:foi )?(?:criado|desenvolvido) por|de qual empresa voce (?:e|eh)|voce (?:e|eh) (?:um |uma |o )?(?:glm|gemini|modelo|da z\.ai)|quem desenvolveu (?:o )?hyron|quem criou (?:o )?hyron)\b/.test(q);
  const explicitModel = /\b(qual (?:(?:e|eh) )?(?:o )?modelo (?:de ia )?(?:que )?(?:esta|esta sendo|voce esta) (?:respondendo|usando)|qual modelo voce (?:usa|esta usando)|qual (?:e|eh) a diferenca entre hyron e (?:o )?(?:modelo|glm|gemini)|diferenca entre hyron e (?:o )?(?:modelo|glm|gemini))\b/.test(q);
  if (!directSelf && !explicitModel) return null;
  // Os identificadores sao metadados do roteador, nao declaracoes do modelo.
  const safeProvider = /^[a-z0-9][a-z0-9-]{0,50}$/i.test(provider) ? provider : 'provedor nao identificado';
  const safeModel = /^[a-z0-9@][a-z0-9@._:/+\-]{0,119}$/i.test(model) ? model : 'modelo nao identificado';
  return 'Sou HYRON, o assistente virtual do projeto HYRON. HYRON é a aplicação, não um modelo de linguagem da Z.ai. '
    + `Nesta requisição, o modelo consultado foi ${safeModel}, por meio de ${safeProvider}. `
    + 'Modelos externos fornecem a geração de texto, mas não são os autores do projeto HYRON. '
    + 'Não disponho de um registro verificado com os nomes dos desenvolvedores do projeto e não vou inventar essa autoria.';
}
