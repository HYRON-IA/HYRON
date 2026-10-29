# Relatório técnico — HYRON v0.5.14 Cloud Voice Storage

## Entrega

Integração de armazenamento opcional para a biblioteca v0.5.13, usando **Hugging Face Storage Buckets S3** com Worker/D1 existentes. O ZIP entregue reúne o código-fonte atualizado e preserva o histórico, memórias e roteador multi-LLM sem alterá-los.

Arquivos principais:

- `src/hf-bucket.ts`: validador de configuração, criação de URLs SigV4 via WebCrypto, assinatura para GET/PUT/HEAD/DELETE e proteção contra caminho impróprio.
- `src/voice-cloud.ts`: verificação de propriedade de voz, controle de upload, limpeza, HEAD remoto, download autenticado e streaming relay de upload/download; desacoplado do modelo de linguagem.
- `src/index.ts`: adiciona as rotas cloud após o login existente e limpa objetos antes de excluir voz.
- `database/0006_v0514_cloud_voice_storage.sql`: vínculo de partes ao dono e à voz; estados pendente/pronto.
- `public/app.js` / `public/index.html`: botões **Enviar à nuvem** e **Baixar da nuvem**, verificação SHA-256 dos downloads e armazenamento no IndexedDB; mantém voz do navegador como fallback.
- `tests/hf-bucket.test.ts` / `tests/voice-cloud.test.ts`: verificação de URLs assinadas, isolamento entre contas, estados, migração e downloads com serviço simulado.
- `docs/HF-VOICE-STORAGE-SETUP.md`: configuração segura, migração, deploy e roteiro de teste externo.

## Resultados reais desta sessão

- Verificação de sintaxe: `node --check public/app.js`: passou.
- `node --experimental-strip-types --test ...` abrangendo testes da v0.5.13 e novos testes: **18 passaram, 0 falharam**.
- `tsc --noEmit`: passou **com declaração local mínima simulada de tipos Workers/D1**, pois não foi possível obter a dependência oficial `@cloudflare/workers-types` neste ambiente. Reexecutar em Windows com `npm.cmd install` e `npm.cmd run check` é obrigatório.
- **Não foi feito** deploy Cloudflare, migração D1 remota ou operações reais HF: não há namespace, bucket ou credenciais fornecidas. Não declarar transferência end-to-end concluída.

## Escopo de segurança

- Bucket privado, credenciais exclusivamente em segredos do Worker; não usar R2.
- URLs SigV4 expiram (GET 60–120 s, PUT 10 min). PUT restringe Content-Type e usa `If-None-Match: *`; *o comportamento do gateway HF precisa de validação em produção*.
- O servidor só marca upload pronto após HEAD confirmar todos os tamanhos; o cliente verifica hash SHA-256 de cada arquivo no download. **O servidor não atesta hash remoto.**
- Downloads tentam CDN assinada diretamente e usam streaming autenticado pelo Worker como fallback de CORS/rede. Upload tenta PUT direto e faz fallback por streaming no Worker para arquivos com até 80 MiB.
- Sem uploads silenciosos, execução de checkpoints, `torch.load` ou novas dependências de inferência.
- Cotas estimadas: 2 GiB por conta / 80 GiB global, com possível concorrência; acompanhe custos/uso na conta Hugging Face.

## Limitações e próximos passos

1. Fazer backup, aplicar migração D1 e configurar 4 segredos HF no Worker conforme `docs/HF-VOICE-STORAGE-SETUP.md`.
2. Testar PUT/HEAD/GET/DELETE contra bucket real privado, incluindo CORS no navegador, relay Worker, hash no Android e expiração de tickets. **Até lá, o armazenamento remoto é implementação preparada, não funcionalidade comprovada em produção.**
3. Verificar espaço e custos; monitorar tentativas órfãs e, no futuro, implementar cota transacional.
4. Concluir inferência Piper→RVC e runtime Android: armazenar arquivo **não** faz a voz escolhida funcionar automaticamente.
5. Nenhuma alteração foi enviada ao GitHub: deve-se revisar e integrar o ZIP/patch no repositório local, commitar e fazer deploy por conta própria.
