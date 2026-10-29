# HYRON Storage Bridge v0.2

API REST local e independente para desenvolver e testar a biblioteca de modelos RVC/Piper sem depender do TeraBox. O serviço usa Node.js e disco local; não integra com o Cloudflare Worker nem com D1 e não executa, desserializa ou carrega modelos recebidos.

## Requisitos

- Windows 10/11
- Node.js 24 ou superior (TypeScript strip-only nativo)
- npm disponível como `npm.cmd`
- TypeScript já instalado na raiz do HYRON para executar a verificação de tipos

Não há dependências npm adicionais.

## Iniciar no Windows

No PowerShell, a partir da pasta raiz do repositório:

```powershell
Copy-Item tools\terabox-bridge\.env.example tools\terabox-bridge\.env
notepad tools\terabox-bridge\.env
```

Defina `STORAGE_API_KEY` com um valor aleatório de pelo menos 32 caracteres. Esta chave identifica um usuário local; o servidor deriva um identificador interno a partir dela. Não envie `userId` no corpo ou na query string. O serviço escuta apenas em `127.0.0.1`, não deve ser exposto à Internet e não substitui autenticação do HYRON.

Inicie clicando duas vezes em `tools\terabox-bridge\iniciar-servidor.bat` ou com:

```powershell
Push-Location tools\terabox-bridge
npm.cmd start
Pop-Location
```

O serviço usa `http://127.0.0.1:8788` por padrão. A pasta `storage/` é criada conforme necessário; arquivos e partes pendentes ficam ignorados pelo Git.

## Configuração

As variáveis estão em `.env.example`:

| Variável | Padrão | Descrição |
|---|---:|---|
| `STORAGE_PROVIDER` | `local` | `local` ou `terabox`. TeraBox não está configurado e responde erro explícito. |
| `STORAGE_DIRECTORY` | `./storage` | Diretório de arquivos, metadados e sessões temporárias. |
| `STORAGE_API_KEY` | obrigatório | Chave local de desenvolvimento; mínimo 32 caracteres. |
| `MAX_FILE_SIZE_MB` | `512` | Tamanho total máximo aceito por arquivo. |
| `MAX_CHUNK_SIZE_MB` | `8` | Tamanho máximo configurável por parte. |
| `MAX_USER_STORAGE_MB` | `2048` | Quota por identidade/chave; considera arquivos finalizados e sessões ativas. |
| `PORT` | `8788` | Porta local (1–65535). |
| `TERABOX_CLIENT_ID` | vazio | Credencial OAuth TeraBox para o teste v0.1. |
| `TERABOX_CLIENT_SECRET` | vazio | Credencial OAuth TeraBox para o teste v0.1. |
| `TERABOX_PRIVATE_SECRET` | vazio | Segredo de assinatura OAuth para o teste v0.1. |
| `TERABOX_AUTH_CODE` | vazio | Código OAuth de uso único para o teste v0.1. |

Autentique as rotas privadas usando o header HTTP `Authorization` com o esquema `Bearer`, passando `STORAGE_API_KEY` como credencial. `GET /health` é público e não fornece dados de arquivos.

## API REST

Todas as rotas, exceto `GET /health`, exigem autenticação. Respostas JSON seguem `{ "success": true, "data": ... }` ou `{ "success": false, "error": { "code": "...", "message": "..." } }`. A transferência de arquivo `GET /api/files/:fileId` é um corpo binário em streaming, com checksum e tipo nos headers.

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/health` | Saúde do serviço; pública. |
| `GET` | `/api/files` | Lista somente os arquivos do usuário identificado pela chave. |
| `POST` | `/api/uploads` | Cria sessão de upload retomável. JSON: `filename`, `size` em bytes, `checksum` SHA-256 hex e, opcionalmente, `chunkSize` em bytes (não maior que o limite configurado). |
| `PATCH` | `/api/uploads/:uploadId` | Envia a próxima parte em corpo binário, com `X-Chunk-Index` começando em zero e `Content-Length` exato. |
| `GET` | `/api/uploads/:uploadId` | Consulta partes recebidas, próximo índice e expiração para retomar. |
| `POST` | `/api/uploads/:uploadId/complete` | Valida integridade/tamanho e finaliza quando todas as partes estiverem presentes. |
| `DELETE` | `/api/uploads/:uploadId` | Cancela a sessão e remove partes temporárias. |
| `GET` | `/api/files/:fileId` | Faz download do arquivo em streaming. |
| `DELETE` | `/api/files/:fileId` | Exclui arquivo do usuário autenticado. |

### Protocolo retomável

1. Calcule o SHA-256 do arquivo localmente. `POST /api/uploads` com JSON, por exemplo:

   ```json
   {
     "filename": "voz.pth",
     "size": 1048576,
     "checksum": "<sha256-hex>",
     "chunkSize": 8388608
   }
   ```

   `chunkSize` é opcional; o padrão é `MAX_CHUNK_SIZE_MB`. A resposta inclui `uploadId`, `totalChunks`, `receivedChunks` e `nextChunkIndex`.
2. Envie somente a parte indicada como próxima. `PATCH /api/uploads/<uploadId>` com `X-Chunk-Index: 0`, `Content-Length` igual ao tamanho esperado e o conteúdo binário da parte. Partes são gravadas em disco sem agregar o arquivo inteiro à memória. Índices ausentes, duplicados ou fora de ordem são rejeitados.
3. Se houver interrupção, consulte `GET /api/uploads/<uploadId>` e continue a partir de `nextChunkIndex`. Sessões e partes são persistidas no diretório `.uploads`; uma sessão expira após 24 horas desde a última parte recebida.
4. `POST /api/uploads/<uploadId>/complete` só aceita sessão completa. O provedor grava para arquivo temporário, calcula tamanho e SHA-256 durante o streaming e só então publica arquivo e metadados. Checksum incorreto retorna `422 CHECKSUM_MISMATCH` e não publica o arquivo.
5. `DELETE /api/uploads/<uploadId>` cancela e apaga a sessão.

Ao iniciar, o servidor limpa sessões expiradas ou inválidas. Sessões próprias expiradas também são removidas quando consultadas; as sessões ativas são contabilizadas na quota. Os arquivos permitidos são `.pth`, `.index`, `.onnx` e `.onnx.json`; os dois primeiros são identificados como RVC e os dois últimos como Piper. A extensão e o nome são validados e o nome nunca é usado como caminho de disco.

## Teste da API e verificação de tipos

Com o serviço configurado, execute:

```powershell
Push-Location tools\terabox-bridge
npm.cmd test
Pop-Location
```

Para validar os tipos a partir da raiz do repositório:

```powershell
node node_modules\typescript\bin\tsc --noEmit -p tools\terabox-bridge\tsconfig.json
```

Os testes usam arquivos pequenos e fictícios em diretórios temporários; não usam modelos reais, credenciais TeraBox ou a API remota. O detalhe e o resultado da execução ficam em `RELATORIO-V02.md`.

## Teste OAuth legado do TeraBox

`testar-conexao.bat` continua executando a troca OAuth v0.1, agora em `src\terabox-auth-test.ts`. Ela requer credenciais oficiais, não aceita senha da conta e não é necessária para o provedor local. O fluxo OAuth ainda depende da obtenção de `client_id`, `client_secret`, `private_secret` e código de autorização junto ao TeraBox; consulte `RELATORIO-AUTENTICACAO.md` e `docs\TERABOX-API-RESEARCH.md`.

`TeraBoxStorageProvider` é apenas um adaptador estrutural. Enquanto não houver OAuth integrado e credenciais oficiais, todas as operações retornam `503 PROVIDER_NOT_CONFIGURED`. A estrutura não finge sucesso nem usa endpoints privados ou cookies.

## Limitações e próximos passos

- A chave local compartilhada não substitui autenticação por usuário do HYRON. Antes de expor esta API, integrar um mecanismo de identidade confiável no backend e mapear claims verificados a `userId`; não confiar no cliente.
- Armazenamento local é somente para desenvolvimento no dispositivo/servidor local e não fornece redundância ou acesso entre dispositivos.
- TeraBox ainda não foi conectado, e seus limites para arquivos maiores que 300 MB não foram confirmados. O limite local de 512 MB não garante capacidade do TeraBox.
- Próximos passos: revisar política de autenticação do HYRON, integrar o adaptador a autenticação real, testar disco e recuperação operacional em ambiente controlado, e só depois implementar o protocolo oficial de upload TeraBox aprovado.
- Não há integração D1, deploy, migrações ou publicação externa neste protótipo.
