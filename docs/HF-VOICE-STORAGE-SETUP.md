# HYRON v0.5.14 — Configuração do armazenamento de vozes (Hugging Face)

## Arquitetura

- **D1**: cadastro e seleção das vozes + estado de cada objeto remoto (migration `0006`).
- **Hugging Face Storage Buckets**: somente binários privados `.pth`, `.onnx`, `.index`, `.json` e `.wav`.
- **Cloudflare Worker**: valida conta/dono, gera URLs S3 SigV4 curtas, confirma existência/tamanho com HEAD, exclui objetos e transmite downloads autenticados por streaming.
- **Windows e navegador Android**: verificam SHA-256 dos arquivos de pacote e armazenam objetos validados no IndexedDB de cada dispositivo. **Isso não instala um runtime RVC no Android**.
- Não há **R2** e não há necessidade de mover o banco ou alterar conversas.

## Antes de começar

1. Faça uma conta Hugging Face (se ainda não tiver) e crie um **Storage Bucket privado** em https://huggingface.co/buckets. Sugestão: `hyron-voices`.
2. No Hugging Face, vá às configurações de Access Tokens. Crie um **fine-grained token** com acesso Write limitado ao bucket. No menu do token, selecione **Generate S3 credentials** e salve o `HFAK...` e a chave secreta **somente no gerenciador de segredos**.
3. Use o *namespace* da conta ou organização onde o bucket foi criado, **não necessariamente o usuário do GitHub**. O endpoint é fixado como `https://s3.hf.co/<namespace>`, região `us-east-1`, path-style. Não coloque a URL inteira na variável `HF_S3_NAMESPACE`.
4. No projeto Windows, execute após garantir que a v0.5.13 já está implantada:

```powershell
npm.cmd install
npm.cmd run check
npm.cmd test
npx.cmd wrangler d1 export hyron-history --remote --output=backup-hyron-v0514.sql
npx.cmd wrangler d1 execute hyron-history --remote --file=database/0006_v0514_cloud_voice_storage.sql
```

5. Configure **quatro** segredos no Worker sem gravar as chaves em arquivos públicos:

```powershell
npx.cmd wrangler secret put HF_S3_NAMESPACE
npx.cmd wrangler secret put HF_S3_BUCKET
npx.cmd wrangler secret put HF_S3_ACCESS_KEY_ID
npx.cmd wrangler secret put HF_S3_SECRET_ACCESS_KEY
```

6. Faça o deploy, depois do backup e da migração:

```powershell
npx.cmd wrangler deploy
```

> Nunca execute `0005_v0513_voice_library.sql` novamente: os `ALTER TABLE` dessa migração não são idempotentes. O novo `0006` usa `CREATE TABLE IF NOT EXISTS`.

## Teste de ponta a ponta (obrigatório antes do uso real)

1. Faça login no HYRON e abra **Voice Library**.
2. Importe localmente um pacote de teste pequeno, com `manifest.json` e SHA-256 correto, cuja voz você tenha autorização para usar.
3. Clique **Enviar à nuvem**. O navegador primeiro tenta fazer PUT diretamente no bucket com uma URL assinada por 10 minutos; se o CORS do provedor bloquear e o arquivo for menor que 80 MiB, usa relay autenticado/streaming pelo Worker. A duração total do upload deve respeitar o vencimento de cada link.
4. Verifique a indicação **Disponível na nuvem** na mesma conta.
5. Abra o HYRON em um navegador novo/Android, **na mesma conta**, e clique **Baixar da nuvem**. O navegador primeiro tenta CDN direta via URL assinada; se houver erro/CORS, utiliza o fluxo autenticado do Worker. **Verifica tamanho e SHA-256 novamente** antes de armazenar no IndexedDB.
6. Confira uma prévia WAV, se incluída; confirme que o download é recusado após deslogar e com outra conta.
7. Exclua a voz e confira a exclusão no bucket privado. Se o provedor rejeitar DELETE, a API interrompe a remoção do metadado para evitar perder a referência de um objeto ainda armazenado.

**Até concluir esse teste com credenciais reais, o upload e download externos não estão validados em produção.** Os testes automatizados utilizam respostas S3 simuladas. CORS, redirecionamento do CDN, `If-None-Match`, PUT/HEAD/DELETE e o encaminhamento de corpos grandes pelo gateway precisam de confirmação real.

## Rotas autenticadas

| Rota | Método | Descrição |
|---|---|---|
| `/api/voices/cloud/config` | GET | Disponibilidade da configuração, sem chaves |
| `/api/voices/cloud/status` | GET | Resumo dos uploads da conta |
| `/api/voices/:id/cloud/init` | POST | Reserva as partes esperadas no D1; para prévia inclui `{preview:{bytes,sha256}}` |
| `/api/voices/:id/cloud/upload/:part` | POST | Gera autorização SigV4 PUT para uma parte pendente |
| `/api/voices/:id/cloud/file/:part` | PUT | Relay limitado a 80 MiB para CORS (fallback) |
| `/api/voices/:id/cloud/complete` | POST | Confere HEAD/tamanho de todas as partes e marca ready |
| `/api/voices/:id/cloud/download/:part` | GET | Emite link SigV4 GET para cliente autenticado |
| `/api/voices/:id/cloud/file/:part` | GET | Encaminha stream autenticado para o navegador |
| `/api/voices/:id` | DELETE | Exclui objetos remotos, depois metadados D1 |

`part` só pode ser `model`, `support` ou `preview`. Nenhuma URL de storage é armazenada no D1; são armazenadas chaves geradas pelo backend. Todas as rotas verificam sessão e `user_id`.

## Restrições, integridade e privacidade

- **Armazenamento**: cota estimada de 2 GiB por conta e 80 GiB global para limitar uso do espaço gratuito. Essas verificações **não são cotas transacionais/concurrency-safe** e não substituem monitoramento da fatura e de cotas no provedor.
- **Arquivos**: máximo de 100 MiB por modelo/auxiliar e 32 MiB por prévia (regras herdadas da v0.5.13). Relay fallback: até 80 MiB; uploads maiores dependem do PUT direto com CORS.
- **Hash**: SHA-256 já é validado pelo importador do navegador e novamente no download. A API confirma somente o **tamanho** remoto por HEAD: o gateway HF não preserva `x-amz-meta-*` e a API não faz hash do conteúdo inteiro. Não descreva isso como **verificação criptográfica de integridade pelo servidor**. Um usuário mal-intencionado pode enviar binários incorretos sob seus próprios metadados. Nunca execute checkpoints automaticamente.
- **RVC**: o uso de `.pth` exige runtime confiável e loader `weights_only=True`, separado do armazenamento. O HYRON não passa a falar na voz importada automaticamente; a integração de inferência ainda é pendente.
- **Confiabilidade**: importação interrompida pode deixar objetos pendentes, que podem ser retomados em até 45 minutos; se expirarem, a próxima tentativa limpa os antigos primeiro. Exclusão Worker/D1 não é uma transação distribuída. Monitore objetos órfãos e falhas antes de operar em escala.
- **Privacidade**: apesar do bucket privado, links SigV4 temporários são credenciais bearer de escopo limitado. Não exponha em logs, analytics, documentação ou redes sociais. A política de acesso individual é aplicada pelo Worker, não por bucket isolado por usuário.
- **Limites Hugging Face**: o plano gratuito tem franquia privada compartilhada; preços e condições podem mudar. Verifique [storage limits](https://huggingface.co/docs/hub/storage-limits) e [S3 compatibility](https://huggingface.co/docs/hub/storage-buckets-s3) periodicamente.
- **Apps**: navegador Android pode guardar objetos em IndexedDB e acessar endpoints existentes; este repositório não contém app Android nativo nem motor RVC nativo, portanto não há teste de Android nativo/óculos.
