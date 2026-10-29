# HYRON v0.5.5 — Relatório de conclusão

## Estado geral

**Entrega parcial; a v0.5.5 não atende ao critério de conversão RVC funcional.**
O Windows SAPI continua operacional e foi exercitado por geração real. O
adaptador Piper foi ampliado para detectar o CLI configurado, descobrir/listar
modelos ONNX locais, selecionar um modelo pelo nome e impor limites ao
processo/saída. Não havia runtime/modelo Piper configurado para comprovar
inferência neste ambiente. RVC permanece explicitamente indisponível: nenhum
runtime seguro foi configurado ou validado, nenhum checkpoint foi baixado,
aberto ou desserializado e nenhum áudio foi apresentado como convertido.

Nenhuma dependência foi adicionada. Não houve deploy/publicação nem alterações
no Worker principal, D1, Wrangler ou `public/`. As alterações de implementação
ficaram em `tools/voice-engine/`.

## Funcionalidades e arquivos

- **Piper:** `PiperEngine` verifica o executável local configurado com `--help`
  sem shell e exige os argumentos CLI `--model` e `--output_file`. Reconhece
  modelos `.onnx` não vazios com sidecar `.onnx.json` legível como objeto JSON,
  lista até 100 modelos no diretório configurado e seleciona pelo nome-base do
  arquivo. Timeout, cancelamento, limite de tamanho da saída e validação WAV
  são aplicados. Os nomes disponíveis aparecem em `voices` no estado de Piper
  de `GET /engines`.
- **Áudio:** o validador também recusa cabeçalhos RIFF e blocos de dados cujo
  tamanho declarado ultrapasse o arquivo.
- **Compatibilidade:** Windows SAPI, as rotas existentes, o contrato de
  `VoiceLibraryVoice` e o status de job `running` foram preservados. A resposta
  de `/health` e o pacote indicam versão `0.5.5`.
- Arquivos alterados: `.env.example`, `README.md`, `package.json`,
  `src/index.ts`, `src/api/server.ts`, `src/engines/PiperEngine.ts`,
  `src/services/AudioProcessor.ts`, `src/services/VoicePipeline.ts`,
  `src/types/VoiceEngine.ts`, `types/node-runtime.d.ts` e
  `tests/voice-engine.test.ts`.
- Arquivo criado: `RELATORIO-V055.md`.

## Piper: instalação e configuração

Não há download ou instalação automatizados. O operador deve obter
separadamente um binário Piper CLI e um modelo/voz, verificar procedência,
licenças e compatibilidade, e então configurar em `tools\voice-engine\.env`:

```dotenv
PIPER_EXECUTABLE=C:\caminho\verificado\piper.exe
PIPER_MODEL_PATH=C:\caminho\modelos\pt_BR-voz.onnx
# Alternativa para listar/selecionar mais de uma voz local:
PIPER_MODEL_DIRECTORY=C:\caminho\modelos
```

O diretório prevalece sobre `PIPER_MODEL_PATH`. Cada ONNX deve ter seu
sidecar `.onnx.json`. Reinicie o Engine após instalar/trocar runtime ou
configuração. Use `GET /engines` para consultar disponibilidade e nomes de voz;
na síntese, `engineId: "piper"` e `voiceName` igual ao nome-base ONNX escolhem
uma voz. Sem `voiceName`, somente uma instalação com exatamente um modelo pode
ser selecionada implicitamente.

O upstream do Piper CLI declara GPL-3.0-or-later. Isso não estabelece a licença
de cada modelo: **nenhum modelo foi instalado, distribuído ou teve sua licença
verificada neste trabalho**. A proveniência e licença de cada voz precisam ser
verificadas antes do uso. Não há binários/modelos de terceiros incorporados.

## RVC e Voice Library

`RVCEngine.isAvailable()` continua retornando `false`. `POST /convert` mantém a
resposta explícita `ENGINE_NOT_AVAILABLE`; não inicia job de conversão. O
endpoint atual aceita somente `voiceId`. A validação consulta a voz registrada
e exige referências dos tipos `.pth` e `.index`, mas não baixa os arquivos,
não analisa seu conteúdo e não os carrega. A validação por extensão não
comprova compatibilidade interna do checkpoint.

A Voice Library v0.5.3 usa os contratos locais de listagem, voz padrão,
consulta individual e referência/obtenção de arquivos. `VoiceLibraryClient`
confere a associação do arquivo à voz antes de baixar. Como o runtime RVC não
está habilitado, o Engine não recupera os pesos para inferência. A chave de
serviço única continua identificando um principal local; isso **não é
isolamento multiusuário real** nem autenticação de sessão HYRON.

Em consequência, permanecem pendentes: conversão de texto-a-fala seguida de
RVC, jobs de conversão, parâmetros de conversão e estados RVC `processing`/
`completed`. O contrato de síntese continua usando `running`, para não quebrar
clientes v0.5.4. Não foi implementado fallback que devolva áudio original.

## Sistemas e recursos

- **Windows:** SAPI segue como alternativa funcional sem exigir Piper, GPU ou
  serviço pago. Piper requer CLI Windows verificado e caminhos locais.
- **Linux:** Piper está preparado para executar um binário nativo configurado
  que aceite a mesma interface CLI, sem dependência do Windows SAPI. Linux não
  foi testado nesta execução.
- **CPU/GPU:** não há dependência CUDA nem requisito de GPU para SAPI ou para
  um build Piper compatível com CPU. RAM e desempenho Piper dependem do tamanho
  do modelo/implementação escolhidos; não foram medidos. RVC não foi executado,
  portanto não há capacidades/dispositivo RVC para reportar.
- **Limites:** Engine reutiliza timeout, máximo de tamanho/duração WAV, limite
  de jobs e fila existente. Piper monitora o arquivo durante execução e o WAV
  é validado ao final; cancelamento aguarda o fechamento do subprocesso antes
  da limpeza. O subprocesso recebe ambiente reduzido e é iniciado com
  `shell: false`.

## Testes e áudio realmente gerado

Comandos executados em `tools\voice-engine`:

```text
npm.cmd test
  10 testes: 9 passaram, 0 falharam, 1 ignorado
  O teste de inferência real Piper foi ignorado porque não havia configuração
  explícita de runtime/modelo.

npm.cmd run typecheck
  PASS
```

A suíte incluiu geração e streaming reais por Windows SAPI, validação de
assinatura WAV e SHA-256, teste de cabeçalho WAV truncado, detecção/enumeração
de arquivos Piper simulados, indisponibilidade explícita de RVC, validação de
referências Voice Library, timeout/cancelamento de jobs e regressões da API.
Os fixtures Piper são sintéticos; **não contam como inferência real**.

O teste SAPI real gerou e baixou um WAV RIFF/WAVE válido durante a execução;
seus diretórios temporários foram removidos pelo teste, portanto não há amostra
persistente desta execução nem hash de amostra v0.5.5 a registrar. O artefato
preexistente documentado na v0.5.4 continua presente em
`output\d19411ee-05ea-43b6-90ce-22430792ea9e\speech.wav` (345.286 bytes,
SHA-256 `58dba51d555308bcc0bf03409b417621251ed6971251257a961584db64b4dda1`);
não foi regenerado nem alterado por esta implementação. WAVs permanecem
ignorados pelo Git.

**Conversão RVC real: não executada e não demonstrada.**

## Segurança, limitações e próximos passos

- Nenhum `.pth` enviado/armazenado é desserializado com PyTorch ou passado a
  runtime RVC. Não existe runtime RVC seguro validado disponível aqui.
- Processos Piper usam argumentos fixos, sem shell; textos são enviados via
  stdin. Não há downloads ou execução automática de scripts/modelos. Erros e
  disponibilidade não expõem saída do executável ou caminhos internos.
- A sondagem `--help` executa apenas o binário Piper apontado explicitamente
  pelo operador. O binário e suas dependências precisam ser confiáveis.
- Não há teste de inferência real Piper neste ambiente; também não há testes
  Linux, medição de RAM/CPU/GPU ou validação de licença de modelo específico.
- A API permanece local e autenticada por chave compartilhada; não deve ser
  exposta à internet. Multiusuário real continua dependente de infraestrutura
  de identidade/autorização que não foi alterada.
- Próximas etapas: instalar runtime/modelo Piper com licenças verificadas e
  executar inferência de ponta a ponta; selecionar e revisar um runtime RVC
  com carregamento restrito/sandbox antes de habilitar conversão; integrar
  identidade multiusuário confiável; ampliar testes de subprocessos no Windows
  e Linux. Até essas evidências existirem, RVC deve continuar indisponível.
