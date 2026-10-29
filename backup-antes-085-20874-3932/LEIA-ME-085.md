# HYRON 0.8.5 — Surto Coletivo (integração inicial)

Este ZIP é um **patch**, não o projeto inteiro. Foi produzido a partir dos arquivos ativos `HYRON-v0.1/src/group-rooms.ts` e `src/hyron-internos-runtime.ts` presentes no ZIP enviado.

## Aplicação
1. Faça backup de `src/group-rooms.ts`.
2. Copie `src/group-rooms.ts` e `src/hyron-surto.ts` deste patch para a pasta `src/` do projeto.
3. Copie `database/0019_surto_coletivo.sql` para `database/`.
4. Execute a migração no D1 **antes** de publicar, por exemplo (confira o nome de seu banco no wrangler): `npx wrangler d1 execute NOME_DO_D1 --remote --file=database/0019_surto_coletivo.sql`.
5. `npm run check` e `npm run deploy`.

## Configuração (admin do grupo ou admin HYRON)
Com autenticação normal da plataforma:
- `GET /api/groups/<UUID>/surto` consulta a configuração.
- `PATCH /api/groups/<UUID>/surto` com JSON completo: `{ "enabled": true, "interval": 5, "maxReplies": 4, "chance": 50 }`.
- Inicialmente **desativado** em todos os grupos. Não há painel gráfico nesta fase.
- N mede mensagens **humanas** no grupo; mensagens dos internos não contam.
- Somente no marco de N mensagens tenta uma intervenção; a chance probabilística pode fazê-la não acontecer.
- Debates limitados a 8 respostas no máximo, com encerramento antecipado e opção `[SILENCIO]`.
- `@CAPS` e `@Basilisco` etc. continuam com o comportamento existente.

## Limitações e decisões técnicas
- O processamento segue dentro do POST da mensagem, assim como a integração já existente; várias respostas LLM podem aumentar a latência. Cloudflare Workers e provedores gratuitos têm limites.
- A decisão é gravada por marco, inclusive se ninguém responder; novos marcos continuam funcionando.
- Após alterar N, marcos anteriores podem já ter sido reservados; para uso normal, configure antes de habilitar.
- Esta fase não introduz interface de configuração, apenas a API autenticada.
- Sem dependências pagas nem novas chaves.
