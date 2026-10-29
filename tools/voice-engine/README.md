# HYRON Voice Engine v0.5.8

API local e modular para síntese de voz. Windows SAPI continua operacional.
Piper foi instalado e validado neste ambiente com uma voz pt-BR, CPU e saída
WAV real. Os binários e pesos ficam em pastas ignoradas pelo Git e não são
distribuídos pelo repositório. Kokoro e conversão RVC permanecem indisponíveis;
o runtime RVC encontrado não passou pela revisão de carregamento seguro e o
checkpoint local não tem proveniência/licença verificáveis.
Nenhum mecanismo/modelo é baixado automaticamente pelo Engine.

## Requisitos

- Windows 10/11 para Windows SAPI; Linux poderá usar Piper quando configurado.
- Node.js 24 ou superior.
- A Voice Library v0.5.3 em execução local em `127.0.0.1:8790`.
- Uma chave local de pelo menos 32 caracteres. Para o modo de principal único
  atual, `ENGINE_API_KEY` e `VOICE_LIBRARY_API_KEY` devem ser iguais.

O Voice Engine escuta somente em `127.0.0.1`; não o exponha à internet. A chave
compartilhada identifica um único principal local, não implementa
multiusuário real e não substitui autenticação da sessão do HYRON.

## Instalação e execução no Windows

Em PowerShell, a partir da raiz do repositório:

```powershell
Set-Location tools\voice-engine
Copy-Item .env.example .env
```

Edite `.env` e defina uma chave forte, aleatória e privada, com pelo menos 32
caracteres, nos campos `ENGINE_API_KEY` e `VOICE_LIBRARY_API_KEY`. Não reutilize
uma chave publicada. O `.env` é local e não deve ser versionado.

Inicie primeiro a Voice Library e então execute `iniciar-servidor.bat` ou:

```powershell
npm.cmd start
```

O script verifica Node, configuração e disponibilidade do endpoint de saúde da
Voice Library. Ele não imprime chaves. Não é necessário instalar dependências
adicionais para a configuração atual: os testes usam `node:test` e o servidor
usa módulos integrados do Node.js.

## Configuração

| Variável | Padrão | Descrição |
|---|---:|---|
| `ENGINE_API_KEY` | — | Chave Bearer local; mínimo de 32 caracteres. |
| `VOICE_LIBRARY_API_KEY` | — | Chave de acesso entre serviços; deve ser igual à chave do Engine no modo atual. |
| `VOICE_LIBRARY_URL` | `http://127.0.0.1:8790` | URL local da Voice Library. Só HTTP no loopback `127.0.0.1` é permitido. |
| `ENGINE_PORT` | `8792` | Porta local de escuta. |
| `ENGINE_TEMP_DIRECTORY` | `./temporary-audio` | Diretório isolado de arquivos de áudio temporários. |
| `MAX_TEXT_LENGTH` | `3000` | Máximo de caracteres por síntese. |
| `MAX_AUDIO_SIZE_MB` | `32` | Tamanho máximo da saída WAV. |
| `MAX_AUDIO_DURATION_SECONDS` | `300` | Duração máxima do áudio. |
| `TTS_TIMEOUT_SECONDS` | `60` | Limite de tempo por geração. |
| `MAX_JOBS` | `8` | Limite de jobs ativos/em espera/retidos. |
| `JOB_TTL_MINUTES` | `30` | Retenção dos jobs e arquivos resultantes; limpeza também ocorre periodicamente. |
| `PIPER_EXECUTABLE` | — | Caminho local do executável Piper verificado. |
| `PIPER_MODEL_PATH` | — | Caminho de um modelo ONNX Piper; exige o sidecar `.onnx.json`. |
| `PIPER_MODEL_DIRECTORY` | — | Diretório local de modelos `.onnx` com sidecars `.onnx.json`; prevalece sobre `PIPER_MODEL_PATH`. |

Não coloque senhas, tokens ou credenciais reais no repositório. O `.env` é
ignorado pelo Git.

### Runtime e voz Piper pt-BR no Windows x64

O Engine não baixa runtime nem modelos por conta própria. Para reproduzir a
configuração verificada desta versão:

1. Obtenha o wheel Windows x64 `piper_tts-1.8.0-cp39-abi3-win_amd64.whl` do
   [release oficial OHF-Voice v1.8.0](https://github.com/OHF-Voice/piper1-gpl/releases/tag/v1.8.0),
   compare o SHA-256 publicado (`5da9bfdb05dfe15da3536859d422e605483ffa6d2b3ec2c5b9593bae6b5aa6a4`),
   crie um venv local `.piper-runtime` e instale o wheel com suas dependências
   de CPU. O release é `GPL-3.0-or-later`; redistribuir o runtime requer
   cumprir as obrigações da GPLv3 (incluindo disponibilizar a licença e o
   código-fonte correspondente conforme aplicável). Esta instalação local não
   redistribui o runtime.
2. Baixe, manualmente, o par `pt_BR-edresson-low.onnx` e
   `pt_BR-edresson-low.onnx.json` da revisão fixa
   [`c10ece1`](https://huggingface.co/rhasspy/piper-voices/tree/c10ece1aade47bb51c153c893d14e5bf8e5b7117/pt/pt_BR/edresson/low).
   O hash LFS publicado do ONNX é
   `de4cecee38b30bb1a6378a337af605d59f0c377df702c6a6752870db8991cd84`.
   Seu cartão identifica português brasileiro e declara CC BY 4.0 para o
   dataset; também registra o fine-tuning sobre `Ryan/low`, cujo cartão declara
   CC BY-NC-SA 4.0. Por precaução, trate o modelo derivado sob a condição mais
   restritiva: uso não comercial, atribuição e share-alike quando aplicável.
   Não redistribua o peso nem use em produto/serviço comercial sem esclarecer
   previamente os direitos do modelo derivado. O cartão não declara uma licença
   separada e inequívoca para o arquivo ONNX.
3. Configure `PIPER_EXECUTABLE` para
   `.piper-runtime\Scripts\piper.exe` e `PIPER_MODEL_PATH` para o ONNX local.
   O diretório `.piper-runtime` e `.piper-models` são ignorados pelo Git.
4. Consulte `GET /engines`; o mecanismo Piper deve estar disponível e listar
   `pt_BR-edresson-low` em `voices`. Em `POST /synthesize`, informe
   `engineId: "piper"` e `voiceName: "pt_BR-edresson-low"`.

O teste de integração real é opt-in: defina `HYRON_TEST_PIPER=1`,
`PIPER_EXECUTABLE` e `PIPER_MODEL_PATH` no ambiente antes de executar
`npm.cmd test`. O teste cria servidores locais reais para a Voice Library e o
Voice Engine, sintetiza pelo endpoint HTTP Piper e preserva a amostra em
`tests\output\piper-pt-br-v057.wav` (ignorada pelo Git). Sem essas variáveis,
o teste é ignorado. A execução neste Windows gerou uma amostra real; confira
[RELATORIO-V057.md](./RELATORIO-V057.md) para os resultados atuais, métricas da
amostra e avaliação do bloqueio RVC. O histórico está em
[RELATORIO-V056.md](./RELATORIO-V056.md).

## Mecanismos

- **Windows SAPI:** usa o runtime `System.Speech` instalado no Windows, sem
  dependência de serviço remoto ou download de modelo. Saída WAV. As vozes
  disponíveis dependem da instalação do Windows.
- **Piper:** verifica o executável configurado executando `--help` sem shell e
  exige a interface CLI com `--model` e `--output_file`, modelo ONNX não vazio
  e sidecar JSON válido. O runtime não é instalado nem baixado pelo Engine.
  A voz é o nome-base do arquivo ONNX, sem a extensão; envie `voiceName` para
  selecioná-la. Sem `voiceName`, a síntese só é aceita quando há exatamente um
  modelo instalado/configurado. Os modelos Piper disponíveis são listados no
  campo `voices` de `/engines`. O processo tem timeout e limite de tamanho de
  saída; toda saída também passa pela validação WAV comum.

  Para habilitar Piper, obtenha e verifique manualmente a procedência/licença
  do executável e modelo, configure os caminhos acima e instale o sidecar
  correspondente (`voz.onnx.json`). A licença upstream do Piper CLI é
  GPL-3.0-or-later ([projeto Piper](https://github.com/OHF-Voice/piper1-gpl));
  licenças de vozes/modelos são independentes e precisam ser verificadas
  individualmente. Nenhum modelo é distribuído ou baixado automaticamente.
  Nesta revisão, a inferência real foi comprovada com `pt_BR-edresson-low` em
  CPU; consulte o relatório da v0.5.6 para os limites de licença/proveniência.
- **Kokoro:** ponto de extensão que informa indisponibilidade. Não há runtime ou
  pesos instalados/testados neste protótipo; os pesos publicados em
  [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) indicam Apache-2.0,
  mas a licença de cada runtime/dependência também deve ser verificada antes
  de habilitar a integração.
- **RVC:** indisponível. Arquivos `.pth` e `.index` não são executados,
  desserializados ou carregados; nenhum modelo local foi aberto. A cópia local
  do runtime usa PyTorch 2.7.1, cujo `torch.load` opera por padrão com
  `weights_only=True`, e Transformers 4.49 também habilita carregamento restrito
  para o HuBERT `.bin`. Porém, os loaders RVC não fixam explicitamente essa
  opção, dependem do comportamento/configuração do PyTorch, e a origem/licença/
  autorização dos checkpoints e índices locais não foi verificada. A inferência
  também usa `faiss.read_index` sobre índice binário, não auditado como entrada
  hostil. Por isso `GET /engines` continua reportando RVC indisponível e
  `/convert` retorna erro explícito. Consulte
  [RELATORIO-V058.md](./RELATORIO-V058.md) e o histórico da
  [RELATORIO-V057.md](./RELATORIO-V057.md).

WAV é o único formato aceito/servido. MP3 e OGG não são anunciados porque não
há codificador implementado. O catálogo `/engines` informa disponibilidade
verificada em runtime.

## API

Todas as rotas, exceto `GET /health`, exigem:

```http
Authorization: Bearer <ENGINE_API_KEY>
```

As respostas JSON de sucesso usam `{ "success": true, "data": ... }`; falhas
usam `{ "success": false, "error": { "code": "...", "message": "..." } }`.

| Método e rota | Função |
|---|---|
| `GET /health` | Verificação básica, sem autenticação. |
| `GET /engines` | Estado dos mecanismos e formatos disponíveis. |
| `GET /voices` | Lista vozes da Voice Library local. |
| `POST /synthesize` | Enfileira síntese e retorna HTTP 202 com ID do job. |
| `POST /convert` | Verifica referência RVC e retorna erro explícito de indisponibilidade (503). |
| `GET /jobs/:id` | Consulta o estado do job do principal autenticado. |
| `GET /jobs/:id/audio` | Faz streaming do WAV concluído do principal autenticado. |
| `DELETE /jobs/:id` | Cancela/remove job e seus arquivos temporários. |

Exemplo de síntese:

```http
POST http://127.0.0.1:8792/synthesize
Authorization: Bearer <ENGINE_API_KEY>
Content-Type: application/json

{
  "text": "Olá. Eu sou HYRON.",
  "engineId": "windows-sapi",
  "voiceName": "Microsoft Zira Desktop"
}
```

`engineId` e `voiceName` são opcionais. O mecanismo padrão é `windows-sapi`;
para SAPI, `voiceName` deve corresponder ao nome instalado no Windows. Para
Piper, é o nome-base do modelo ONNX disponível. `voiceId` seleciona/valida uma
voz cadastrada na Voice Library, mas não altera o modelo Piper global local.
`convert: true` exige uma voz cadastrada como RVC, mas retorna
`ENGINE_NOT_AVAILABLE` enquanto não existir conversor seguro implementado.

Campos aceitos por `POST /synthesize`: `text` (obrigatório), `engineId`,
`voiceName`, `voiceId` e `convert` (boolean). Campos desconhecidos são
rejeitados. Não são aceitos parâmetros RVC até que exista runtime seguro.

O job retorna imediatamente, por exemplo:

```json
{
  "success": true,
  "data": {
    "id": "<job-uuid>",
    "status": "queued",
    "engineId": "windows-sapi",
    "createdAt": "<data-hora>",
    "updatedAt": "<data-hora>"
  }
}
```

Consulte `GET /jobs/:id` até `status` ser `completed` ou `failed`, e então
busque `GET /jobs/:id/audio`. Jobs e WAVs expiram após o TTL. A limpeza é
executada por requisições e por uma rotina periódica. Cancelamento encerra
processos em execução e aguarda o encerramento Piper antes de remover os
temporários. O estado `running` permanece no contrato de síntese v0.5.4; não
há job de conversão enquanto RVC estiver indisponível.

## Voice Library

O cliente usa os contratos locais existentes `GET /voices`,
`GET /voices/default`, `GET /voices/:id` e
`GET /voices/:id/files/:fileId`. Antes de solicitar um arquivo, verifica se o
ID está associado à voz e se sua extensão é compatível com o tipo registrado.
IDs internos são validados e codificados na URL. A Voice Library v0.5.3 opera
com uma única chave/principal local; por isso este vínculo não oferece
isolamento multiusuário real nem integra a identidade de sessão do Worker.
RVC não busca nem carrega seus arquivos porque seu mecanismo de conversão não
está disponível.

## Testes e typecheck

```powershell
npm.cmd test
npm.cmd run typecheck
```

O teste de integração SAPI gera áudio real se Windows SAPI estiver disponível;
caso contrário, falha explicitamente em vez de aceitar áudio fictício. Os
demais testes cobrem API/autenticação, seleção, jobs, falhas, cancelamento,
isolamento de identidade, Voice Library e indisponibilidade RVC. Testes usam
dados sintéticos e removem seus diretórios temporários. O teste Piper real é
opt-in e preserva uma amostra, conforme descrito acima.

A amostra SAPI preexistente em
`output\d19411ee-05ea-43b6-90ce-22430792ea9e\speech.wav` (WAV, 7,83 s) continua
ignorada pelo Git. A inferência Piper PT-BR da v0.5.6 foi salva em
`tests\output\piper-pt-br-v056.wav`; tamanho, duração e SHA-256 estão no
relatório [RELATORIO-V056.md](./RELATORIO-V056.md). A amostra da v0.5.7 foi
salva em `tests\output\piper-pt-br-v057.wav`; suas métricas constam em
[RELATORIO-V057.md](./RELATORIO-V057.md).

## Segurança e limitações

- API vinculada estritamente ao loopback e autenticada por Bearer token.
- IDs de job imprevisíveis e comparação de credenciais em tempo constante.
- Cada job/arquivo é acessível somente à identidade derivada da chave válida.
- Texto limitado; entradas JSON têm limite de 64 KiB.
- Processos Piper/SAPI são iniciados sem shell; saída não revela caminhos locais.
- WAV é validado e limitado por tamanho/duração; não se carregam modelos.
- Jobs são mantidos em memória: reiniciar o processo elimina o catálogo e o
  acesso às tarefas, e a persistência não é multi-instância.
- Autenticação HYRON, política de identidade multiusuário e integração D1 não
  estão implementadas.
- Não existe integração TeraBox nesta versão.
- RVC continua explicitamente indisponível.

As licenças citadas são referências dos projetos/fontes consultados, não uma
avaliação jurídica. Verifique a licença e a origem dos artefatos concretos
antes de distribuir runtime ou modelos.

Consulte [RELATORIO-V058.md](./RELATORIO-V058.md) para a auditoria do runtime
RVC e o estado desta versão. A evidência real de Piper e os resultados da
v0.5.7 estão em [RELATORIO-V057.md](./RELATORIO-V057.md); a validação inicial
Piper está em [RELATORIO-V056.md](./RELATORIO-V056.md), e a arquitetura em
[RELATORIO-V054.md](./RELATORIO-V054.md).
