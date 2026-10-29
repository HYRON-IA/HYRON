# HYRON Voice Library v0.5.3

API local e independente para catalogar modelos RVC/Piper, associá-los ao HYRON Storage Bridge v0.2 e manter amostras de áudio em disco. Esta versão não altera o Worker principal, D1, `public/`, Wrangler ou a implementação OAuth do TeraBox.

Os arquivos de modelo são tratados apenas como bytes: não são executados, desserializados nem carregados. Não há inferência, conversão de voz, chamada ao TeraBox ou dependência npm nova.

## Requisitos

- Windows 10/11
- Node.js 24 ou superior
- `npm.cmd`
- Dependências locais já presentes na raiz do repositório para o typecheck
- HYRON Storage Bridge v0.2 em execução em `127.0.0.1:8788`

## Configuração e inicialização no Windows

Inicie e configure primeiro o Storage Bridge:

```powershell
Copy-Item tools\terabox-bridge\.env.example tools\terabox-bridge\.env
notepad tools\terabox-bridge\.env
```

Defina `STORAGE_API_KEY` com uma chave aleatória de pelo menos 32 caracteres. Crie a configuração da Voice Library:

```powershell
Copy-Item tools\voice-library\.env.example tools\voice-library\.env
notepad tools\voice-library\.env
```

Defina `VOICE_API_KEY` e `BRIDGE_API_KEY` com o **mesmo valor** usado em `STORAGE_API_KEY`. Não cole essa chave em páginas web nem a envie ao frontend. O Bridge v0.2 aceita uma única chave configurada; usar a mesma chave faz a identidade derivada pela Voice Library corresponder ao principal que o Bridge autoriza.

Inicie clicando duas vezes em `iniciar-servidor.bat` ou no PowerShell:

```powershell
Push-Location tools\voice-library
npm.cmd start
Pop-Location
```

A API escuta somente em `http://127.0.0.1:8790`; o Bridge continua em `http://127.0.0.1:8788`. O script BAT valida Node.js, configuração e disponibilidade do `/health` do Bridge sem imprimir as chaves.

## Variáveis de ambiente

| Variável | Padrão | Uso |
|---|---|---|
| `VOICE_API_KEY` | obrigatório | Chave local Bearer; mínimo de 32 caracteres. |
| `BRIDGE_API_KEY` | obrigatório | Deve ser igual às chaves `VOICE_API_KEY` e `STORAGE_API_KEY` enquanto o Bridge suportar apenas um principal. |
| `BRIDGE_URL` | `http://127.0.0.1:8788` | Endereço local real da API do Bridge. Outros hosts/protocolos são rejeitados. |
| `VOICE_PORT` | `8790` | Porta da Voice Library, de 1 a 65535. |
| `VOICE_DATA_DIRECTORY` | `./data` | Catálogos persistentes; um JSON por identidade derivada. |
| `PREVIEW_DIRECTORY` | `./preview-storage` | Áudio e metadados locais separados do Bridge. |
| `MAX_PREVIEW_SIZE_MB` | `32` | Limite por amostra de áudio. |

O endpoint `/health` é público. Todas as rotas `/voices` exigem `Authorization: Bearer <chave-local>`. A comparação da credencial é feita em tempo constante; a identidade vem exclusivamente da credencial validada, nunca de `userId` enviado pelo cliente. O serviço não deve ser exposto à Internet.

## Endpoints

Respostas JSON usam `{ "success": true, "data": ... }` ou `{ "success": false, "error": { "code": "...", "message": "..." } }`. Downloads retornam bytes em streaming.

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/health` | Estado da API local. |
| `GET` | `/voices?search=...&language=pt-BR&modelType=RVC` | Lista e filtra apenas o catálogo autenticado. |
| `POST` | `/voices` | Cria modelo; aceita `name`, `description`, `language`, `modelType` e `fileIds` existentes no Bridge. |
| `GET` | `/voices/:id` | Consulta um modelo. |
| `PATCH` | `/voices/:id` | Atualiza `name`, `description` ou `language`. |
| `DELETE` | `/voices/:id` | Remove o registro, seleção padrão e amostra local; preserva os arquivos de modelo no Bridge. |
| `GET` | `/voices/default` | Consulta a voz padrão, ou `null`. |
| `PUT` | `/voices/default` | Define `{ "voiceId": "<uuid>" }` ou limpa com `{ "voiceId": null }`. |
| `GET` | `/voices/:id/files` | Lista referências associadas. |
| `POST` | `/voices/:id/files` | Associa `{ "fileId": "<uuid>" }` após validar no Bridge. |
| `GET` | `/voices/:id/files/:fileId` | Download autorizado em streaming; exige associação à voz. |
| `DELETE` | `/voices/:id/files/:fileId` | Remove associação; exclui o arquivo físico do Bridge somente quando não há outra voz referenciando-o. |
| `GET` | `/voices/:id/preview` | Disponibiliza a amostra associada em streaming. |
| `POST` | `/voices/:id/preview` | Substitui/associa amostra binária; exige Content-Length, tipo e SHA-256. |
| `DELETE` | `/voices/:id/preview` | Remove associação e amostra local. |

Tipos de modelo: `RVC`, `ONNX`, `OTHER`. Extensões permitidas no Bridge:

| Extensão | Tipo de modelo compatível |
|---|---|
| `.pth`, `.index` | `RVC` |
| `.onnx`, `.onnx.json` | `ONNX` |
| As extensões aceitas acima | `OTHER` |

As amostras aceitam `audio/mpeg`, `audio/wav` ou `audio/ogg`; além do Content-Type, o módulo verifica assinaturas básicas (ID3/frame MP3, RIFF/WAVE ou OggS). Isso valida o formato declarado, não decodifica nem converte áudio.

## Fluxo para associar um modelo existente

O upload de modelos continua sendo responsabilidade do Bridge, incluindo sessões multipart, retomada, quota, checksum e streaming. A Voice Library não duplica nem reimplementa esse protocolo.

1. Envie o arquivo permitido pelo endpoint multipart documentado em `tools/terabox-bridge/README.md`.
2. Obtenha o `fileId` de `GET http://127.0.0.1:8788/api/files` usando a chave local no header `Authorization`.
3. Crie a voz com IDs já existentes:

   ```powershell
   $headers = @{
     Authorization = "Bearer <CHAVE_LOCAL>"
     "Content-Type" = "application/json"
   }
   $body = @{
     name = "Voz de demonstração"
     description = "Amostra fictícia"
     language = "pt-BR"
     modelType = "RVC"
     fileIds = @("<UUID_DO_ARQUIVO_PTH>")
   } | ConvertTo-Json
   Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8790/voices -Headers $headers -Body $body
   ```

4. Para associar outro arquivo depois, use `POST /voices/:id/files` com JSON `{ "fileId": "<uuid>" }`.

O Adapter usa apenas rotas confirmadas na implementação real do Bridge: `GET /api/files`, `GET /api/files/:fileId` e `DELETE /api/files/:fileId`; a verificação de existência é feita consultando a listagem autenticada. A API mantém o download como stream. Não há rota inventada nem alteração do contrato do Bridge.

## Amostras

Envie bytes diretamente, sem multipart, com `Content-Length`, Content-Type e digest SHA-256:

```powershell
$bytes = [System.IO.File]::ReadAllBytes(".\amostra.mp3")
$sha = [Convert]::ToHexString(
  [System.Security.Cryptography.SHA256]::HashData($bytes)
).ToLowerInvariant()
Invoke-WebRequest -Method Post `
  -Uri "http://127.0.0.1:8790/voices/<VOICE_ID>/preview" `
  -Headers @{
    Authorization = "Bearer <CHAVE_LOCAL>"
    "X-Content-SHA256" = $sha
  } `
  -ContentType "audio/mpeg" `
  -Body $bytes
```

Áudio é armazenado separadamente por identidade em `PREVIEW_DIRECTORY`; ele não é enviado ao Bridge e não altera as extensões permitidas do Bridge. Identificadores de amostra são opacos e os diretórios são derivados da identidade autenticada.

## Persistência, integridade e segurança

- Catálogos usam JSON versionado por identidade e substituição atômica de arquivo. Um snapshot ausente inicia catálogo vazio; JSON corrompido/incompatível gera erro explícito, não um catálogo de sucesso vazio.
- Nomes de arquivo não são usados como caminhos. IDs são UUIDs gerados pelo servidor e diretórios são derivados por SHA-256 da identidade.
- O Adapter restringe a comunicação ao Bridge HTTP em `127.0.0.1`, usa Bearer e verifica que a identidade autorizada corresponde à identidade derivada pela Voice Library.
- A associação confere o arquivo na listagem autenticada do Bridge, extensão permitida e compatibilidade do tipo. Um ID conhecido de outro usuário não é associado quando o provedor o declara indisponível para aquela identidade.
- A remoção de uma referência compartilhada não apaga o arquivo. A remoção da última referência usa `DELETE /api/files/:fileId`. Apagar uma voz inteira preserva todos os arquivos de modelo do Bridge para evitar remoção acidental de dados; eles podem ficar sem referência e ser limpos explicitamente depois.
- Mensagens de erro não incluem caminhos locais ou credenciais; logs registram apenas a classe do erro.

## Limitações conhecidas

- O Bridge v0.2 aceita uma única `STORAGE_API_KEY`. Por segurança, esta versão exige a mesma chave para a Voice Library; portanto, a implantação local real suporta **um principal de armazenamento**. O isolamento por identidade no registry foi testado com identidades autenticadas distintas, mas uma configuração multiusuário em produção requer suporte multi-principal no Bridge ou um serviço de autenticação/proxy confiável. Não foi simulado como se o Bridge suportasse isso.
- O Worker principal autentica sessões via D1. Este processo local não valida essas sessões e a tarefa não alterou o Worker; a integração online ainda precisa de um proxy que valide a sessão do HYRON e encaminhe uma identidade verificada.
- Não há UI, API de inferência, conversão de áudio, integração TeraBox nem edição do D1.
- A exclusão de voz preserva arquivos de modelo não mais referenciados; limpeza automática/orphan recovery ainda não está implementada.
- Escrita atômica protege substituição de snapshots, mas não substitui backup, sincronização entre múltiplos processos nem recuperação de disco.

## Testes e typecheck

Na pasta `tools\voice-library`:

```powershell
npm.cmd test
npm.cmd run typecheck
```

Os testes usam diretórios temporários, bytes de áudio fictícios e um Storage Bridge local com provedor de disco. Não chamam TeraBox nem usam credenciais reais. O relatório de execução/versionamento está em [RELATORIO-V053.md](./RELATORIO-V053.md).
