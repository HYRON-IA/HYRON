# HYRON Voice Engine v0.5.7 — Relatório de conclusão

## Resumo

**Síntese Piper pt-BR real: comprovada. Conversão RVC real: indisponível e não
tentada.** O teste opt-in executou o Piper configurado através da API
autenticada do Voice Engine, concluiu o job como Piper e recuperou o WAV
resultante pelo endpoint de áudio. SAPI e a API preexistente continuam
funcionais. Nenhum checkpoint `.pth` foi carregado ou executado.

O bloqueio RVC é intencional: a instalação local e um par de arquivos de voz
foram encontrados, mas a origem, licença, consentimento e autorização do
checkpoint não puderam ser verificados. Além disso, o runtime RVC encontrado
tem caminhos de inferência que chamam `torch.load` sem impor carregamento
restrito. Ativá-lo violaria os requisitos de segurança desta versão.

## Piper: inferência v0.5.7

- Runtime local Piper TTS 1.8.0 (OHF-Voice), instalado no ambiente virtual
  ignorado `.piper-runtime`; versão e licença do runtime são as mesmas
  registradas no relatório [RELATORIO-V056.md](./RELATORIO-V056.md).
- Voz `pt_BR-edresson-low`, com o par ONNX e JSON local em `.piper-models`.
  Origem fixada, licença da voz/base de treinamento e respectivos hashes
  permanecem detalhados no relatório v0.5.6. O modelo não é redistribuído.
- Configuração local: `PIPER_EXECUTABLE` aponta para
  `.piper-runtime\Scripts\piper.exe`; `PIPER_MODEL_PATH` aponta para
  `.piper-models\pt_BR-edresson-low.onnx`. Os valores reais estão somente no
  `.env` ignorado e não são reproduzidos aqui.
- Texto sintetizado:
  “Olá! Eu sou o HYRON. Ideias, código e boas conversas. Agora eu tenho uma voz
  de verdade.”
- Evidência: a integração inicia os servidores locais, usa
  `POST /synthesize` com `engineId: "piper"`, consulta o job até a conclusão e
  baixa o áudio pela rota existente. O teste confirma o engineId do job e
  RIFF/WAVE na resposta. A validação do WAV e o código de saída zero do
  executável confirmam inferência Piper; não houve fallback para SAPI.
- Arquivo persistente, ignorado pelo Git:
  `tests\output\piper-pt-br-v057.wav`
- Resultado medido na última validação de regressão v0.5.8:
  **258.604 bytes**, PCM mono, 16.000 Hz, 16-bit, **8,080 segundos**,
  assinatura `RIFF`/`WAVE`.
- SHA-256:
  `c4477bb35a1e66449cd06060f172ecde10d8bd04e7a36dd585b68f01d3776eb8`
- A regressão real Piper v0.5.8 levou cerca de 17,8 s; a suíte completa levou
  cerca de 25,7 s. A duração e o hash variam entre inferências por causa da
  amostragem estocástica do modelo.
- Não foi feita audição/verificação perceptual; qualidade auditiva não é
  declarada como validada.

## Avaliação do runtime RVC local

Foi localizada uma cópia da aplicação RVC em
`C:\Users\Admin\Downloads\RVC20260718Nvidia\RVC20260718Nvidia` e código-fonte
associado em
`C:\Users\Admin\Downloads\RVC20260718Nvidia\Retrieval-based-Voice-Conversion-WebUI-2.3.260718`.
Ela não está configurada como runtime do Voice Engine e não foi integrada.

- A cópia fornece interface GUI/CLI Python e arquivos de requisitos separados
  para CPU (Python 3.12) e CUDA 11.8/12.8. A instalação local contém Python
  3.12.10 e PyTorch 2.7.1+cu118. A verificação local retornou
  `torch.cuda.is_available() == True` e identificou uma GPU NVIDIA GeForce RTX
  3050 6GB Laptop GPU. Isso confirma que Torch encontra o dispositivo CUDA,
  mas **não** comprova que a inferência RVC funcione nessa GPU. CPU consta nos
  requisitos, mas não foi exercitada.
- O pacote possui um arquivo `LICENSE` MIT, mas a procedência dessa cópia e os
  termos efetivamente aplicáveis às dependências e aos pesos locais não foram
  verificados para integração ou redistribuição.
- O código de inferência examinado contém `torch.load` em
  `infer\vc\modules.py:121` e `infer\rtrvc.py:34` sem exigir explicitamente
  `weights_only=True`. Não foi feita auditoria de todos os caminhos de
  desserialização nem demonstrado um modo restrito compatível com esse
  runtime.
- Foram encontrados `alastorpilot.pth` e o índice
  `added_IVF253_Flat_nprobe_1_alastorpilot_v2.index`. Hashes observados na
  instalação examinada:
  - `.pth`: `bbd2d5cac17d769ee9e5513178b49b704145f2fef05c77a739bfefef3b27eef1`
  - `.index`: `ea375c44d13a3d6f1ea1f30d5b08e3ae3ef581db23741c532e77d4a73966c3a3`
- Os hashes identificam os arquivos locais, mas **não comprovam origem,
  integridade perante um publicador conhecido, licença, consentimento da
  pessoa cuja voz foi usada, autorização pela Voice Library ou segurança do
  checkpoint**. Os arquivos não foram abertos pelo Engine ou pelo runtime.
- Nenhuma conversão foi iniciada; não há WAV convertido, duração de conversão,
  uso medido de CPU/GPU ou comparação de hashes de áudio. Portanto não há
  evidência de inferência RVC real e RVC não é anunciado como disponível.

## Implementação, API e segurança

- `RVCEngine` permanece como adaptador indisponível e retorna erro explícito;
  não copia nem apresenta o áudio de entrada como conversão.
- `GET /health` reporta v0.5.7; a API e o contrato do job de síntese foram
  preservados. `/engines` continua listando RVC indisponível e a rota de
  conversão existente retorna indisponibilidade explícita.
- Piper e SAPI continuam iniciando processos sem shell. Foram preservados
  timeout, cancelamento, limite de tamanho/duração de WAV, TTL e controle de
  concorrência. Os testes de timeout/cancelamento cobrem o gerenciamento de
  jobs; não representam uma conversão RVC real.
- Nenhuma alteração foi feita no Worker principal, D1, Wrangler, `public/` ou
  Storage Bridge; não houve deploy nem publicação.
- `.env`, runtime/modelos locais e WAVs permanecem ignorados pelo Git.

## Testes

Execuções no Windows, com `HYRON_TEST_PIPER=1`, executável e modelo Piper
configurados:

- Integração Piper real, executada isoladamente: **1 aprovada, 0 falhas**.
- `npm.cmd test`: **10 aprovados, 0 falhas, 0 ignorados**. Inclui teste real
  Piper via API, SAPI real, regressões da API/autenticação, Voice Library,
  validação WAV, erros RVC e timeout/cancelamento de jobs.
- `npm.cmd run typecheck`: **aprovado** (`tsc --noEmit`).
- `git diff --check`: **aprovado**.
- A primeira tentativa de executar a suíte completa falhou porque o teste
  Piper tinha TTL de job menor que o timeout de síntese. O TTL/polling do teste
  de integração foi ajustado e reexecutado com sucesso. A configuração de
  runtime do produto não foi relaxada.

## Limitações e próximos passos

1. A conversão RVC permanece pendente. Exige runtime de procedência verificável
   cujo carregamento restrito tenha sido revisado, checkpoint e índice com
   origem/licença/consentimento/autorização demonstráveis e teste real de
   conversão sem expor caminhos internos.
2. O runtime RVC instalado não foi validado em CPU ou por inferência CUDA. Não
   instalar CUDA, dependências RVC adicionais nem baixar pesos foi necessário
   ou realizado nesta etapa.
3. A licença do modelo Piper pt-BR não está inequívoca para redistribuição ou
   uso comercial; respeitar as ressalvas do relatório v0.5.6.
4. Execução Linux e qualidade auditiva não foram testadas.
5. As amostras WAV são evidência local e ficam fora do controle de versão.
