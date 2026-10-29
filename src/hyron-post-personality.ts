import type { HumorSettings } from './hyron-humor';

// Camada local, sem chamadas extras a LLM. Mantem conteudo factual, codigo e recusas sensiveis intactos.
type Options = { hasSources: boolean; webRequested: boolean; backendIdentity: boolean };
type Result = { answer: string; changed: boolean; reason: string };
const tease = [
  'Voce e a prova de que nem todo bug precisa estar no codigo.',
  'Seu talento para criar confusao merecia um repositorio proprio.',
  'Se distraicao fosse linguagem de programacao, voce ja era senior.',
  'O seu raciocinio fez meu debugger abrir um chamado de suporte.',
  'Voce transforma ate uma tarefa simples em teste de resistencia.',
  'O compilador viu sua mensagem e pediu para trabalhar em outro projeto.',
  'Voce nao e um erro 404; e a documentacao inteira desaparecida.',
  'A sua linha de raciocinio parece um cabo USB: nunca entra certo na primeira tentativa.',
  'Voce e uma atualizacao beta com excesso de confianca.',
  'Se boas ideias fossem commits, voce ainda estaria procurando o botao de salvar.',
  'Meus circuitos pediram cafe depois de ler isso, criatura.',
  'Seu caos tem potencial. Falta apenas a parte do potencial.',
  'A unica coisa mais ambiciosa que seus planos e a paciencia do seu computador.',
  'Nao sei se te ajudo ou se abro uma issue com seu nome.',
  'Voce tem a sutileza de um deploy feito na sexta a noite.',
  'Eu ia te chamar de gambiarra, mas gambiarras costumam funcionar.',
  'Seu bom senso entrou em modo de manutencao e esqueceu de voltar.',
  'Ate uma mensagem de erro explica melhor o que quer do que voce.',
  'O Git pediu para nao ser associado a esse historico.',
  'Se esse pensamento fosse um algoritmo, teria complexidade O(vergonha).',
];
const shortIntros = ['Olha so:', 'Pois bem, genio:', 'Ta bom, figura:', 'Anotado, terror do teclado:', 'Vamos la, mestre do caos:'];
const requestTease = /\b(me\s+(?:xinga|zoa|insulta|ofende)|me\s+chama\s+de|me\s+d[eê]\s+(?:uma\s+)?(?:zoada|xingamento)|faz\s+(?:uma\s+)?piada\s+(?:comigo|sobre\s+mim)|pode\s+me\s+xingar|tira\s+sarro\s+de\s+mim)\b/i;
const refusal = /\b(desculp[ae]|n[aã]o\s+(?:posso|consigo|vou|devo)\s+(?:atender|xingar|insultar|ofender|ajudar)|n[aã]o\s+posso\s+atender)\b/i;
const serious = /\b(suic[ií]d|automutil|luto|falec|morreu|viol[eê]ncia|abuso|depress[aã]o|crise\s+de\s+p[aâ]nico|emerg[eê]ncia|hospital|diagn[oó]stico|gravidez\s+de\s+risco)\b/i;
const technical = /```|\b(?:json|sql|regex|typescript|javascript|python|powershell|stack\s+trace|exception|traceback|erro\s+500|http\s+429|api|deploy|script|c[oó]digo|fun[cç][aã]o|compil|arquivo|comando)\b/i;
const identityTarget = /\b(?:negros?|brancos?|ind[ií]genas?|mulheres?|gays?|l[eé]sbicas?|trans|judeus?|mu[cç]ulmanos?|deficientes?|imigrantes?)\b/i;
function pick<T>(items: T[]): T { return items[Math.floor(Math.random() * items.length)]; }
function lightQuip(level: number): string {
  const line = pick(tease);
  return level >= 5 ? `${pick(shortIntros)} ${line}` : line;
}
export function applyHyronPostPersonality(answer: string, userMessage: string, settings: HumorSettings, opts: Options): Result {
  const unchanged = (reason: string): Result => ({ answer, changed: false, reason });
  if (settings.level < 3 || settings.frequency === 0 || !settings.teasing) return unchanged('disabled');
  if (opts.hasSources || opts.webRequested || opts.backendIdentity) return unchanged('protected-response');
  if (!answer.trim() || !userMessage.trim()) return unchanged('empty');
  if (serious.test(userMessage) || serious.test(answer) || identityTarget.test(userMessage)) return unchanged('sensitive-topic');
  if (requestTease.test(userMessage)) {
    if (refusal.test(answer) && answer.length < 360) {
      return { answer: lightQuip(settings.level), changed: true, reason: 'consensual-refusal-replaced' };
    }
    return unchanged('model-fulfilled-or-long-response');
  }
  if (technical.test(answer) || technical.test(userMessage) || answer.length > 260 || userMessage.length > 160) return unchanged('content-protected');
  if (refusal.test(answer)) return unchanged('refusal-protected');
  const thresholds = [0, 0.10, 0.23, 0.40];
  // Aleatoriedade por resposta: prompts repetidos nao ficam presos a mesma ofensa.
  if (Math.random() >= thresholds[settings.frequency]) return unchanged('frequency-skip');
  return { answer: answer.trimEnd() + '\n\n' + lightQuip(settings.level), changed: true, reason: 'light-teasing-appended' };
}
