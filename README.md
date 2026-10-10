# HYRON V-0.3 — Histórico persistente

Implementação do histórico em Cloudflare D1 (plano Free, sujeito a limites). O banco armazena mensagens; o navegador mantém a lista de conversas e os tokens de acesso individuais. Não existe sincronização entre dispositivos nem login nesta versão.

## Instalação

1. Na pasta do projeto original (com `.git`), copie os arquivos desta versão por cima, sem copiar `.git` de outra pasta.
2. Execute `npm install` e `npx wrangler d1 create hyron-history` no PowerShell, autenticado na conta Cloudflare correta.
3. Copie o `database_id` retornado e substitua `SUBSTITUA_PELO_DATABASE_ID_DO_CLOUDFLARE` em `wrangler.jsonc`.
4. Execute `npx wrangler d1 execute hyron-history --remote --file=database/0001_history.sql` para criar as tabelas **no banco remoto**.
5. Execute `npm run check` para validar TypeScript.
6. `git add .`, `git commit -m "V-0.3 - Historico persistente D1"`, `git push origin main`.
7. Confirme o deploy automático no Cloudflare. Não configure chaves de API no GitHub.

## Privacidade e limites

- A conversa é recuperada no mesmo navegador após atualizar a página e fechar/reabrir o navegador, desde que o armazenamento local não seja apagado.
- O conteúdo fica armazenado no D1. O token de cada conversa fica em `localStorage` e é verificado no backend por SHA-256. Quem tiver acesso ao navegador poderá acessar as conversas. Não é um sistema de contas/autenticação robusto.
- A lista de conversas não é sincronizada entre dispositivos; se apagar o `localStorage`, perde os tokens para recuperar conversas, embora os dados possam continuar no banco.
- O endpoint público ainda precisa de autenticação real e rate limiting antes de uso por terceiros. `HYRON_ACCESS_KEY` continua opcional e não deve ser embutida no JavaScript público.
- A mensagem do usuário é gravada antes da chamada à LLM. Em caso de falha de provedor, atualize a conversa para recuperar a pergunta armazenada.
- A V-0.3 não importa automaticamente as mensagens da V-0.2: elas existiam apenas na memória temporária da página.
- Para deploys automatizados, mantenha o binding D1 declarado no `wrangler.jsonc`; nunca coloque segredos no repositório.
