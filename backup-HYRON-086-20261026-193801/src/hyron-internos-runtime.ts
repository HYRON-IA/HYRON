// HYRON 084: identidades tecnicas fixas, sem login humano.
import { INTERNOS, INTERNOS_IDS, mencionadosNoTexto, convocouCAPS, type InternoId } from './hyron-internos';
export const INTERNO_USERS: Readonly<Record<InternoId,string>> = Object.freeze({
  basilisco:'a8400000-0000-4000-8000-000000000001',
  bicuco:'a8400000-0000-4000-8000-000000000002',
  'garra-de-prata':'a8400000-0000-4000-8000-000000000003',
  bunga:'a8400000-0000-4000-8000-000000000004'
});
export const internoFromUser=(id:string):InternoId|null => (Object.entries(INTERNO_USERS).find(([,v])=>v===id)?.[0] as InternoId|undefined)||null;
export {INTERNOS,INTERNOS_IDS,mencionadosNoTexto,convocouCAPS};
export type InternoResponder=(interno:InternoId,history:{role:string;content:string;senderId?:string;senderName?:string|null}[])=>Promise<string|null>;
