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
// HYRON_PDFJS_V0601A: PDF.js 3.11.174, leitura local; sem OCR e sem upload do binario.
// PDF.js: Apache License 2.0 - https://github.com/mozilla/pdf.js
async function pdfText(file){
  if(!window.pdfjsLib)throw Error('PDF.js nao foi carregado. Atualize a pagina (Ctrl+F5).');
  const pdfjs=window.pdfjsLib;
  pdfjs.GlobalWorkerOptions.workerSrc='/pdf.worker.min.js';
  const data=new Uint8Array(await file.arrayBuffer());
  if(data.length<5 || String.fromCharCode(...data.slice(0,5))!=='%PDF-')throw Error('Arquivo nao parece ser um PDF valido.');
  let documentTask;
  try{
    documentTask=pdfjs.getDocument({data,useSystemFonts:true,isEvalSupported:false});
    const doc=await documentTask.promise;
    if(doc.numPages>200)throw Error('PDF com mais de 200 paginas; divida em partes menores.');
    const pages=[];
    for(let index=1;index<=doc.numPages;index++){
      const page=await doc.getPage(index);
      const content=await page.getTextContent({disableCombineTextItems:false});
      let lines=[],line='',previousY=null;
      for(const item of content.items){
        if(typeof item.str!=='string')continue;
        const y=item.transform?.[5];
        if(line && Number.isFinite(y) && Number.isFinite(previousY) && Math.abs(y-previousY)>3){lines.push(line.trim());line='';}
        line+=item.str;
        if(item.hasEOL){lines.push(line.trim());line='';previousY=null;}
        else if(Number.isFinite(y))previousY=y;
      }
      if(line.trim())lines.push(line.trim());
      pages.push('[Pagina '+index+' de '+doc.numPages+']\n'+lines.filter(Boolean).join('\n'));
      page.cleanup();
    }
    const text=pages.join('\n\n').trim();
    if(text.replace(/\[Pagina \d+ de \d+\]/g,'').trim().length<30)
      throw Error('PDF sem texto selecionavel. PDF digitalizado precisa de OCR, previsto para outra etapa.');
    return text;
  }catch(err){
    if(err?.name==='PasswordException')throw Error('PDF protegido por senha; desbloqueie o arquivo antes de anexar.');
    throw err;
  }finally{try{await documentTask?.destroy();}catch{}}
}
window.hyronExtractDocument=async function(file,ext){
 if(['docx','pptx'].includes(ext))return officeText(file,ext);
 if(ext==='pdf')return pdfText(file);
 throw Error('Formato sem leitor: '+ext);
};
