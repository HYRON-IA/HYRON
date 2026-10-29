# HYRON v0.5.4 — Relatório de implementação

## Arquitetura implementada

O protótipo é independente do Worker principal e usa Node.js local. A API HTTP
fica vinculada a `127.0.0.1`; autentica chamadas por Bearer token configurado
fora do código, associa jobs à identidade derivada da chave e mantém jobs em
memória. Arquivos WAV são gravados em diretórios temporários por job e servidos
em streaming após a validação.

Componentes:

- Contratos TTS/conversão e tipos em `src/types/VoiceEngine.ts`.
- Windows SAPI, Piper opcional, Kokoro indisponível e RVC indisponível em
  `src/engines/`.
- Pipeline/job store, cliente Voice Library e validação WAV em `src/services/`.
- API local, autenticação, validação de requisições e respostas JSON em
  `src/api/server.ts`.
- Testes unitários, teste da API/Voice Library e integração de áudio SAPI em
  `tests/voice-engine.test.ts`.

## Mecanismos e formatos

| Mecanismo | Estado verificado | Saída |
|---|---|---|
| Windows SAPI / System.Speech | Funcional neste Windows: o teste end-to-end gerou, consultou e baixou um WAV RIFF/WAVE não vazio com checksum validado. | WAV |
| Piper | Adaptador para executável/modelo ONNX e sidecar configurados pelo usuário; runtime e modelo ausentes neste ambiente, portanto geração não comprovada. | WAV, quando configurado |
| Kokoro | Indisponível; sem runtime/pesos instalados e validados. | Nenhuma |
| RVC | Indisponível; nenhuma conversão simulada, modelo `.pth` não carregado/desserializado. | Nenhuma |

Somente WAV é exposto. MP3/OGG não foram implementados.

Piper upstream: [OHF-Voice/piper1-gpl](https://github.com/OHF-Voice/piper1-gpl),
GPL-3.0-or-later. Os pesos
[Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) indicam Apache-2.0;
runtime e dependências não foram instalados. A licença deve ser revalidada
para cada binário, modelo e voz antes de distribuição.

## Voice Library

Integra as rotas reais locais de listagem, consulta da voz padrão/individual e
download de arquivo. Referências são validadas contra a voz cadastrada e seu
tipo. A implementação não baixa nem executa modelos RVC porque não existe
runtime seguro de conversão.

A Voice Library v0.5.3 e este protótipo ainda dependem de um principal local
por chave API. Igualar as chaves de serviço permite interoperabilidade local,
mas não é autenticação multiusuário ou substituto para a sessão HYRON. O
Worker, D1 e seus contratos não foram alterados.

## Endpoints

- `GET /health` — health básico sem autenticação.
- `GET /engines` — catálogo e estado dos engines.
- `GET /voices` — lista vozes Voice Library.
- `POST /synthesize` — cria job assíncrono, resposta HTTP 202.
- `POST /convert` — retorna indisponibilidade explícita até conversão segura.
- `GET /jobs/:id` — estado e erro do job do proprietário.
- `GET /jobs/:id/audio` — streaming do WAV concluído do proprietário.
- `DELETE /jobs/:id` — cancela e remove job/arquivos temporários.

Endpoints autenticados exigem `Authorization: Bearer <ENGINE_API_KEY>`. IDs de
job são UUIDs aleatórios; arquivos e metadados internos não são expostos na
resposta pública. Limites de texto, áudio, duração, tempo e concorrência são
configuráveis. A limpeza de jobs expirados roda em intervalos e também durante
as requisições.

## Windows: configuração e execução

1. Instale Node.js 24 ou superior.
2. Inicie a Voice Library v0.5.3 em `127.0.0.1:8790`.
3. Em PowerShell, entre em `tools\voice-engine` e copie `.env.example` para
   `.env`.
4. Defina em `.env` uma chave aleatória forte, privada, com pelo menos 32
   caracteres; no modo atual `ENGINE_API_KEY` deve ser igual a
   `VOICE_LIBRARY_API_KEY`.
5. Execute `iniciar-servidor.bat` ou `npm.cmd start`.
6. Confirme `GET http://127.0.0.1:8792/health`.

O serviço não deve ser exposto diretamente na internet. Consulte o README para
valores de configuração, exemplos HTTP e comportamento das rotas.

## Testes e validação

- `npm.cmd run typecheck` — passou.
- `npm.cmd test` — 7 testes passaram; 0 falharam.
- Geração SAPI real — passou no teste end-to-end: job concluído, corpo WAV
  não vazio, assinatura RIFF/WAVE e SHA-256 conferido após streaming. Também
  foi gerada e validada a amostra
  `output\d19411ee-05ea-43b6-90ce-22430792ea9e\speech.wav` (345.286 bytes,
  7,83 s; SHA-256 `58dba51d555308bcc0bf03409b417621251ed6971251257a961584db64b4dda1`).
  O WAV é ignorado pelo Git; nenhum binário foi adicionado ao repositório.
- Testes criam conteúdo sintético e removem seus diretórios temporários.

## Segurança e limitações

- O serviço escuta somente em loopback; as rotas de dados requerem Bearer token.
- As chaves precisam ser fornecidas por ambiente; nenhum segredo real está no
  código ou `.env.example`.
- Execução de processos sem shell; sem downloads automáticos de binários/pesos.
- Não executa, desserializa nem carrega modelos recebidos.
- Voice Library continua single-principal, sem isolamento multiusuário real.
- Job store em memória; não sobrevive a reinício e não é compartilhado entre
  instâncias.
- Piper não testado aqui, pois o executável e os arquivos do modelo não estão
  instalados.
- Kokoro não implementado além da declaração explícita de indisponibilidade.
- RVC não executa conversão e não baixa arquivos `.pth`/`.index`.
- Não há integração com TeraBox, HYRON Worker ou D1.
- Não há codificadores MP3/OGG.

## Próximos passos para v0.5.5

1. Definir uma identidade de serviço autenticada pelo HYRON, com autorização
   por usuário; substituir o modelo de chave única em conjunto com a evolução
   da Voice Library.
2. Executar Piper apenas após selecionar runtime/modelo por origem e licença,
   configurar caminhos e comprovar geração de áudio em Windows.
3. Avaliar runtime RVC com sandbox/isolamento apropriado e formatos de modelo
   que não desserializem código arbitrário; até lá manter conversão bloqueada.
4. Persistir jobs, cotas e metadados se o Engine precisar sobreviver a
   reinícios ou operar em múltiplas instâncias.
5. Definir fluxo de autorização e armazenamento para ambientes hospedados sem
   expor a API local nem confiar em `userId` fornecido pelo cliente.
