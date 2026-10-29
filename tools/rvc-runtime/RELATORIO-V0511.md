# Relatório técnico — HYRON RVC Runtime v0.5.11

Data da verificação: 2026-10-11

## Resultado executivo

O ambiente isolado v0.5.10 foi mantido e a preparação de dataset, treinamento
conservador e validação estrita de checkpoint foram adicionados. **Nenhum
dataset autorizado foi fornecido, nenhum pacote adicional foi instalado,
nenhum treinamento foi iniciado e nenhuma conversão RVC foi executada.**
Portanto, não há checkpoint produzido nem WAV convertido nesta versão.

O impedimento imediato ao treino é cumulativo:

1. A caixa de entrada está vazia e não existe manifesto de dataset autorizado.
2. A máquina tinha aproximadamente 0,37 GiB de RAM física livre na verificação,
   abaixo do limite conservador de 3,5 GiB. O pipeline recusaria iniciar nas
   condições observadas.

O candidato WAV Piper existe e foi validado; sem um checkpoint compatível e
autorizado, submetê-lo à CLI não seria uma conversão RVC válida.

## Estado inicial e runtime

- Runtime: `RVC-Project/Retrieval-based-Voice-Conversion-WebUI`.
- Repositório: <https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI>.
- Commit fixado: [`81eed5e8f68b6bed1789f682fe78cdd324495afc`](https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI/commit/81eed5e8f68b6bed1789f682fe78cdd324495afc).
- Licença do código nesse commit: MIT (`LICENSE` upstream). Essa licença não
  concede direitos sobre gravações ou checkpoints de voz.
- Interface de inferência: `infer/cli.py`; documentação no
  [guia CLI do commit fixado](https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI/blob/81eed5e8f68b6bed1789f682fe78cdd324495afc/docs/en/cli.md).
- Sistema: Windows x64; Python base CPython 3.12.10 x64 em
  `C:\Users\Admin\AppData\Local\Python\pythoncore-3.12-64\python.exe`.
- Virtualenv independente: `tools/rvc-runtime/.venv`; não foi usada nem
  alterada a instalação RVC antiga, e não houve alteração ao Voice Engine.
- PyTorch/Torchaudio: `2.7.1+cu118`; CUDA reportada pelo PyTorch: 11.8;
  `torch.cuda.is_available()`: `True`.
- GPU: NVIDIA GeForce RTX 3050 6GB Laptop GPU; VRAM total reportada:
  6.0 GiB. `nvidia-smi` indicou 6001 MiB livres no instante da verificação.
- RAM física: 7,71 GiB total e aproximadamente 0,70 GiB livre no instante da
  verificação. Esse valor é uma amostra instantânea, não uma garantia futura.
- O suporte aos componentes já instalados foi revalidado; não houve reinstalação
  do runtime, CUDA ou assets.

## Segurança de carregamento e assets

`harden_runtime.py --runtime-path tools/rvc-runtime/upstream` confirmou o
checkout fixado e os patches locais revisados. Os loaders `torch.load` de
inferência e treinamento exigem explicitamente `weights_only=True`:

| Área | Arquivos verificados |
| --- | --- |
| Inferência | `infer/cli.py`, `infer/vc/modules.py`, `infer/rtrvc.py`, `infer/rmvpe.py` |
| Treinamento | `train/train.py`, `train/utils.py`, `train/data_utils.py`, `train/process_ckpt.py` |

As configurações locais do DataLoader expõem workers/prefetch controlados e
usam padrões conservadores. `TORCH_FORCE_WEIGHTS_ONLY_LOAD=1`,
`HF_HUB_OFFLINE=1` e `TRANSFORMERS_OFFLINE=1` são definidos nas etapas do
pipeline. A inferência futura precisa manter `--index-rate 0` e não fornecer
`.index`; carregadores FAISS ainda existem em `infer/rtrvc.py`,
`infer/vc/pipeline.py` e `train/train_index.py`.

HuBERT e RMVPE estavam presentes nos caminhos esperados e foram verificados
localmente, sem download nesta verificação:

| Arquivo | Digest verificado |
| --- | --- |
| `assets/hubert_base/config.json` | Git blob SHA-1 `6f40f9bd2481c05c03d59f2b36f016fedc386187` |
| `assets/hubert_base/preprocessor_config.json` | Git blob SHA-1 `3cb012fae1b439d92a815fec1c09fa0ce19fd6bf` |
| `assets/hubert_base/pytorch_model.bin` | SHA-256 `cc8c20f4b90a520757260197a3ff2505705a7adbd20ad9eeaa4e1a9b38442ef5` |
| `assets/rmvpe/rmvpe.pt` | SHA-256 `6d62215f4306e3ca278246188607209f09af3dc77ed4232efdd069798c4ec193` |

Esses assets auxiliares foram apenas lidos para verificar seus digests; não
foram desserializados/carregados nesta etapa. Não há fallback para
`weights_only=False` nem allowlist ampla. O carregamento estrito ainda deve ser
comprovado para o checkpoint específico que vier a ser produzido.

## Dataset e preparação

Estrutura criada em `tools/rvc-runtime/datasets/hyron-test/`, com instruções e
diretórios para `inbox/`, `prepared/recordings/` e `reports/`. A caixa de
entrada não contém gravações além do placeholder `.gitkeep`; não há segmentos
preparados nem manifesto.

O script `prepare_dataset.py` foi preparado para:

- decodificar áudio local, rejeitar arquivos corrompidos e áudio inválido;
- converter para WAV mono PCM16 a 40 kHz (ou taxa suportada selecionada);
- localizar atividade vocal, aparar e dividir silêncios longos;
- gravar hashes de origem/segmentos e registrar rejeições no manifesto;
- evitar sobrescrever saídas existentes.

Nenhum áudio foi gravado ou baixado. Origem e autorização das gravações:
**não aplicável — nenhum áudio de treino foi fornecido ou processado**. As
instruções para gravações próprias ou explicitamente autorizadas estão em
[`datasets/hyron-test/README.md`](./datasets/hyron-test/README.md). O manifesto
registra a declaração do operador, não comprova consentimento por si só.

## Dependências e plano de treinamento

As dependências adicionais foram identificadas e instaladas somente no
ambiente isolado `tools/rvc-runtime/.venv`, após autorização explícita:

- `matplotlib>=3.8.2,<4`
- `tensorboard>=2.19.0,<3`

Elas estão separadas em `requirements.training-extra.txt`. As versões
instaladas são matplotlib 3.11.2 e tensorboard 2.21.0; `pip check` passou no
ambiente isolado. Nenhuma dependência foi intencionalmente adicionada ao
`.venv` da raiz do projeto; após uma instalação acidental inicial nesse
ambiente, somente esses dois pacotes foram removidos e `pip check` passou.

O wrapper `train-windows.ps1` e o orquestrador `train_rvc.py` estão preparados
para Windows x64, Python 3.12 e a GPU detectada. Configuração padrão:

- RVC v1, 40 kHz, perfil `configs/v1/40k.json`;
- batch size 1, 20 épocas, salvamento a cada 5 épocas;
- 0 workers e prefetch 1; sem checkpoints pré-treinados;
- extração RMVPE em CPU e HuBERT na GPU CUDA selecionada;
- RAM livre mínima de 3,5 GiB e VRAM livre mínima de 4 GiB;
- amostragem das métricas de memória/VRAM a cada 2 segundos; encerramento da
  etapa se o limite for ultrapassado.

O script exige dataset preparado cujo manifesto e hashes correspondam aos
arquivos, evidência de autorização, confirmação explícita
`I_AUTHORIZE_HYRON_RVC_TRAINING` e espaço de saída ainda inexistente. Ainda
assim, o treino não foi iniciado: não havia dataset, dependências autorizadas
nem RAM livre suficiente. A GPU estava acima do limite configurado no instante
da checagem, mas isso não compensa a falta de RAM nem garante que qualquer
dataset caiba.

## Checkpoint

- Checkpoint produzido: **nenhum**.
- SHA-256: **não aplicável**.
- Origem/licença/autorização: **não aplicável; nenhum modelo foi criado ou
  carregado**.
- O verificador `verify_checkpoint.py` só aceita `.pth` que possa ser lido com
  `torch.load(..., weights_only=True)` e valida estrutura, tensores, versão,
  taxa e dados de speaker. O hash é registrado apenas após essa validação.
- Incompatibilidade com o unpickler restrito deve interromper o fluxo. Não
  relaxar o loader; corrigir/exportar o artefato de forma compatível ou
  escolher outro formato/runtime.

## Entrada Piper e conversão

O WAV candidato já existente em
`tools/voice-engine/tests/output/piper-pt-br-v057.wav` foi apenas lido para
validação:

- RIFF/WAVE PCM, mono, 16 kHz, 16-bit;
- 129280 frames, 8,08 s;
- SHA-256: `c4477bb35a1e66449cd06060f172ecde10d8bd04e7a36dd585b68f01d3776eb8`.

Não foi fornecido ao runtime RVC. Código de saída, log de inferência, WAV de
saída, comparação entrada/saída, hash convertido e tempo de processamento:
**não existem**, pois a inferência não foi executada. Não foi copiado o áudio
original para representar uma conversão. A qualidade auditiva não pode ser
avaliada sem uma saída produzida e reproduzida.

Impedimentos exatos para a primeira conversão:

1. Não existe checkpoint RVC de teste treinado/verificado e autorizado.
2. Não há dataset de voz autorizado e revisado para produzi-lo.
3. As dependências de treino estão ausentes e aguardam autorização para
   instalação.
4. A RAM livre observada está abaixo do limite mínimo do pipeline.

Quando os requisitos forem atendidos, `test-windows.ps1` usa o WAV Piper,
carregamento restrito, execução offline e índice desativado. Não será declarada
conversão real até haver saída nova, código de sucesso, logs e validação do WAV;
hash diferente sozinho não prova conversão vocal bem-sucedida.

## Testes executados

- Testes unitários do runtime: **12 passaram**.
- `py_compile` em `prepare_dataset.py`, `train_rvc.py`,
  `verify_checkpoint.py` e `harden_runtime.py`: passou.
- Sintaxe Pylance de `tests/test_prepare_dataset.py`: sem erros.
- `--help` de preparação, treino, validação de checkpoint, hardener e assets:
  passou.
- Sintaxe PowerShell de `train-windows.ps1`, `test-windows.ps1` e
  `configure-windows.ps1`: passou.
- Verificação do hardener contra o commit upstream: passou; patches já estavam
  aplicados.
- Verificação dos quatro assets fixados: passou, sem baixá-los.
- Candidato WAV Piper: cabeçalho, duração e SHA-256 lidos com sucesso.
- Dependências extras autorizadas: instaladas/verificadas somente no virtualenv
  RVC; `pip check` passou.
- Treinamento e conversão: **não executados**.

Durante o desenvolvimento, um teste de dataset inicialmente comparava a taxa
de saída à taxa de entrada (16 kHz). A saída correta desse caso de teste é
40 kHz; a expectativa foi corrigida e a suíte completa passou.

## Próximos passos

1. Obter gravações próprias ou explicitamente autorizadas e colocá-las em
   `datasets/hyron-test/inbox/`; documentar a procedência/autorização.
2. Preparar o dataset, revisar manifesto/segmentos e remover qualquer trecho
   não autorizado ou impróprio.
3. Autorizar, se desejado, a instalação somente das duas dependências listadas
   em `requirements.training-extra.txt`.
4. Aguardar recursos suficientes (pelo menos os limites padrão) e confirmar
   explicitamente o treinamento pelo wrapper.
5. Verificar o checkpoint com carregamento restrito; interromper se houver
   incompatibilidade.
6. Só então executar a conversão independente com o WAV Piper, sem FAISS, e
   registrar as evidências. Integração ao Voice Engine permanece fora do escopo.

Nenhum Worker, Cloudflare D1, Wrangler, `public/`, Storage Bridge ou Voice
Engine foi alterado. Não houve deploy nem publicação de checkpoints.
