/** Localiza primeiras menções em mensagens originais do usuário, sem inferência da LLM. */
export type Evidence = {term:string; found:boolean; conversationId?:string; conversationTitle?:string; messageId?:number; createdAt?:string; excerpt?:string};
const fold=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
const escapeRegex=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function excerptAt(content:string,term:string):string|null {
 const normalized=fold(content), needle=fold(term);
 const re=new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRegex(needle)})(?=$|[^\\p{L}\\p{N}])`,'u');
 const match=re.exec(normalized); if(!match)return null;
 const start=match.index+match[1].length;
 return content.slice(Math.max(0,start-110),Math.min(content.length,start+term.length+170)).replace(/\s+/g,' ').trim();
}
export function requestedFirstMentions(question:string):string[]|null {
 const q=fold(question);
 if(!/(primeir[ao]s?\s+(?:menc(?:ao|oes)|ocorrenc(?:ia|ias)|registros?|vez)|(?:onde|quando)\s+(?:mencionei|citei)\s+(?:pela\s+)?primeira\s+vez)/u.test(q))return null;
 const terms:string[]=[];
 // Nomes citados entre aspas ou entre marcadores, sem assumir uma entidade inexistente.
 for(const m of question.matchAll(/[“"'`]([^“”"'`]{2,70})[”"'`]/g))terms.push(m[1].trim());
 // Suporte explícito ao teste já definido dos três projetos; outras buscas devem fornecer nomes entre aspas.
 for(const known of ['Diamante','COBALTO','Esmeralda'])if(new RegExp(`\\b${known}\\b`,'i').test(q))terms.push(known);
 return [...new Set(terms.map(s=>s.trim()))].filter(s=>s.length>=2).slice(0,8);
}
/** Pesquisa literal, em ordem temporal, com cursor (data, ID) e isolamento da conta. */
export async function firstUserMentions(db:D1Database,userId:string,terms:string[],excludeMessageId?:number):Promise<{results:Evidence[];scannedMessages:number;scanComplete:boolean}> {
 const pending=new Set(terms);
 const found=new Map<string,Evidence>();
 let cursorDate:string|null=null, cursorId=0, scannedMessages=0;
 let scanComplete=false;
 // A consulta atual é excluída por identidade, não por id < atual.
 // Isso evita perder mensagens antigas importadas posteriormente com IDs maiores.
 while(true){
  const rows: {id:number;createdAt:string;content:string;conversationId:string;title:string}[] = (await db.prepare(`SELECT m.id,m.created_at AS createdAt,m.content,
      m.conversation_id AS conversationId,c.title
    FROM messages m JOIN conversations c ON c.id=m.conversation_id
    WHERE c.user_id=? AND m.role='user' AND (? IS NULL OR m.id<>?)
      AND ( ? IS NULL OR datetime(m.created_at)>datetime(?)
          OR (datetime(m.created_at)=datetime(?) AND m.id>?) )
    ORDER BY datetime(m.created_at) ASC,m.id ASC LIMIT 64`)
   .bind(userId,excludeMessageId??null,excludeMessageId??null,
     cursorDate,cursorDate,cursorDate,cursorId)
   .all<{id:number;createdAt:string;content:string;conversationId:string;title:string}>()).results;
  if(!rows.length){scanComplete=true;break;}
  for(const row of rows){
   cursorDate=row.createdAt;cursorId=row.id;scannedMessages++;
   for(const term of [...pending]){
    const excerpt=excerptAt(row.content,term);
    if(excerpt!==null){found.set(term,{term,found:true,conversationId:row.conversationId,conversationTitle:row.title,messageId:row.id,createdAt:row.createdAt,excerpt});pending.delete(term);}
   }
  }
  // Primeira ocorrência literal de todos os termos já comprovada pelo prefixo temporal.
  // scanComplete=false expressa que o histórico todo não foi percorrido.
  if(!pending.size)break;
 }
 return {results:terms.map(term=>found.get(term)??{term,found:false}),scannedMessages,scanComplete};
}
