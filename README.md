# HYRON v0.2 — Multi-LLM Router

HYRON é um assistente pessoal web com backend Cloudflare Workers e frontend estático. O roteador é uma implementação original inspirada no conceito de agregação do [FreeLLMAPI](https://github.com/tashfeenahmed/freellmapi); **não** inclui o servidor FreeLLMAPI nem fornece acesso automático a centenas de modelos.

## O que mudou

- Roteamento entre Groq, OpenRouter e Ollama Cloud (se configurados)
- Preferência opcional por provedor, com fallback
- Exibição do provedor e modelo efetivamente usados
- Endpoint `GET /api/status` para listar provedores configurados (não testa disponibilidade)
- Personalidade HYRON preservada e suporte existente a voz

## Implantação gratuita

1. Substitua os arquivos da v0.1 pelos deste pacote no repositório GitHub e faça commit/push na branch `main`.
2. Cloudflare Workers → `hyron` → Settings → Variables and Secrets. Adicione pelo menos uma chave: `GROQ_API_KEY`, `OPENROUTER_API_KEY` ou `OLLAMA_API_KEY`. **Tipo Secret**.
3. Para Ollama Cloud, configure também `OLLAMA_MODEL` com um identificador de modelo **disponível na sua conta**. Para Groq/OpenRouter, os modelos padrão podem ser substituídos via `GROQ_MODEL`/`OPENROUTER_MODEL`.
4. Configure `HYRON_ACCESS_KEY` como Secret para restringir a API. Na interface, clique na engrenagem e informe essa chave. **Atenção:** essa é uma chave compartilhada, não um sistema de contas. Não divulgue a chave. Não há rate limiting por usuário na v0.2.
5. O deploy automático via integração GitHub/Cloudflare deve publicar a atualização. Consulte os logs caso falhe.

### Desenvolvimento local (sem executar LLM local)

`npm install` → `npm run check` → `npm run dev`. Use `.dev.vars` local para segredos de desenvolvimento (não versionar).

### Limites

- Cada provedor exige credenciais próprias e está sujeito a cotas, elegibilidade e políticas variáveis. Sem chave não há acesso.
- A ordem padrão é Groq → OpenRouter → Ollama Cloud; um provedor preferido é tentado primeiro.
- O fallback ocorre diante de erro, indisponibilidade ou resposta vazia; não soma nem burla cotas.
- Não há banco de dados, histórico persistente, detecção de cotas reais, autenticação individual, ferramentas de busca ou streaming nesta versão.
- O `/api/status` não revela segredos, mas lista provedores configurados. Se `HYRON_ACCESS_KEY` estiver configurada, protege também esse endpoint.
- A integração com Ollama Cloud segue o formato `/api/chat`; confirme modelo e acesso na sua conta antes de usar.

## Segurança

Nunca inclua chaves no GitHub, `.env.example` ou frontend. O código verifica Origin quando presente, mas isso não substitui autenticação. Se o Worker ficar público sem `HYRON_ACCESS_KEY`, terceiros poderão consumir suas cotas gratuitas.

## Licença

MIT (ver LICENSE). Referência conceitual: FreeLLMAPI de tashfeenahmed; este pacote não incorpora código desse projeto.
