/** Conversao de datas do D1 para o fuso IANA escolhido por cada conta. */
export function validTimeZone(value:string):boolean {
 if(value.length<1||value.length>80||!/^[A-Za-z0-9_+\/-]+$/.test(value))return false;
 try { new Intl.DateTimeFormat('en-US',{timeZone:value});return true; } catch { return false; }
}
export function utcDate(value:string):Date|null {
 const v=value.trim();
 // datetime('now') em SQLite armazena UTC sem sufixo.
 const iso=/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(v)?v.replace(' ','T')+'Z':v;
 if(!/(?:Z|[+-]\d{2}:\d{2})$/i.test(iso))return null;
 const date=new Date(iso);return Number.isNaN(date.getTime())?null:date;
}
export function formatUserTimestamp(value:string,timeZone:string):string {
 const date=utcDate(value);
 if(!date)return value+' (fuso nao verificavel)';
 const tz=validTimeZone(timeZone)?timeZone:'UTC';
 const parts=new Intl.DateTimeFormat('pt-BR',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(date);
 return parts+' ('+tz+')';
}
export async function getUserTimeZone(db:D1Database,userId:string):Promise<string>{
 const row=await db.prepare('SELECT time_zone AS timeZone FROM user_timezones WHERE user_id=?').bind(userId).first<{timeZone:string}>();
 return row?.timeZone&&validTimeZone(row.timeZone)?row.timeZone:'UTC';
}
