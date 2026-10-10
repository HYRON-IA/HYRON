# HYRON V-0.4 — multiusuário

Cloudflare Workers + D1, contas por convite, memórias por usuário, histórico isolado e roteador multi-LLM.

## Instalação

1. Faça backup do banco remoto antes de atualizar: `npx.cmd wrangler d1 export hyron-history --remote --output=backup-hyron.sql`.
2. Copie os arquivos para seu repositório V-0.3 (não copie `node_modules`). **Não apague o banco**.
3. Execute `npm.cmd install` e `npm.cmd run check`.
4. Execute `npx.cmd wrangler d1 execute hyron-history --remote --file=database/0002_v04.sql` **uma única vez**. Essa migração adiciona a coluna `user_id`; se repetir, SQLite reclamará de coluna duplicada.
5. Crie um segredo forte: `npx.cmd wrangler secret put HYRON_SETUP_KEY` (mínimo 24 caracteres aleatórios). Mantenha `OPENROUTER_API_KEY` já configurada.
6. Faça `git add .`, `git commit -m "HYRON V-0.4 multiusuario"`, `git push origin main` e aguarde deploy.
7. No site, selecione **Configuração inicial do administrador**, informe nome, senha (12+ caracteres) e o valor de `HYRON_SETUP_KEY`. A criação do administrador é permitida somente se ainda não houver usuários.
8. Faça login, clique **Convites e usuários**, gere um código válido por 48h e envie ao convidado. Ele seleciona **Cadastrar com convite**.
9. Clique **Importar V-0.3** no mesmo navegador onde usava a versão antiga para reivindicar suas conversas por token original. Conversas antigas não são atribuídas automaticamente.

## Segurança e limitações

- Sessão HttpOnly, Secure, SameSite=Strict; 7 dias. Senhas com PBKDF2-SHA256 (210 mil iterações); não coloque credenciais em arquivos públicos.
- Acesso a conversas/memórias sempre restrito ao usuário autenticado. Cadastro público sem convite não é permitido.
- Limite padrão de 40 mensagens por usuário por dia; variável opcional `DAILY_MESSAGE_LIMIT`. A cota diária não substitui limitação de tentativas de login no Cloudflare WAF/Turnstile; **habilite rate limiting de login e registro antes de abrir o serviço ao público**.
- Memória V-0.4 é explícita: salve e exclua lembranças no botão Memórias. O contexto recupera até 6 lembranças por correspondência textual; não é busca semântica nem extração automática.
- Integrações FreeLLMAPI **inspiradas no catálogo**, sem instalar a biblioteca Python no Worker. Suporta OpenRouter, Groq, Ollama Cloud, Cerebras, Mistral e Gemini por endpoints HTTP compatíveis; cada provedor requer chave e modelo válido (variáveis `<PROVEDOR>_API_KEY` e `<PROVEDOR>_MODEL`). Gratuidade depende da política e disponibilidade do provedor.
- Login não tem ainda recuperação de senha; guarde as credenciais de administrador.
- O limite de mensagens usa contador D1 e pode ser sujeito a concorrência de requisições; Cloudflare WAF é recomendado para proteção adicional.
