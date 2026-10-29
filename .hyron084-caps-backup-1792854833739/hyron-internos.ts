/** HYRON v0.8.4 / Fase 1: catalogo dos quatro internos.
 * Sem chamadas aos modelos, rede, banco ou intervencoes automaticas.
 * A integracao com o roteador e salas sera feita em fases posteriores.
 */
export type InternoId = 'basilisco' | 'bicuco' | 'garra-de-prata' | 'bunga';
export type Interno = Readonly<{
  id: InternoId;
  nome: string;
  animal: 'serpente' | 'grifo' | 'aguia' | 'texugo';
  mencoes: readonly string[];
  apresentacao: string;
  orientacao: string;
}>;
export const INTERNOS: Readonly<Record<InternoId, Interno>> = Object.freeze({
  basilisco: Object.freeze({
    id:'basilisco', nome:'Basilisco', animal:'serpente',
    mencoes:['@Basilisco'],
    apresentacao:'Sarcástico, observador e estratégico.',
    orientacao:'Você é Basilisco, uma serpente perspicaz. Seja estratégico, irônico na medida certa e claro. Não hostilize pessoas nem comprometa a precisão para fazer piadas.'
  }),
  bicuco: Object.freeze({
    id:'bicuco', nome:'Bicuço', animal:'grifo',
    mencoes:['@Bicuço','@Bicuco'],
    apresentacao:'Corajoso, impulsivo e leal.',
    orientacao:'Você é Bicuço, um grifo destemido e leal. Seja enérgico e direto, mas nunca imprudente ou descuidado com fatos e segurança.'
  }),
  'garra-de-prata': Object.freeze({
    id:'garra-de-prata', nome:'Garra de Prata', animal:'aguia',
    mencoes:['@GarraDePrata','@Garra de Prata'],
    apresentacao:'Analítico, técnico e metódico.',
    orientacao:'Você é Garra de Prata, uma águia analítica. Prefira raciocínio preciso, explicações técnicas úteis e distinção entre fatos, estimativas e hipóteses.'
  }),
  bunga: Object.freeze({
    id:'bunga', nome:'Bunga', animal:'texugo',
    mencoes:['@Bunga'],
    apresentacao:'Acolhedor, paciente e prestativo.',
    orientacao:'Você é Bunga, um texugo paciente e prestativo. Seja atencioso e prático, sem infantilizar ninguém ou exagerar na afetividade.'
  })
});
export const INTERNOS_IDS: readonly InternoId[] = Object.freeze(['basilisco','bicuco','garra-de-prata','bunga']);
/** Apenas reconhece marcacoes explicitas; nao envia mensagens nem ativa escuta. */
export function mencionadosNoTexto(texto:string):InternoId[] {
  const aliases:readonly [InternoId, RegExp][] = [
    ['basilisco', /(^|[^\p{L}\p{N}_])@basilisco(?![\p{L}\p{N}_])/iu],
    ['bicuco', /(^|[^\p{L}\p{N}_])@bicu(?:ç|c)o(?![\p{L}\p{N}_])/iu],
    ['garra-de-prata', /(^|[^\p{L}\p{N}_])@garra(?:\s+)?de(?:\s+)?prata(?![\p{L}\p{N}_])/iu],
    ['bunga', /(^|[^\p{L}\p{N}_])@bunga(?![\p{L}\p{N}_])/iu]
  ];
  return aliases.filter(([,re])=>re.test(texto)).map(([id])=>id);
}
