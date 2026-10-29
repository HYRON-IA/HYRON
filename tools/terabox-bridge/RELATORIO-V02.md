# Relatório — HYRON Storage Bridge v0.2

## Arquitetura implementada

- Serviço HTTP independente em Node.js 24/TypeScript, vinculado somente a `127.0.0.1`.
- `StorageProvider` define upload, download, listagem, exclusão e verificação de existência.
- `LocalStorageProvider` usa streaming para ler/escrever arquivos em disco. Os dados são organizados por hash do identificador de usuário derivado da chave de API; nomes de arquivos não são usados como caminhos. IDs de arquivo e upload são UUIDs aleatórios.
- `TeraBoxStorageProvider` preserva o ponto de extensão para a nuvem, mas todas as operações falham explicitamente como não configuradas. A implementação OAuth v0.1 foi preservada em `src/terabox-auth-test.ts`, acionada por `testar-conexao.bat`.
- Sessões multipart persistem metadados e partes no diretório local `.uploads`. O arquivo final é montado em streaming para um temporário do provedor local, com validação de tamanho e SHA-256 antes de ser publicado.
- O API key local é enviado no header HTTP `Authorization` usando o esquema `Bearer`; o backend deriva o ID do usuário da chave validada. Nenhum endpoint aceita `userId` arbitrário do cliente. Esta chave única é apenas um mecanismo de desenvolvimento, não a autenticação final multiusuário do HYRON.
- Não há acesso a Worker, D1, migração, implantação ou publicação externa.

## Endpoints disponíveis

| Método | Rota | Resultado |
|---|---|---|
| `GET` | `/health` | Health público em JSON. |
| `GET` | `/api/files` | Lista somente arquivos do principal autenticado. |
| `POST` | `/api/uploads` | Cria sessão com `filename`, `size`, SHA-256 `checksum` e `chunkSize` opcional. |
| `PATCH` | `/api/uploads/:uploadId` | Recebe parte binária sequencial com `X-Chunk-Index` e `Content-Length`. |
| `GET` | `/api/uploads/:uploadId` | Consulta progresso/próxima parte para retomada. |
| `POST` | `/api/uploads/:uploadId/complete` | Finaliza somente se todas as partes e checksum/tamanho estiverem corretos. |
| `DELETE` | `/api/uploads/:uploadId` | Cancela e apaga a sessão temporária. |
| `GET` | `/api/files/:fileId` | Download binário em streaming. |
| `DELETE` | `/api/files/:fileId` | Exclui o arquivo do principal autenticado. |

As respostas JSON seguem envelope `success/data` ou `success/error`. O download é um stream binário com `X-Content-SHA256` e `X-Model-Type`.

## Protocolo de upload retomável

1. Calcular previamente o tamanho em bytes e SHA-256 do arquivo.
2. `POST /api/uploads` com JSON contendo `filename`, `size`, `checksum` e, opcionalmente, `chunkSize`. O servidor valida extensão, tamanho total, tamanho máximo de chunk e quota (arquivos finais + uploads ativos).
3. Enviar a parte esperada em `PATCH /api/uploads/:uploadId`, `X-Chunk-Index` iniciado em zero, `Content-Length` exato e conteúdo binário no corpo. O servidor só aceita sequência estrita; os bytes são gravados em disco, nunca acumulados como arquivo inteiro em memória.
4. Em interrupção, `GET /api/uploads/:uploadId` retorna `nextChunkIndex`; continuar dessa parte. Metadados e partes recebidas sobrevivem a reinício do processo.
5. `POST /api/uploads/:uploadId/complete` verifica partes e tamanho e transmite cada parte sequencialmente ao provedor. O provedor calcula o hash enquanto grava e só publica após SHA-256/tamanho baterem.
6. `DELETE /api/uploads/:uploadId` cancela a sessão. Sessões expiram 24 horas após a última parte recebida; são removidas na inicialização, ao serem consultadas após expiração e ao enumerar sessões para reservar quota.

Extensões permitidas: `.pth`, `.index`, `.onnx`, `.onnx.json`. `.pth` e `.index` são identificados como RVC; `.onnx` e `.onnx.json`, como Piper. Os arquivos são tratados exclusivamente como bytes; não são executados, desserializados ou carregados como modelos.

## Como iniciar no Windows

1. Requer Node.js 24+ e npm.
2. Na raiz do repositório:

   ```powershell
   Copy-Item tools\terabox-bridge\.env.example tools\terabox-bridge\.env
   notepad tools\terabox-bridge\.env
   ```

3. Preencher `STORAGE_API_KEY` com pelo menos 32 caracteres aleatórios; não usar credencial real de serviço.
4. Iniciar `tools\terabox-bridge\iniciar-servidor.bat` ou usar:

   ```powershell
   Push-Location tools\terabox-bridge
   npm.cmd start
   Pop-Location
   ```

O endereço local padrão é `http://127.0.0.1:8788`. Para o teste OAuth v0.1 separado, usar `testar-conexao.bat` somente depois de receber credenciais oficiais.

## Testes e verificações

Comandos:

```powershell
Push-Location tools\terabox-bridge
npm.cmd test
Pop-Location
node node_modules\typescript\bin\tsc --noEmit -p tools\terabox-bridge\tsconfig.json
```

**Resultado da execução local nesta versão:** 12 testes automatizados passaram; 0 falharam. A verificação TypeScript `--noEmit` passou. Também iniciei o entrypoint com configuração fictícia, consultei `/health` e encerrei o processo; o smoke test confirmou `HYRON Storage Bridge v0.2`. Os testes exercitam health/autenticação, upload pequeno, upload em partes com reinício e retomada, limpeza de sessão expirada, identificação Piper `.onnx.json`, validação de sequência, rejeição de upload incompleto, rejeição de checksum incorreto sem publicação, extensões/path traversal, limites de arquivo/quota, isolamento por usuário e erro explícito do provedor TeraBox não configurado. Os bytes de teste são pequenos e fictícios.

## Limitações atuais

- A chave única do `.env` mapeia todo acesso local a um principal; não substitui login/autenticação por usuário do HYRON nem deve ser exposta na Internet.
- Vincular apenas a `127.0.0.1` limita a execução ao ambiente local. Para acesso de outros dispositivos é necessário um serviço de backend seguro e autenticação real.
- O estado local depende do disco desta máquina; não oferece replicação, backup ou compartilhamento remoto.
- O carregamento de configuração exige `STORAGE_API_KEY` com pelo menos 32 caracteres. `.env.example` é um modelo; o valor precisa ser definido antes de iniciar.
- Não foi feito teste de carga com arquivos próximos a 512 MB; os testes são intencionalmente pequenos.
- O protótipo não fornece uma URL de callback OAuth. O `code` precisa vir de fluxo aprovado pelo TeraBox.
- TeraBox continua sem credenciais oficiais; não foi feita chamada autenticada à API e não foi confirmado suporte contratual/limite máximo acima de 300 MB.

## O que falta para integrar ao HYRON

1. Integrar identidade e autorização ao fluxo oficial de autenticação do HYRON; mapear claims verificados para principal interno e negar acesso entre usuários.
2. Definir armazenamento durável e políticas de quota/retention para ambiente de produção; decidir se metadados vão ao D1 depois de revisão de esquema separada.
3. Adicionar limites operacionais, observabilidade sem segredos, proteção de abuso e testes de carga/falha adequados ao ambiente remoto.
4. Implantar somente mediante autorização explícita e após revisão de segurança/operacional; esta tarefa não fez deploy.

## O que falta para integrar ao TeraBox

1. Obter `client_id`, `client_secret` e `private_secret` por canal oficial; a documentação pública pesquisada não especifica o formulário/canal ou critérios de aprovação.
2. Confirmar a elegibilidade da conta/projeto e como obter o authorization code/callback aprovado.
3. Adaptar o fluxo OAuth v0.1 para armazenamento seguro/renovação concorrente de refresh token e resolução/cache de domínios.
4. Implementar os métodos do `TeraBoxStorageProvider` usando somente endpoints oficiais documentados.
5. Confirmar com o provedor os limites de armazenamento, frequência, diretório e suporte a arquivos acima de 300 MB, depois realizar teste autorizado.

Referências de autenticação e endpoints estão em `RELATORIO-AUTENTICACAO.md` e `../../docs/TERABOX-API-RESEARCH.md`.
