// HYRON_DOCUMENTS_V0601 - Processamento local, sem upload binario.
// JSZip 3.10.1 (MIT): distribuido junto ao instalador; nao executa conteudo dos documentos.
function decodeXml(xml){
 const dom=new DOMParser().parseFromString(xml,'application/xml');
 if(dom.querySelector('parsererror'))throw Error('XML invalido no documento.');
 return dom;
}
function extractOfficeXml(xml,kind){
 const doc=decodeXml(xml);const out=[];
 if(kind==='docx'){
  const paragraphs=doc.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main','p');
  for(const p of paragraphs){
   const tokens=[];for(const n of p.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main','t'))tokens.push(n.textContent||'');
   if(tokens.join('').trim())out.push(tokens.join(''));
  }
 }else{
  const paragraphs=doc.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main','p');
  for(const p of paragraphs){let tokens=[];for(const n of p.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main','t'))tokens.push(n.textContent||'');if(tokens.join('').trim())out.push(tokens.join(''));}
 }
 return out.join('\n');
}
async function officeText(file,ext){
 if(typeof JSZip==='undefined')throw Error('Leitor ZIP indisponivel.');
 const zip=await JSZip.loadAsync(await file.arrayBuffer(),{checkCRC32:false});
 const entries=Object.entries(zip.files).filter(([name,item])=>!item.dir);
 if(entries.length>2000)throw Error('Documento com numero excessivo de arquivos internos.');
 const byteTotal=entries.reduce((sum,[,item])=>sum+(item._data?.uncompressedSize||0),0);
 if(byteTotal>25*1024*1024)throw Error('Documento excede o limite seguro de extracao.');
 if(ext==='docx'){
  if(!zip.file('word/document.xml'))throw Error('DOCX sem word/document.xml');
  const files=['word/document.xml',...entries.map(([n])=>n).filter(n=>/^word\/(header|footer)[0-9]+\.xml$/.test(n)).sort()];
  const pieces=[];for(const name of files){const item=zip.file(name);if(item){const xml=await item.async('string');if(xml.length>5e6)throw Error('XML muito grande.');pieces.push(extractOfficeXml(xml,'docx'));}}
  return pieces.filter(Boolean).join('\n\n');
 }
 const slides=entries.map(([n])=>n).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a,b)=>Number(a.match(/slide(\d+)/)[1])-Number(b.match(/slide(\d+)/)[1]));
 if(!slides.length)throw Error('PPTX sem slides validos.');
 if(slides.length>300)throw Error('Apresentacao com mais de 300 slides.');
 const out=[];
 for(const name of slides){const xml=await zip.file(name).async('string');if(xml.length>5e6)throw Error('Slide XML muito grande.');const text=extractOfficeXml(xml,'pptx');out.push('Slide '+name.match(/slide(\d+)/)[1]+'\n'+(text||'[Sem texto extraivel]'));}
 return out.join('\n\n');
}
// Extrator PDF limitado: suporta operadores Tj/TJ em streams simples com fontes sem codificacao complexa.
// Em caso de PDF sem texto legivel, falha explicitamente em vez de inventar conteudo.
function pdfUnescape(s){return s.replace(/\\([nrtbf()\\])/g,(_,v)=>({n:'\n',r:'\r',t:'\t',b:'',f:'','(':'(',')':')','\\':'\\'}[v]??v)).replace(/\\([0-7]{1,3})/g,(_,o)=>String.fromCharCode(parseInt(o,8)));}
async function pdfText(file){
 const buf=await file.arrayBuffer();const bytes=new Uint8Array(buf);
 if(new TextDecoder('latin1').decode(bytes.slice(0,8)).indexOf('%PDF-')!==0)throw Error('PDF invalido.');
 const raw=new TextDecoder('latin1').decode(buf);
 const chunks=[];const re=/\bstream\r?\n/g;let match,count=0;
 while((match=re.exec(raw))&&count++<180){
  const end=raw.indexOf('endstream',re.lastIndex);if(end<0)break;
  let part=bytes.slice(re.lastIndex,end);while(part.length&&(part[part.length-1]===10||part[part.length-1]===13))part=part.slice(0,-1);
  const head=raw.slice(Math.max(0,match.index-350),match.index);
  if(/\/FlateDecode/.test(head)){
   if(typeof DecompressionStream==='undefined')continue;
   try{const stream=new Blob([part]).stream().pipeThrough(new DecompressionStream('deflate'));part=new Uint8Array(await new Response(stream).arrayBuffer());}catch{continue;}
  }
  if(part.length>2e6)continue;
  const body=new TextDecoder('latin1').decode(part);if(!/\bBT\b/.test(body))continue;
  for(const textBlock of body.matchAll(/\bBT\b([\s\S]*?)\bET\b/g)){
   const bits=[];
   for(const s of textBlock[1].matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj\b|\[((?:\\.|[^\]])*)\]\s*TJ\b/g)){
    if(s[1]!==undefined)bits.push(pdfUnescape(s[1]));
    else for(const v of s[2].matchAll(/\(((?:\\.|[^\\)])*)\)/g))bits.push(pdfUnescape(v[1]));
   }
   if(bits.length)chunks.push(bits.join(''));
  }
  re.lastIndex=end+9;
 }
 const text=chunks.join('\n').replace(/[\x00-\x08\x0B\x0E-\x1F]/g,'').trim();
 if(text.length<30)throw Error('PDF sem texto extraivel pelo leitor experimental. PDFs digitalizados ou com fontes especiais exigem OCR/PDF.js.');
 return text;
}
window.hyronExtractDocument=async function(file,ext){
 if(['docx','pptx'].includes(ext))return officeText(file,ext);
 if(ext==='pdf')return pdfText(file);
 throw Error('Formato sem leitor: '+ext);
};
