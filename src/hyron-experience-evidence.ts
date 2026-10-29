/** CAPS v4.6: provenance in the currently supplied conversation history.
 * Does NOT verify real-world events or create cross-conversation memories.
 */
export type ExperienceHistoryItem = {role:string;content:string;senderId?:string;senderName?:string|null};
export function experienceEvidenceContext(
  history:readonly ExperienceHistoryItem[],
  internallyNamed:Readonly<Record<string,string>>
):string{
  const evidence:string[]=[];
  for(const message of history.slice(-25)){
    if(!message || typeof message.content!=='string' || !message.content.trim())continue;
    const isBot=Boolean(message.senderId && internallyNamed[message.senderId]);
    const author=isBot ? internallyNamed[message.senderId!] :
      (message.senderName?.trim() || (message.senderId ? 'participante identificado no sistema' : 'origem nao identificada'));
    const kind=isBot?'FALA DE PERSONAGEM (alegacao, nao prova)':'MENSAGEM REGISTRADA DE PARTICIPANTE (comprova a fala, nao seu conteudo externo)';
    const snippet=message.content.replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').slice(0,240);
    evidence.push(`${kind} | ${author}: ${snippet}`);
  }
  return 'CAPS v4.6 — PROVENIENCIA DE EXPERIENCIAS:\n'+
    'Uma mensagem efetivamente recebida nesta conversa e uma interacao registrada. '+
    'Se alguem disser que mostrou uma foto, isso prova somente que essa pessoa o afirmou; '+
    'nao prova que a imagem foi recebida ou visualizada. '+
    'Uma fala de outro interno e apenas um relato. '+
    'Fatos historicos e conhecimento geral nao sao vivencias proprias. '+
    'Nunca afirme ter estado em eventos, visto videos, fotografias ou paginas sem registro da acao na interacao. '+
    'Nao transforme simulacoes, insinuacoes ou perguntas tendenciosas em memorias. '+
    'Se precisar, diga de qual tipo de fonte veio a informacao. '+
    'Este registro cobre APENAS o historico de conversa fornecido nesta chamada, nao outras conversas.\n'+
    (evidence.length?'EVIDENCIAS DA CONVERSA:\n'+evidence.join('\n').slice(-6500):'Nenhuma evidencia anterior recuperada.');
}
