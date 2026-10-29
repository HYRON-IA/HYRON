const providers=new Set(['groq','openrouter','gemini','cloudflare-ai','cohere','nvidia','huggingface','sambanova','unorouter','ollama-cloud','cerebras','vercel','zai','siliconflow','ovhcloud','fireworks','together','deepinfra','novita']);
export function providerFailureDetails(attempts){
 if(!Array.isArray(attempts))return '';
 return attempts.slice(0,4).flatMap(attempt=>{
  if(!attempt||!providers.has(attempt.provider))return [];
  const reason=typeof attempt.reason==='string'?attempt.reason.slice(0,200):'';
  const status=reason.match(/\bHTTP ([1-5]\d{2})\b/)?.[1];
  let detail='não foi possível concluir a chamada';
  if(status==='401'||status==='403')detail='credencial ou permissão recusada';
  else if(status==='402')detail='crédito ou pagamento exigido';
  else if(status==='404')detail='modelo ou rota indisponível';
  else if(status==='429')detail='limite de requisições ou cota atingido';
  else if(status&&Number(status)>=500)detail='serviço temporariamente indisponível';
  else if(status)detail='requisição recusada';
  else if(/tempo limite|timeout/i.test(reason))detail='tempo limite esgotado';
  else if(/conex[aã]o/i.test(reason))detail='falha de conexão';
  else if(/vazia|reconhecida|JSON/i.test(reason))detail='resposta vazia ou inválida';
  return [attempt.provider+': '+detail+(status?' (HTTP '+status+')':'')];
 }).join('; ');
}
export function chatFailureMessage(data){
 const details=providerFailureDetails(data?.attempts);
 // Bodies of upstream errors and arbitrary reasons are never repeated here.
 if(details)return 'Não foi possível obter uma resposta. '+details+'.';
 return typeof data?.error==='string'?data.error:'Não foi possível obter uma resposta.';
}
