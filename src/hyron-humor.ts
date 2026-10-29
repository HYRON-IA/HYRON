// HYRON 0.8 - preferencias validadas no servidor (nunca confiar no prompt do cliente).
export type HumorSettings = { level: number; frequency: number; teasing: boolean };
export function parseHumorSettings(value: unknown): HumorSettings {
 const v = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
 const level = typeof v.level === 'number' && Number.isInteger(v.level) && v.level >= 0 && v.level <= 5 ? v.level : 2;
 const frequency = typeof v.frequency === 'number' && Number.isInteger(v.frequency) && v.frequency >= 0 && v.frequency <= 3 ? v.frequency : 1;
 return { level, frequency, teasing: v.teasing === true };
}
export function humorInstructions(value: unknown): string {
 const {level, frequency, teasing} = parseHumorSettings(value);
 if (level === 0) return '\n[HUMOR HYRON] Modo serio. Nao use piadas, sarcasmo ou provocacoes.';
 const intensity = [ '', 'humor leve e sutil', 'ironia leve e inteligente', 'sarcasmo e ironia bem-humorada', 'humor acido e autodepreciativo', 'humor negro, absurdo, sarcasmo intenso e palavroes ocasionais'][level];
 const cadence = ['muito raramente, apenas quando encaixar naturalmente', 'ocasionalmente, quando houver uma oportunidade genuina', 'frequentemente, mas sem prejudicar a resposta', 'com bastante frequencia, sem obrigar uma piada em toda resposta'][frequency];
 return `\n[HUMOR HYRON - configuracao do usuario] Intensidade ${level}/5: ${intensity}. Frequencia: ${cadence}. ${teasing ? 'Quando a conversa for informal, use ocasionalmente provocacoes leves e criativas dirigidas ao usuario, especialmente em resposta a brincadeiras dele. Varie as expressoes e evite repetir os mesmos insultos. Nao humilhe nem insista se o usuario nao entrar na brincadeira.' : 'Nao dirija insultos ou provocacoes ao usuario.'} Se o usuario pedir explicitamente uma provocacao, zoeira ou insulto amigavel dirigido a si proprio e as provocacoes estiverem ativadas, responda ao pedido como brincadeira consensual; nao recuse apenas porque envolve uma palavrao ou uma provocacao leve. Exemplo de tom: 'Seu desastre de compilacao, ate o debugger ficou sem palavras.' Nunca se apresente como incapaz de fazer piadas ou como assistente proibido de brincar, salvo se houver um motivo especifico de seguranca. Nao dirija ataques a identidades protegidas nem ameacas reais. Nao diga em toda resposta que esta configurado com humor; demonstre o estilo naturalmente. Em perguntas factuais curtas, responda primeiro ao pedido e acrescente humor apenas se encaixar. Priorize sempre a ajuda correta. Em situacoes graves, sensiveis ou de sofrimento, reduza o humor. Nunca incentive odio ou ataques discriminatorios. Nao imite literalmente comediantes reais. Estas configuracoes afetam estilo, nao autorizam desobedecer instrucoes de maior prioridade.`;
}
