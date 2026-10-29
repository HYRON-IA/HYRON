/* HYRON v0.5.20 — Renderizador de mensagens seguro e sem dependencias externas.
 * O texto vem do modelo (conteudo nao confiavel). Nunca interpretar HTML recebido.
 */
const el=(tag,cls)=>{const node=document.createElement(tag);if(cls)node.className=cls;return node;};
const addText=(target,text)=>target.append(document.createTextNode(text));
const validHttpUrl=s=>{try{const url=new URL(s);return ['https:','http:'].includes(url.protocol)?url.href:null;}catch{return null;}};

const mathCommands=new Map(Object.entries({
 times:'×',cdot:'·',div:'÷',pm:'±',mp:'∓',neq:'≠',ne:'≠',le:'≤',leq:'≤',ge:'≥',geq:'≥',approx:'≈',sim:'∼',equiv:'≡',infty:'∞',pi:'π',theta:'θ',alpha:'α',beta:'β',gamma:'γ',delta:'δ',lambda:'λ',mu:'μ',sigma:'σ',Sigma:'Σ',Delta:'Δ',sum:'∑',prod:'∏',int:'∫',partial:'∂',nabla:'∇',in:'∈',notin:'∉',subset:'⊂',subseteq:'⊆',supset:'⊃',forall:'∀',exists:'∃',to:'→',rightarrow:'→',leftarrow:'←',Rightarrow:'⇒',leftrightarrow:'↔',land:'∧',lor:'∨',neg:'¬',ldots:'…',dots:'…',qquad:'  ',quad:' ',text:'',mathrm:'',mathbf:'',left:'',right:'',boxed:'',sqrt:'√','%':'%', '\\':'\\'
}));
function prettyMath(input){
 let s=String(input).trim();
 // Fracoes e radicais usuais ficam legiveis mesmo sem uma biblioteca de TeX.
 for(let i=0;i<5;i++){
  const next=s.replace(/\\(?:dfrac|tfrac|frac)\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g,'($1)⁄($2)')
   .replace(/\\sqrt\s*\{([^{}]+)\}/g,'√($1)')
   .replace(/\\(?:text|mathrm|mathbf|operatorname|boxed)\s*\{([^{}]*)\}/g,'$1');
  if(s===next)break;s=next;
 }
 s=s.replace(/\\([a-zA-Z]+|[%$&{}#_])/g,(full,name)=>mathCommands.has(name)?mathCommands.get(name):name);
 s=s.replace(/\\[,;:!]/g,' ').replace(/\\\{/g,'{').replace(/\\\}/g,'}')
   .replace(/\^\{([^{}]+)\}/g,'^($1)').replace(/_\{([^{}]+)\}/g,'_($1)')
   .replace(/\s+/g,' ').trim();
 return s;
}
function renderMath(target,latex,display=false){const math=el(display?'div':'span',display?'hyron-math-display':'hyron-math');math.textContent=prettyMath(latex);math.setAttribute('aria-label',`Expressão matemática: ${latex}`);target.append(math);}
function matching(src,start,marker){const at=src.indexOf(marker,start+marker.length);return at>start+marker.length?at:-1;}
function renderInline(container,src,depth=0){
 const s=String(src??'');if(depth>8){addText(container,s);return;}
 let i=0,plain='';const flush=()=>{if(plain){addText(container,plain);plain='';}};
 while(i<s.length){
  const rest=s.slice(i);let m;
  if(s[i]==='\\' && i+1<s.length){
   if(s.startsWith('\\(',i)){
    const end=s.indexOf('\\)',i+2);if(end!==-1){flush();renderMath(container,s.slice(i+2,end));i=end+2;continue;}
   }
   if(/^\\[\\`*_{}\[\]()#+.!|~$>-]/.test(rest)){plain+=s[i+1];i+=2;continue;}
  }
  if(s[i]==='$'&&s[i+1]!=='$'&&s[i+1]&&!/\s/.test(s[i+1])&&(i===0||s[i-1]!=='$')){
   const end=s.indexOf('$',i+1);if(end>i+1&&!/\s/.test(s[end-1])){flush();renderMath(container,s.slice(i+1,end));i=end+1;continue;}
  }
  if(s[i]==='`'){
   const fence=s.slice(i).match(/^`+/)[0];const end=s.indexOf(fence,i+fence.length);
   if(end>i+fence.length){flush();const code=el('code','hyron-inline-code');code.textContent=s.slice(i+fence.length,end).replace(/\n/g,' ');container.append(code);i=end+fence.length;continue;}
  }
  const link=rest.match(/^\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)(?:\s+"[^"]*")?\)/i);
  if(link){const href=validHttpUrl(link[2]);if(href){flush();const a=el('a');a.href=href;a.rel='noopener noreferrer nofollow';a.target='_blank';renderInline(a,link[1],depth+1);container.append(a);i+=link[0].length;continue;}}
  const auto=rest.match(/^<(https?:\/\/[^\s<>]+)>/i);
  if(auto){const href=validHttpUrl(auto[1]);if(href){flush();const a=el('a');a.href=href;a.rel='noopener noreferrer nofollow';a.target='_blank';a.textContent=auto[1];container.append(a);i+=auto[0].length;continue;}}
  let matched=false;
  for(const [mark,tag] of [['**','strong'],['__','strong'],['~~','del'],['*','em'],['_','em']]){
   if(!s.startsWith(mark,i)||!s[i+mark.length]||/\s/.test(s[i+mark.length]))continue;
   if(mark==='_'&&i>0&&/[\p{L}\p{N}]/u.test(s[i-1]))continue;
   const end=matching(s,i,mark);
   if(end<0||/\s/.test(s[end-1]))continue;
   flush();const node=el(tag);renderInline(node,s.slice(i+mark.length,end),depth+1);container.append(node);i=end+mark.length;matched=true;break;
  }
  if(matched)continue;
  plain+=s[i++];
 }
 flush();
}
const fenceRE=/^ {0,3}(`{3,}|~{3,})([^`]*)$/;
const isHr=s=>/^\s{0,3}(?:-\s*){3,}$|^\s{0,3}(?:\*\s*){3,}$|^\s{0,3}(?:_\s*){3,}$/.test(s);
const listLine=s=>s.match(/^( {0,12})([-+*]|\d+[.)])\s+(.+)$/);
const titleLine=s=>s.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
const pipeParts=s=>s.trim().replace(/^\|/,'').replace(/\|$/,'').split(/(?<!\\)\|/).map(t=>t.replace(/\\\|/g,'|').trim());
function isTable(lines,i){if(i+1>=lines.length||!lines[i].includes('|')||!lines[i+1].includes('-'))return false;const header=pipeParts(lines[i]),bar=pipeParts(lines[i+1]);return header.length>=2&&header.length===bar.length&&bar.every(c=>/^:?-{3,}:?$/.test(c));}
function renderCode(target,code,language){
 const block=el('div','hyron-codeblock');const top=el('div','hyron-code-toolbar');
 const name=el('span');name.textContent=language||'Código';const btn=el('button','hyron-copy-code');btn.type='button';btn.textContent='Copiar código';btn.setAttribute('aria-label','Copiar bloco de código');
 btn.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(code);btn.textContent='Copiado!';setTimeout(()=>btn.textContent='Copiar código',1600);}catch{btn.textContent='Não foi possível copiar';setTimeout(()=>btn.textContent='Copiar código',1800);}});
 top.append(name,btn);const pre=el('pre');const c=el('code');if(language)c.className='language-'+language.replace(/[^\w-]/g,'').slice(0,30);c.textContent=code;pre.append(c);block.append(top,pre);target.append(block);
}
function renderBlocks(target,rawLines,depth=0){
 if(depth>6){const p=el('p');p.textContent=rawLines.join('\n');target.append(p);return;}
 const lines=rawLines;let i=0;
 const blockStart=(j)=>j>=lines.length||!lines[j].trim()||fenceRE.test(lines[j])||titleLine(lines[j])||/^ {0,3}>/.test(lines[j])||isHr(lines[j])||listLine(lines[j])||isTable(lines,j)||/^\s*(?:\$\$|\\\[)/.test(lines[j]);
 while(i<lines.length){
  const line=lines[i];if(!line.trim()){i++;continue;}
  let m;
  if((m=line.match(fenceRE))){const delim=m[1],lang=m[2].trim().split(/\s+/)[0].slice(0,30);i++;const code=[];const re=new RegExp('^ {0,3}'+delim[0]+'{'+delim.length+',}\\s*$');while(i<lines.length&&!re.test(lines[i]))code.push(lines[i++]);if(i<lines.length)i++;renderCode(target,code.join('\n'),lang);continue;}
  if(/^\s*(?:\$\$|\\\[)/.test(line)){
   const tag=line.trim().startsWith('$$')?'$$':'\\[';const closing=tag==='$$'?'$$':'\\]';const start=line.indexOf(tag)+tag.length;
   let text=line.slice(start),end=text.indexOf(closing);
   if(end>=0){text=text.slice(0,end);i++;}else{const pieces=[text];i++;while(i<lines.length){const at=lines[i].indexOf(closing);if(at>=0){pieces.push(lines[i].slice(0,at));i++;break;}pieces.push(lines[i++]);}text=pieces.join('\n');}
   renderMath(target,text,true);continue;
  }
  if((m=titleLine(line))){const title=el('h'+Math.min(6,m[1].length),'hyron-heading');renderInline(title,m[2]);target.append(title);i++;continue;}
  if(isHr(line)){target.append(el('hr'));i++;continue;}
  if(/^ {0,3}>/.test(line)){
   const quote=[];while(i<lines.length&&/^ {0,3}>/.test(lines[i]))quote.push(lines[i++].replace(/^ {0,3}> ?/,''));
   const node=el('blockquote');renderBlocks(node,quote,depth+1);target.append(node);continue;
  }
  if(isTable(lines,i)){
   const headers=pipeParts(lines[i]);const table=el('table');const thead=el('thead');const tr=el('tr');for(const cell of headers){const th=el('th');renderInline(th,cell);tr.append(th);}thead.append(tr);table.append(thead);i+=2;
   const tbody=el('tbody');while(i<lines.length&&lines[i].trim()&&lines[i].includes('|')){const parts=pipeParts(lines[i]);const row=el('tr');for(let col=0;col<headers.length;col++){const td=el('td');renderInline(td,parts[col]||'');row.append(td);}tbody.append(row);i++;}table.append(tbody);const wrap=el('div','hyron-table-scroll');wrap.append(table);target.append(wrap);continue;
  }
  if(listLine(line)){
   const start=listLine(line);const ordered=/^\d/.test(start[2]),indent=start[1].length;
   const list=el(ordered?'ol':'ul');if(ordered)list.start=Number(start[2].match(/\d+/)[0]);
   while(i<lines.length){const item=listLine(lines[i]);if(!item||item[1].length!==indent||/^\d/.test(item[2])!==ordered)break;
    const li=el('li');const p=el('span');renderInline(p,item[3]);li.append(p);i++;
    // Sublistas indentadas e linhas de continuacao.
    while(i<lines.length){const nested=listLine(lines[i]);if(nested&&nested[1].length>indent){const parts=[];while(i<lines.length){const l=listLine(lines[i]);if(l&&l[1].length<=indent)break;if(!lines[i].trim())break;parts.push(lines[i++].slice(indent+2));}if(parts.length)renderBlocks(li,parts,depth+1);continue;}
     if(lines[i].trim()&&!nested&&/^\s+/.test(lines[i])&&!blockStart(i)){li.append(' ');renderInline(li,lines[i].trim());i++;continue;}break;
    }
    list.append(li);
   }
   target.append(list);continue;
  }
  const para=[];
  while(i<lines.length){if(i!==0&&para.length&&blockStart(i))break;if(!lines[i].trim())break;para.push(lines[i++]);}
  if(para.length){const p=el('p');para.forEach((txt,index)=>{if(index)p.append(document.createElement('br'));renderInline(p,txt.trim());});target.append(p);}
  else {const p=el('p');renderInline(p,lines[i++]);target.append(p);}
 }
}
export function renderRichMessage(bubble,source){
 const text=String(source??'').replace(/\r\n?/g,'\n');const body=el('div','hyron-rich-content');
 try{renderBlocks(body,text.split('\n'));}catch{body.replaceChildren();body.textContent=text;}
 bubble.replaceChildren(body);return body;
}
export function addReplyCopyButton(bubble,text){
 const actions=el('div','hyron-reply-actions');const copy=el('button','hyron-copy-answer');copy.type='button';copy.textContent='Copiar';copy.title='Copiar resposta';
 copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(String(text));copy.textContent='Copiado!';setTimeout(()=>copy.textContent='Copiar',1500);}catch{copy.textContent='Indisponível';setTimeout(()=>copy.textContent='Copiar',1600);}});
 actions.append(copy);bubble.append(actions);
}
