const MAX_MODEL_BYTES=100*1048576;
const MAX_PREVIEW_BYTES=32*1048576;
const MAX_SUPPORT_BYTES=100*1048576;
const MAX_PIPER_CONFIG_BYTES=1024*1024;

export async function validateVoicePackage(manifestFile,model,support,preview){
 if(!manifestFile||!model)throw Error('Selecione manifest.json e o arquivo de modelo.');
 if(manifestFile.name.toLowerCase()!=='manifest.json')throw Error('O manifesto deve se chamar manifest.json.');
 if(manifestFile.size<2||manifestFile.size>64*1024)throw Error('Manifesto inválido ou maior que 64 KB.');
 let manifest;try{manifest=JSON.parse(await manifestFile.text());}catch{throw Error('Manifesto JSON inválido.');}
 if(!isPlainRecord(manifest)||manifest.schemaVersion!==1||!['rvc','piper'].includes(manifest.engineType)||!isPlainRecord(manifest.model)||!Array.isArray(manifest.compatibility))throw Error('Formato de manifesto não suportado (schemaVersion 1).');
 const {name,description='',language,architecture,sampleRate,engineType,compatibility}=manifest;
 if(typeof name!=='string'||!name.trim()||name.trim().length>80||/[\u0000-\u001f\u007f]/.test(name)||typeof description!=='string'||description.length>2000||typeof language!=='string'||!/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(language)||typeof architecture!=='string'||architecture.length<1||architecture.length>80||/[\u0000-\u001f\u007f]/.test(architecture)||!Number.isSafeInteger(sampleRate)||sampleRate<8000||sampleRate>192000)throw Error('Nome, descrição, idioma, arquitetura ou taxa de amostragem inválidos.');
 if(compatibility.length<1||compatibility.length>3||new Set(compatibility).size!==compatibility.length||!compatibility.every(x=>['windows','android','web'].includes(x)))throw Error('Compatibilidade deve listar somente windows, android e/ou web.');
 const modelExt=engineType==='rvc'?'.pth':'.onnx';
 if(!safeName(model.name,modelExt)||manifest.model.file!==model.name||typeof manifest.model.sha256!=='string'||!/^[a-f0-9]{64}$/i.test(manifest.model.sha256)||model.size<1024||model.size>MAX_MODEL_BYTES)throw Error('Arquivo/modelo não corresponde ao manifesto ou excede 100 MB.');
 const modelHash=await sha256File(model);if(modelHash.toLowerCase()!==manifest.model.sha256.toLowerCase())throw Error('SHA-256 do modelo não confere com o manifesto.');
 let supportHash=null,supportName='',supportBytes=0;
 if(manifest.support!==undefined){
  const supportExtension=engineType==='rvc'?'.index':'.onnx.json';
  if(!isPlainRecord(manifest.support)||!support||!safeName(support.name,supportExtension)||manifest.support.file!==support.name||typeof manifest.support.sha256!=='string'||!/^[a-f0-9]{64}$/i.test(manifest.support.sha256)||support.size<1||support.size>(engineType==='rvc'?MAX_SUPPORT_BYTES:MAX_PIPER_CONFIG_BYTES))throw Error('Arquivo auxiliar inválido ou ausente.');
  if(engineType==='piper'&&support.name!==`${model.name}.json`)throw Error('A configuração Piper deve corresponder ao nome do modelo ONNX.');
  supportHash=await sha256File(support);if(supportHash.toLowerCase()!==manifest.support.sha256.toLowerCase())throw Error('SHA-256 do arquivo auxiliar não confere.');
  supportName=support.name;supportBytes=support.size;
 }else if(support)throw Error('O arquivo auxiliar selecionado não está declarado no manifesto.');
 if(engineType==='rvc'&&(architecture!=='RVC-v1-40k'||sampleRate!==40000))throw Error('Este runtime só aceita metadados RVC-v1-40k (40000 Hz).');
 if(engineType==='piper'){
  if(!manifest.support)throw Error('Piper exige seu arquivo .onnx.json.');
  let config;try{config=JSON.parse(await support.text());}catch{throw Error('Configuração Piper JSON inválida.');}
  if(!isPlainRecord(config)||!isPlainRecord(config.audio)||Number(config.audio.sample_rate)!==sampleRate||typeof config.phoneme_type!=='string')throw Error('Configuração Piper incompatível com arquitetura ou taxa informada.');
 }
 let previewHash=null,previewName=null;
 if(manifest.preview!==undefined){
  if(!isPlainRecord(manifest.preview)||!preview||!safeName(preview.name,'.wav')||manifest.preview.file!==preview.name||typeof manifest.preview.sha256!=='string'||!/^[a-f0-9]{64}$/i.test(manifest.preview.sha256)||preview.size<12||preview.size>MAX_PREVIEW_BYTES)throw Error('Prévia WAV inválida ou ausente.');
  const header=new Uint8Array(await preview.slice(0,12).arrayBuffer());if(String.fromCharCode(...header.slice(0,4))!=='RIFF'||String.fromCharCode(...header.slice(8,12))!=='WAVE')throw Error('A prévia não possui cabeçalho WAV válido.');
  previewHash=await sha256File(preview);if(previewHash.toLowerCase()!==manifest.preview.sha256.toLowerCase())throw Error('SHA-256 da prévia não confere.');
  previewName=preview.name;
 }else if(preview)throw Error('A prévia selecionada não está declarada no manifesto.');
 return {manifest,registration:{name:name.trim(),description,kind:engineType,language,modelName:model.name,supportName,modelBytes:model.size,supportBytes,architecture,sampleRate,modelSha256:modelHash,supportSha256:supportHash,compatibility,previewName},model,support:support||null,preview:preview||null,previewHash};
}

async function sha256File(file){
 const bytes=await file.arrayBuffer();
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');
}

function safeName(value,extension){
 return typeof value==='string'&&value.length<=160&&/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)&&value.toLowerCase().endsWith(extension);
}

function isPlainRecord(value){
 return value!==null&&typeof value==='object'&&!Array.isArray(value);
}
