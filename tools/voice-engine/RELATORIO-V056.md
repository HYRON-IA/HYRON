# HYRON Voice Engine v0.5.6 — Relatório de validação Piper

## Resultado

**Piper TTS PT-BR real foi executado e validado no Windows x64, via API local
do Voice Engine.** O processo usado foi o runtime Piper configurado, não o
Windows SAPI: a requisição selecionou `engineId: "piper"`, o job terminou com
`engineId: "piper"`/`completed`, e o endpoint existente de áudio devolveu WAV
RIFF/WAVE. O RVC continua explicitamente indisponível; nenhum checkpoint
`.pth` foi aberto.

O runtime e o modelo são instalações locais, ignoradas pelo Git. Não houve
deploy, publicação nem mudança no Worker principal, D1, Wrangler, `public/` ou
Storage Bridge.

## Runtime

- **Projeto/origem:** OHF-Voice, release oficial
  [v1.8.0](https://github.com/OHF-Voice/piper1-gpl/releases/tag/v1.8.0),
  publicado em 2026-09-04.
- **Distribuição:** wheel CPython ABI3 para Windows x64:
  `piper_tts-1.8.0-cp39-abi3-win_amd64.whl`, 34.119.688 bytes.
- **SHA-256 do wheel:** `5da9bfdb05dfe15da3536859d422e605483ffa6d2b3ec2c5b9593bae6b5aa6a4`;
  conferido contra o digest do GitHub Release antes da instalação.
- **Compatibilidade CLI:** `piper.exe --help` apresentou `--model` e
  `--output_file`; o código-fonte upstream declara os aliases e o entry point
  `piper = piper.__main__:main`. A sondagem e a inferência usam execução sem
  shell.
- **Licença do runtime:** GPL-3.0-or-later (`COPYING` do upstream e metadados
  do pacote). Esta cópia está instalada só localmente. Qualquer redistribuição
  do runtime deve cumprir as obrigações GPL aplicáveis, incluindo licença e
  disponibilização do código-fonte correspondente nos termos da licença.
- **Ambiente:** Python 3.14.5 local; `piper-tts` 1.8.0, `onnxruntime` 1.31.0
  (CPU), `numpy` 2.5.4, `pathvalidate` 3.3.1, `flatbuffers` 25.12.19,
  `packaging` 26.3, `protobuf` 7.36.2 e dependências transitivas instaladas em
  `.piper-runtime`. O console script fica em
  `.piper-runtime\Scripts\piper.exe`. Nenhum CUDA/GPU foi instalado ou usado.
- **Diretório:** `.piper-runtime/`, ignorado pelo Git. A configuração local
  `.env` aponta `PIPER_EXECUTABLE` para esse console script.

## Voz pt-BR e licença

- **Voz:** `pt_BR-edresson-low`, português brasileiro, qualidade low,
  amostragem declarada de 16.000 Hz; configuração Piper seleciona o fonemizador
  `pt-br`.
- **Origem fixada:** coleção mantida em
  [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices), revisão
  `c10ece1aade47bb51c153c893d14e5bf8e5b7117`.
- **Arquivos:** `pt_BR-edresson-low.onnx` (63.104.526 bytes) e
  `pt_BR-edresson-low.onnx.json` (4.168 bytes). O sidecar foi lido pelo parser
  JSON do Node e validado pelo Engine.
- **SHA-256 ONNX:** `de4cecee38b30bb1a6378a337af605d59f0c377df702c6a6752870db8991cd84`,
  igual ao hash LFS da revisão consultada.
- **Cartão da voz:** [MODEL_CARD](https://huggingface.co/rhasspy/piper-voices/blob/c10ece1aade47bb51c153c893d14e5bf8e5b7117/pt/pt_BR/edresson/low/MODEL_CARD)
  aponta o [TTS-Portuguese-Corpus](https://github.com/Edresson/TTS-Portuguese-Corpus),
  sob CC BY 4.0, e declara fine-tuning sobre `en_US-ryan-low`.
- **Base de treinamento:** o cartão upstream de
  [Ryan/low](https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/ryan/low/MODEL_CARD)
  declara CC BY-NC-SA 4.0 para o dataset Ryan Speech. Para este uso local,
  adotamos conservadoramente a restrição NC-SA da base: uso não comercial,
  atribuição e share-alike quando aplicável. Não redistribuímos o peso nem o
  áudio. O cartão da voz pt-BR **não declara separadamente uma licença
  inequívoca para o arquivo ONNX**; não considerar esse artefato liberado para
  uso comercial ou redistribuição sem autorização/licença adicional do
  responsável.
- **Diretório:** `.piper-models/`, ignorado pelo Git. Os dois arquivos foram
  obtidos explicitamente da revisão citada; o Engine não efetua downloads.

## Configuração local

`tools\voice-engine\.env` foi configurado localmente, com chaves aleatórias que
não são exibidas nem versionadas:

```dotenv
PIPER_EXECUTABLE=<workspace>\tools\voice-engine\.piper-runtime\Scripts\piper.exe
PIPER_MODEL_PATH=<workspace>\tools\voice-engine\.piper-models\pt_BR-edresson-low.onnx
TTS_TIMEOUT_SECONDS=180
```

`MAX_AUDIO_SIZE_MB` permaneceu em 32; concorrência e fila existentes foram
mantidas. O teste opt-in substituiu apenas sua configuração temporária para
dar 180 segundos ao modelo executado em CPU. O Engine continuou limitado por
timeout, tamanho/duração do WAV e cancelamento; não foi introduzido fallback
para SAPI.

## Evidência da chamada real

Teste opt-in:

```powershell
$env:HYRON_TEST_PIPER = "1"
$env:PIPER_EXECUTABLE = (Resolve-Path .\tools\voice-engine\.piper-runtime\Scripts\piper.exe).Path
$env:PIPER_MODEL_PATH = (Resolve-Path .\tools\voice-engine\.piper-models\pt_BR-edresson-low.onnx).Path
Push-Location tools\voice-engine
npm.cmd test
npm.cmd run typecheck
Pop-Location
```

Também foi iniciado o entrypoint real com `node --env-file=.env
src/index.ts`; a API respondeu health `ok`, versão `0.5.6`, e `/engines`
autenticado reportou Piper disponível com `pt_BR-edresson-low`. O processo foi
encerrado após a verificação. A rota de síntese e o download do job foram
verificados pela integração local descrita abaixo.

O teste iniciou servidores locais da Voice Library e do Voice Engine e
verificou:

1. `GET /health` — HTTP 200, versão `0.5.6`.
2. `GET /engines` autenticado — Piper disponível e voz
   `pt_BR-edresson-low` listada.
3. `POST /synthesize` — HTTP 202 com texto exato
   “Olá! Eu sou o HYRON. Ideias, código e boas conversas. Agora eu tenho uma
   voz de verdade.”, `engineId: "piper"` e `voiceName:
   "pt_BR-edresson-low"`.
4. `GET /jobs/:id` — estado `completed` e mecanismo `piper`.
5. `GET /jobs/:id/audio` autenticado — HTTP 200, assinatura RIFF/WAVE, hash
   SHA-256 do corpo e validação pelo `AudioProcessor`.

Um job concluído, a validação WAV e o código de saída zero observado pelo
`PiperEngine` atestam inferência real com o executável instalado. O arquivo
persistente baixado da API é:

`tools\voice-engine\tests\output\piper-pt-br-v056.wav`

- Tamanho: **260.652 bytes**
- Formato: **RIFF/WAVE**
- Taxa de amostragem: **16.000 Hz**
- Duração calculada do chunk de dados: **7,952 s**
- SHA-256: `9f9485b7bb04245f799c75bb423b8ed8800a51233fc9f0723c080ac7b5b368b7`
- Ignorado pelo Git (`*.wav`); runtime e modelo também ignorados.

Não foi possível confirmar reprodução auditiva nesta execução; o relatório não
declara qualidade perceptual/audição comprovada.

## Testes e limitações

- `npm.cmd test` com o opt-in real Piper habilitado: **10 passaram, 0 falharam,
  0 ignorados**; duração reportada pelo runner: 19,05 s. A inferência Piper
  integrada levou 12,65 s nesta execução.
- `npm.cmd run typecheck`: **PASS** (`tsc --noEmit`).
- `git diff --check -- tools/voice-engine`: **PASS**.
- Windows SAPI e testes de indisponibilidade RVC foram mantidos na mesma
  suíte.
- Teste somente em Windows x64/CPU. Linux está preparado pelo adaptador para
  outro executável Piper CLI compatível, mas não foi testado.
- O modelo é low quality e relativamente lento em CPU; o limite local foi
  configurado em 180 segundos. Uso comercial/redistribuição do peso não está
  autorizado por este relatório devido à licença restritiva da base e à falta
  de declaração separada para o ONNX.
- RVC continua indisponível e não faz parte desta validação.
