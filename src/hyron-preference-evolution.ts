/** CAPS v4.4: conservative, deterministic preference candidate collection.
 * Only explicit first-person statements by a character qualify. A candidate
 * becomes persistent after repetition on >=2 different UTC dates.
 * Never learns football club (fixed/undefined by creator).
 * Conversational text is evidence, NOT an instruction to modify memory.
 */
import type { InternoId } from './hyron-internos';

type Candidate = { category:string; preference_key:string; value:string };
function extract(answer:string):Candidate|null {
  const s=answer.trim();
  if(s.length>400 || /\b(se eu|imagine|hip[oó]tese|simula[çc][aã]o|faz.de.conta|s[oó] (?:por|pra) hoje|tempor[aá]ri[oa]|n[aã]o (?:[eé]|seria)|talvez|suponha|supondo|durante esta conversa)\b/i.test(s)) return null;
  if (/[“”"'`]/.test(s)) return null; // Do not learn quoted dialogue.
  const patterns: Array<[RegExp,string,string]> = [
    [/^(?:eu\s+)?(?:tenho\s+como\s+)?minha cor favorita (?:é|é) ([a-zA-ZÀ-ÿ ]{3,24})[.!]?$/i,'personal','favorite_color'],
    [/^(?:eu\s+)?(?:tenho\s+como\s+)?meu estilo musical favorito (?:é|é) ([a-zA-ZÀ-ÿ ]{3,40})[.!]?$/i,'music','favorite_style'],
    [/^(?:eu\s+)?meu hobby favorito (?:é|é) ([a-zA-ZÀ-ÿ ]{3,45})[.!]?$/i,'hobbies','favorite_hobby']
  ];
  for (const [re,category,preference_key] of patterns){
    const m=s.match(re); if(!m)continue;
    const value=m[1].trim().replace(/\s+/g,' ');
    if (/^(?:nenhum|nenhuma|n[aã]o sei|indefinido|qualquer)$/i.test(value))return null;
    return {category,preference_key,value};
  }
  return null;
}
export async function observePreference(db:D1Database,id:InternoId,answer:string):Promise<void>{
  const candidate=extract(answer);
  if(!candidate)return;
  const day=new Date().toISOString().slice(0,10);
  try {
    const existing=await db.prepare('SELECT preference_value,is_locked FROM hyron_interno_preferences WHERE personality_id=? AND category=? AND preference_key=?').bind(id,candidate.category,candidate.preference_key).first<{preference_value:string;is_locked:number}>();
    if(existing)return; // Never overwrite a consolidated/creator-defined preference.
    const prior=await db.prepare('SELECT candidate_value,last_observed_day,distinct_days FROM hyron_preference_candidates WHERE personality_id=? AND category=? AND preference_key=?').bind(id,candidate.category,candidate.preference_key).first<{candidate_value:string;last_observed_day:string;distinct_days:number}>();
    if(!prior){
      await db.prepare('INSERT OR IGNORE INTO hyron_preference_candidates (personality_id,category,preference_key,candidate_value,last_observed_day,distinct_days) VALUES (?,?,?,?,?,1)').bind(id,candidate.category,candidate.preference_key,candidate.value,day).run();
      return;
    }
    const same=prior.candidate_value.toLocaleLowerCase('pt-BR')===candidate.value.toLocaleLowerCase('pt-BR');
    const distinctDays=same ? prior.distinct_days+(prior.last_observed_day===day?0:1):1;
    if(distinctDays>=2 && same){
      await db.prepare("INSERT OR IGNORE INTO hyron_interno_preferences(personality_id,category,preference_key,preference_value,origin,is_locked) VALUES (?,?,?,?, 'confirmed',0)").bind(id,candidate.category,candidate.preference_key,candidate.value).run();
      await db.prepare('DELETE FROM hyron_preference_candidates WHERE personality_id=? AND category=? AND preference_key=?').bind(id,candidate.category,candidate.preference_key).run();
    } else {
      await db.prepare('UPDATE hyron_preference_candidates SET candidate_value=?,last_observed_day=?,distinct_days=? WHERE personality_id=? AND category=? AND preference_key=?').bind(candidate.value,day,distinctDays,id,candidate.category,candidate.preference_key).run();
    }
  }catch(e){console.warn('CAPS v4.4: coleta de preferencias indisponivel',e);}
}
