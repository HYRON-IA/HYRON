// HYRON_V065A_FULL_SCAN - Local, full-coverage scanning of UTF-8 text attachments.
// Does not send raw file bytes to the server or to the LLM.
// Works with browser File/Blob and Node Blob for offline testing.
const CHUNK_BYTES = 512 * 1024;
const GUARD_CHARS = 4096;
const MARKER_RE = /\bPALAVRAS?[\s_-]+VERIFICADAS?(?:[\s_-]*(?:0?[1-9]|10))?\b/gi;
const STOP_WORDS = new Set(['para','como','qual','quais','quantos','quantas','este','esta','isso','esse','essa','arquivo','arquivos','anexo','anexos','texto','conteudo','todos','todas','sobre','preciso','pode','fazer','mostre','liste','encontre','palavras','palavra','verificadas','verificada','meu','minha','num','uma','umas','dos','das','com','sem','que','por','nos','nas','ignore','ignorar','falsa','falsas','falso','falsos','palavra_falsa','palavras_falsas']);
function safeText(s){return s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,' ').replace(/\s+/g,' ').trim();}
function wordsFromQuestion(q){
 return [...new Set((String(q).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().match(/[a-z0-9_]{4,}/g)||[])
   .filter(w=>!STOP_WORDS.has(w)))].slice(0,8);
}
export async function scanLargeText(file, question='', progress=()=>{}) {
 if(!file || typeof file.slice!=='function' || !Number.isSafeInteger(file.size) || file.size<1 || file.size>100*1024*1024)
  throw Error('Arquivo inválido ou acima de 100 MiB.');
 const decoder=new TextDecoder('utf-8',{fatal:false});
 const keywords=wordsFromQuestion(question);
 const markers=[],hits=[],seen=new Set();
 let scannedBytes=0,decodedChars=0,carry='',startText='',lastText='',nullFound=false;
 // Each processed character belongs to exactly one window. A small guard window
 // is carried forward so tokens on chunk boundaries are not truncated.
 function processWindow(segment, base, processLength=segment.length){
  if(!segment || processLength===0)return;
  if(startText.length<700)startText+=segment.slice(0,Math.min(processLength,700-startText.length));
  lastText=(lastText+segment.slice(0,processLength).slice(-750)).slice(-750);
  MARKER_RE.lastIndex=0;
  let m;
  while((m=MARKER_RE.exec(segment))!==null){
   if(m.index>=processLength)continue;
   const abs=base+m.index;if(seen.has(abs))continue;seen.add(abs);
   const prefix=segment.slice(Math.max(0,m.index-45),m.index);
   let after=segment.slice(m.index+m[0].length,m.index+m[0].length+170);
   after=after.split(/\r?\n/)[0].slice(0,150);
   const evidence=safeText(m[0]+after);
   const valueMatch=after.match(/^\s*(?:\(?\d{1,2}\)?\s*)?(?:[:=]|->|→)\s*["']?([\p{L}\p{N}_-]+)/u);
   const value=valueMatch?.[1]||null;
   if(markers.length<64)markers.push({position:abs,text:evidence,value,context:safeText(prefix)});
  }
  if(!keywords.length)return;
  // Search the whole segment for user-specified terms, not only a beginning/end sample.
  // Each segment contributes at most two distinct, bounded excerpts.
  const normalized=segment.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  let found=0;
  for(const word of keywords){
   if(found>=2)break;
   let at=normalized.indexOf(word), attempts=0;
   while(at>=0 && at<processLength && found<2 && attempts++<40){
    const excerpt=safeText(segment.slice(Math.max(0,at-75),Math.min(segment.length,at+word.length+155)));
    const signature=excerpt.slice(0,140);
    if(excerpt.length>12 && !hits.some(h=>h.signature===signature)){
     if(hits.length<20)hits.push({position:base+at,text:excerpt,signature});
     found++;
    }
    at=normalized.indexOf(word,at+word.length);
   }
  }
 }
 for(let offset=0;offset<file.size;offset+=CHUNK_BYTES){
  const end=Math.min(file.size,offset+CHUNK_BYTES);
  const bytes=new Uint8Array(await file.slice(offset,end).arrayBuffer());
  if(bytes.byteLength!==end-offset)throw Error('Leitura incompleta: um bloco veio menor que o esperado.');
  // NUL is a strong signal of binary data. Do not interpret arbitrary binary as text.
  if(bytes.includes(0))nullFound=true;
  scannedBytes+=bytes.byteLength;
  const chunk=decoder.decode(bytes,{stream:true});
  const combined=carry+chunk;
  const keep=Math.min(GUARD_CHARS,combined.length);
  const readyLength=combined.length-keep;
  // Extra look-ahead recovers labels/values crossing a processing boundary.
  const scanWindow=combined.slice(0,Math.min(combined.length,readyLength+512));
  processWindow(scanWindow,decodedChars,readyLength);
  decodedChars+=readyLength;
  carry=combined.slice(readyLength);
  progress({bytes:scannedBytes,total:file.size,percent:Math.floor(scannedBytes/file.size*100)});
  // Allow the UI to render progress during long operations.
  if(offset%(CHUNK_BYTES*8)===0)await new Promise(resolve=>setTimeout(resolve,0));
 }
 carry+=decoder.decode();
 processWindow(carry,decodedChars);
 decodedChars+=carry.length;
 if(scannedBytes!==file.size)throw Error('Cobertura incompleta: bytes lidos diferem do tamanho do arquivo.');
 if(nullFound)throw Error('Este arquivo parece binário (bytes NUL encontrados).');
 markers.sort((a,b)=>a.position-b.position);
 hits.sort((a,b)=>a.position-b.position);
 progress({bytes:scannedBytes,total:file.size,percent:100});
 return {bytesRead:scannedBytes,totalBytes:file.size,complete:true,markers,hits,previewStart:safeText(startText),previewEnd:safeText(lastText),decodedChars};
}

export function formatFullScan(result, maxChars=6800){
 if(!result?.complete || result.bytesRead!==result.totalBytes)throw Error('Varredura não verificável.');
 const out=[
  `[VERIFICAÇÃO DE LEITURA COMPLETA DE TEXTO]`,
  `Bytes efetivamente percorridos: ${result.bytesRead} de ${result.totalBytes} (100%).`,
  `Toda a sequência de bytes foi percorrida. Isto NÃO significa que a IA recebeu o conteúdo integral nem que compreendeu semanticamente tudo.`,
  `Marcadores PALAVRA(S)_VERIFICADA(S) encontrados: ${result.markers.length}${result.markers.length===64?' (limite de registros exibidos: 64)':''}.`,
 ];
 if(result.markers.length){
  out.push('MARCADORES VERIFICADOS — ORDEM DE APARIÇÃO NO ARQUIVO (não confundir com PALAVRAS_FALSAS):');
  for(const [i,m] of result.markers.entries())out.push(`${i+1}. posição de caractere ~${m.position}: ${m.text}${m.value?' [VALOR EXTRAÍDO: '+m.value+']':''}`);
  if(result.markers.length===10 && result.markers.every(m=>m.value))
   out.push('SEQUÊNCIA EXATA DOS 10 VALORES EXTRAÍDOS NA ORDEM: '+result.markers.map(m=>m.value).join(' '));
  out.push('Liste somente valores realmente identificados após os marcadores, em ordem. Se estiver ambíguo, indique a dúvida; não invente.');
 }else out.push('Nenhum marcador PALAVRA(S)_VERIFICADA(S) foi encontrado. Não invente marcadores.');
 if(result.hits.length){out.push('OUTROS TRECHOS LOCALIZADOS PELAS PALAVRAS DA PERGUNTA:');for(const h of result.hits.slice(0,12))out.push(`posição ~${h.position}: ${h.text}`);}
 if(!result.markers.length&&!result.hits.length){
  out.push('AMOSTRA DO INÍCIO: '+result.previewStart.slice(0,550));
  out.push('AMOSTRA DO FIM: '+result.previewEnd.slice(0,550));
 }
 out.push('[FIM DO RELATÓRIO DA VARREDURA]');
 let text=out.join('\n');
 if(text.length>maxChars)text=text.slice(0,Math.max(100,maxChars-80))+'\n[Relatório limitado ao contexto da IA; bytes percorridos integralmente.]';
 return text;
}
