# HYRON Voice Engine v0.5.8 — Auditoria e preparação RVC

## Conclusão

**RVC permanece indisponível. Nenhum checkpoint foi carregado e nenhuma
conversão foi tentada.** A cópia local usa PyTorch 2.7.1+cu118, onde o modo
restrito de `torch.load` é o padrão, e Transformers 4.49 passa
`weights_only=True` ao carregar o HuBERT PyTorch. Isso é um sinal favorável,
mas não prova que os modelos de voz locais são compatíveis com o unpickler
restrito nem que os arquivos são autorizados. Também não substitui isolamento
de processo/sistema.

Não implementei um executor subprocesso nem liguei o runtime à API: não existe
um checkpoint de voz com origem, licença, consentimento e autorização
verificáveis, e ainda faltam garantias explícitas nos loaders e no parser de
índice FAISS. Um subprocesso, isoladamente, não é sandbox. Manter a integração
fechada evita converter os atuais limites de confiança em uma execução de
modelos não revisados.

## Runtime auditado

- Diretório portátil identificado pelo nome `RVC20260718Nvidia`; o README
  identifica o projeto upstream como
  [RVC-Project/Retrieval-based-Voice-Conversion-WebUI](https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI).
- A cópia local não contém metadados `.git`; portanto não foi possível fixar
  commit/tag nem verificar que os arquivos correspondem ao upstream declarado.
  O nome da pasta não é evidência de versão upstream.
- `LICENSE` local contém texto MIT para o runtime. Isso não estabelece licença
  dos checkpoints, índices, modelos auxiliares ou dependências.
- Ambiente observado: Python 3.12.10 x64, PyTorch 2.7.1+cu118,
  Transformers 4.49.0, FAISS CPU 1.14.3 e safetensors 0.8.0. O runtime reporta
  `torch.cuda.is_available() == True` e NVIDIA GeForce RTX 3050 6GB Laptop GPU.
  Isso confirma descoberta CUDA, não uma inferência RVC funcional.
- O arquivo de requisitos CUDA declara PyTorch/Torchaudio 2.7.1+cu118 e
  Transformers `>=4.49,<4.50`. O perfil CPU declara PyTorch 2.4.1+cpu; nesse
  perfil o modo padrão de `torch.load` é diferente e não deve ser considerado
  seguro sem argumento explícito. Os requisitos CPU/CUDA não foram instalados
  ou alterados nesta tarefa.
- As interfaces de inferência observadas são `infer/vc/modules.py` (interface
  principal de seleção do modelo) e `infer/rtrvc.py` (implementação alternativa
  de conversão). O código monta arquiteturas RVC v1/v2 e carrega os tensores
  em `load_state_dict`; isso indica o formato esperado pelo código, não prova
  compatibilidade de qualquer `.pth` local.

## Carregamento restrito e serialização

### PyTorch

O código contém três usos de `torch.load` no caminho de inferência:

- `infer/vc/modules.py`: checkpoint selecionado em `assets/weights`, usado
  como dicionário com chaves esperadas `config`, `weight`, `f0` e `version`.
- `infer/rtrvc.py`: checkpoint de voz passado a `get_synthesizer`; espera
  `config`, `weight`, `f0` e `version`.
- `infer/rmvpe.py`: pesos do estimador RMVPE, consumidos diretamente por
  `model.load_state_dict`.

Nenhuma dessas chamadas informa `weights_only` explicitamente. A documentação
oficial do [PyTorch 2.7 serialization](https://pytorch.org/docs/2.7/notes/serialization.html)
registra a mudança de padrão: a partir do PyTorch 2.6, `torch.load` usa
`weights_only=True` quando o chamador não informa um valor. Portanto, na
instalação observada 2.7.1 essas chamadas usam atualmente o unpickler restrito,
exceto se o ambiente definir `TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD=1`; o PyTorch
também fornece `TORCH_FORCE_WEIGHTS_ONLY_LOAD=1` para forçar o modo restrito.
Chamadas sem argumento deixam essa propriedade implícita e não são compatíveis
com assumir o mesmo comportamento no perfil CPU declarado, PyTorch 2.4.1.

Os acessos observados sugerem que os loaders precisam de tensores e de
metadados Python simples em dicionários/listas. Não foi feita inspeção
desserializada dos arquivos, então não se sabe se cada arquivo contém apenas
tipos aceitos por `weights_only=True`, se usa globals customizados, nem se
corresponde ao esquema/configuração esperado. Não houve tentativa de
`weights_only=False`, allowlist, monkeypatch ou teste carregando os modelos.
Compatibilidade real dos checkpoints com carregamento restrito: **não
demonstrada**.

### Outros formatos

- HuBERT é carregado por `transformers.HubertModel.from_pretrained` de
  `assets/hubert_base/pytorch_model.bin`, com `local_files_only=True`. A cópia
  instalada do Transformers 4.49.0 passa `weights_only=True` ao loader
  PyTorch quando usa o arquivo `.bin`. Esta restrição cobre a desserialização
  de pesos; não autentica a origem dos pesos nem converte automaticamente o
  arquivo em safetensors.
- RMVPE também existe como `rmvpe.onnx`; porém não foi confirmado qual backend
  é selecionado por toda configuração de inferência. O caminho PyTorch usa
  `torch.load` em `rmvpe.pt`.
- Os índices de voz são abertos via `faiss.read_index`. É um formato binário
  diferente de pickle/PyTorch; não foi auditado o parser FAISS contra arquivos
  maliciosos. Hash e extensão não provam segurança.
- A busca no código `infer` não encontrou chamadas diretas a `pickle.load`,
  `joblib.load` ou `torch.jit.load`. A interface pode chamar bibliotecas
  transitivas; isso não equivale a uma auditoria completa de todas as
  dependências.
- O carregamento do HuBERT foi limitado a arquivos locais, sem download
  automático nesta auditoria. Nenhum script remoto foi executado.

## Inventário local de modelos

Os hashes abaixo foram calculados lendo os arquivos como bytes; nenhum peso ou
índice foi desserializado. A pasta runtime não tem metadados de proveniência
para esses artefatos; origem/licença/autorização de cada um são **não
verificadas**. Os nomes permitem apenas compatibilidade presumida.

| Arquivo | Formato | Bytes | SHA-256 | Origem/licença | Compatibilidade presumida |
|---|---:|---:|---|---|---|
| `alastorpilot.pth` | `.pth` | 55.225.574 | `bbd2d5cac17d769ee9e5513178b49b704145f2fef05c77a739bfefef3b27eef1` | desconhecida | checkpoint RVC pelo diretório; esquema não confirmado |
| `guanguanV1.pth` | `.pth` | 55.024.402 | `5a4920ef7b8c28be41dbd3afe2bd8cc852bccc5da82ac0590afb2a160ca81bb2` | desconhecida | nome sugere RVC v1; não confirmado |
| `keruanV1.pth` | `.pth` | 55.024.861 | `9b3808d83e99b7c7b01cc1e33cee79ab8f1ebed08708b72066917465ea336e56` | desconhecida | nome sugere RVC v1; não confirmado |
| `kikiV1.pth` | `.pth` | 55.025.320 | `fb48c0a982317073c343e440e0c88337c3c605908429d81d420ea123bc83b5b5` | desconhecida | nome sugere RVC v1; não confirmado |
| `youzhanv2-xi.pth` | `.pth` | 57.551.491 | `88ad512ce774a929972ed27650aa80687fbe220ecdc20809a164c65dca4a408c` | desconhecida | nome sugere RVC v2; não confirmado |
| `added_IVF253_Flat_nprobe_1_alastorpilot_v2.index` | `.index` | 31.172.819 | `ea375c44d13a3d6f1ea1f30d5b08e3ae3ef581db23741c532e77d4a73966c3a3` | desconhecida | nome sugere índice da voz Alastor; não confirmado |
| `guanguanV1.index` | `.index` | 33.496.795 | `d04454f009988ad7e3d830d3d8870b3d107978738e2e3b10bd415038ed882cac` | desconhecida | par presumido pelo nome; não confirmado |
| `keruanV1.index` | `.index` | 41.683.651 | `8e8d2000be4c6dce12102fe417e03ac13c338328da424e33a8e71d94eb1b3380` | desconhecida | par presumido pelo nome; não confirmado |
| `kikiV1.index` | `.index` | 58.956.235 | `5f20e83f2e232f2077fed5a064bc92865899e2330a1ff10f2c54b2bae834c647` | desconhecida | par presumido pelo nome; não confirmado |
| `pytorch_model.bin` (HuBERT) | `.bin` | 189.206.711 | `cc8c20f4b90a520757260197a3ff2505705a7adbd20ad9eeaa4e1a9b38442ef5` | desconhecida nesta cópia | modelo de conteúdo HuBERT esperado pela configuração local |
| `rmvpe.pt` | `.pt` | 181.184.272 | `6d62215f4306e3ca278246188607209f09af3dc77ed4232efdd069798c4ec193` | desconhecida nesta cópia | pesos RMVPE pelo caminho/código; não confirmado |
| `rmvpe.onnx` | `.onnx` | 361.688.443 | `5370e71ac80af8b4b7c793d27efd51fd8bf962de3a7ede0766dac0befa3660fd` | desconhecida nesta cópia | alternativa potencial RMVPE; seleção não confirmada |

Os hashes duplicados anteriormente observados em outra pasta local não
estabelecem origem ou autorização. Não houve busca nem download de checkpoints
adicionais.

## Isolamento e integração

- `RVCEngine` não foi alterado: `isAvailable()` continua falso e `convert()`
  falha explicitamente. A API não baixa modelos nem devolve o áudio de entrada
  como se fosse conversão.
- Não foi criado executor filho sem um comando de inferência seguro, modelo
  autorizado e contrato de execução auditável. Antes de habilitar subprocesso,
  a implementação deverá fornecer argumentos fixos sem shell, ambiente
  allowlisted sem chaves HYRON, diretórios temporários isolados, validação
  WAV de entrada/saída, limite de saída e timeout/cancelamento com encerramento
  de árvore de processos.
- Limite de memória não foi configurado. No Windows pode exigir Job Object ou
  mecanismo nativo equivalente; no Linux, limites de cgroup/ulimit dependem do
  deployment. Uma árvore de subprocessos e diretórios temporários **não**
  equivalem a sandbox: ainda é necessário restringir arquivos, rede, usuário,
  memória/CPU/GPU e syscalls no sistema operacional.
- A API Voice Engine segue local e a conversão permanece bloqueada em
  `/engines`, `POST /convert` e pedidos `convert: true`.

## Alterações e testes HYRON

- Versão do pacote, banner do servidor e `/health` atualizados para `0.5.8`;
  teste de contrato de health atualizado. Nenhuma alteração foi feita à cópia
  externa RVC, ao Worker, D1, Wrangler, `public/` ou Storage Bridge.
- RVC indisponível continua coberto por testes; não houve teste real RVC, pois
  os artefatos falham as condições de procedência e autorização e a
  compatibilidade com o carregamento restrito não foi demonstrada.
- `npm.cmd test`: **10 aprovados, 0 falhas, 0 ignorados**, incluindo inferência
  Piper real pela API, regressão SAPI real, indisponibilidade RVC,
  cancelamento/timeout de jobs, Voice Library e validações WAV.
- A integração Piper real levou **17,8 s** e a suíte completa, **25,7 s** nesta
  execução; os tempos variam conforme o ambiente.
- `npm.cmd run typecheck`: **aprovado** (`tsc --noEmit`).
- `git diff --check`: **aprovado**.
- A regressão Piper atualizou o WAV persistente
  `tests\output\piper-pt-br-v057.wav`; tamanho, duração e hash atualizados estão
  em [RELATORIO-V057.md](./RELATORIO-V057.md).
- Esta auditoria não executou checkpoints RVC nem alterou a cópia externa do
  runtime.

## Pendências

1. Identificar commit/tag verificável do runtime e auditar licenças das
   dependências usadas na inferência.
2. Obter, por ação explícita do operador, modelo e índice com origem, licença,
   consentimento e autorização documentados.
3. Fixar explicitamente `weights_only=True` em todos os loaders necessários e
   validar o esquema dos checkpoints sem allowlists amplas; manter o runtime
   fechado se o carregamento seguro rejeitar algum objeto.
4. Auditar o parser de índices FAISS e selecionar apenas caminho de inferência
   offline compatível com o contrato do Voice Engine.
5. Implementar e revisar limites reais de processo/árvore, ambiente, memória,
   rede e diretórios temporários antes de qualquer teste real.
6. Só então executar primeiro um teste isolado de carregamento e,
   posteriormente, uma conversão RVC real a partir da amostra Piper da v0.5.7,
   com validação WAV, hashes, tempo e evidência do runtime.
