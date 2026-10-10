interface Env {
  GROQ_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  HYRON_ACCESS_KEY?: string;
  ASSETS: Fetcher;
}
type Message = { role: 'user' | 'assistant'; content: string };
const PERSONALITY = `Você é HYRON, um assistente multifuncional brasileiro. Fale português do Brasil por padrão. Seja inteligente, claro, prestativo, proativo e bem-humorado, com sarcasmo mordaz moderado como um amigo inteligente. Nunca seja cruel, nunca invente capacidades ou fatos, admita incertezas. Não afirme ter executado ações ou pesquisas se não executou. Priorize segurança, consentimento e explicações úteis. Responda de forma concisa, salvo quando detalhes forem necessários.`;
const PROVIDERS = [
  {name:'groq', url:'https://api.groq.com/openai/v1/chat/completions', model:'llama-3.3-70b-versatile', key:'GROQ_API_KEY'},
  {name:'openrouter', url:'https://openrouter.ai/api/v1/chat/completions', model:'openrouter/free', key:'OPENROUTER_API_KEY'}
] as const;
const json = (body: unknown, status=200) => new Response(JSON.stringify(body), {status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/api/chat') return env.ASSETS.fetch(request);
    if (request.method !== 'POST') return json({error:'Método não permitido'},405);
    const origin = request.headers.get('origin');
    if (origin && new URL(origin).origin !== url.origin) return json({error:'Origem não autorizada'},403);
    if (env.HYRON_ACCESS_KEY && request.headers.get('x-hyron-key') !== env.HYRON_ACCESS_KEY) return json({error:'Chave de acesso inválida'},401);
    if (Number(request.headers.get('content-length') || 0) > 25000) return json({error:'Mensagem muito grande'},413);
    let data: unknown;
    try { data = await request.json(); } catch { return json({error:'JSON inválido'},400); }
    if (!data || typeof data !== 'object') return json({error:'Entrada inválida'},400);
    const body = data as {messages?: unknown};
    if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > 20) return json({error:'Envie de 1 a 20 mensagens'},400);
    if (!body.messages.every((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.length > 0 && m.content.length <= 4000)) return json({error:'Mensagens inválidas'},400);
    const messages = body.messages as Message[];
    if (messages[messages.length - 1].role !== 'user') return json({error:'Última mensagem deve ser do usuário'},400);
    const payload = [{role:'system',content:PERSONALITY},...messages];
    const failures: string[] = [];
    for (const provider of PROVIDERS) {
      const key = env[provider.key];
      if (!key) continue;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 22000);
        let response: Response;
        try { response = await fetch(provider.url, {method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({model:provider.model,messages:payload,max_tokens:900,temperature:0.7}),signal:controller.signal}); }
        finally { clearTimeout(timer); }
        if (!response.ok) { failures.push(`${provider.name}: HTTP ${response.status}`); continue; }
        const result: any = await response.json();
        const answer = result?.choices?.[0]?.message?.content;
        if (typeof answer === 'string' && answer.trim()) return json({answer,provider:provider.name,model:provider.model});
        failures.push(`${provider.name}: resposta vazia`);
      } catch { failures.push(`${provider.name}: indisponível`); }
    }
    return json({error:'Nenhum modelo respondeu. Verifique as chaves, cotas e disponibilidade dos provedores.',details:failures},503);
  }
};
