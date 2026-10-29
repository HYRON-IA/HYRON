# Runtime RVC de referência (HYRON v0.5.11)

Este diretório prepara um runtime independente e fixado para testar conversão
offline. Ele não altera o `RVCEngine`, o runtime Piper ou a instalação RVC
anterior. O checkout do upstream e o ambiente Python ficam locais e ignorados
pelo Git.

## Estado verificado v0.5.11

- Runtime fixado no commit registrado abaixo, com ambiente Python 3.12.10 x64
  isolado e dependências CUDA instaladas; a lista resolvida está em
  `requirements.resolved.txt`.
- `pip check`, imports de inferência, detecção CUDA e `infer/cli.py --help`
  passaram. Os loaders de inferência e treino revisados exigem
  `weights_only=True`; o DataLoader do treino tem configuração local de baixa
  memória.
- Assets HuBERT/RMVPE estão na revisão/hash fixados e no caminho esperado pelo
  runtime. Consulte o [relatório v0.5.11](./RELATORIO-V0511.md) para ambiente,
  testes e bloqueios atuais.

## Implementação de referência

- Projeto: [RVC-Project/Retrieval-based-Voice-Conversion-WebUI](https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI)
- Commit: `81eed5e8f68b6bed1789f682fe78cdd324495afc` (commit identificado na API oficial do GitHub; sem assinatura verificada).
- Licença do código: MIT, conforme [LICENSE upstream](https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI/blob/81eed5e8f68b6bed1789f682fe78cdd324495afc/LICENSE).
- Interface offline documentada: `infer/cli.py`; a referência de uso é
  [docs/en/cli.md no commit selecionado](https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI/blob/81eed5e8f68b6bed1789f682fe78cdd324495afc/docs/en/cli.md).
- Windows x64/Python 3.12 é documentado pelo projeto; perfis de CPU e CUDA
  também são fornecidos. GPU NVIDIA anterior à série RTX 50 usa o perfil CUDA
  11.8 na referência.

MIT cobre o código upstream, não automaticamente checkpoints, índices,
gravações, assets, dependências ou direito de imitar uma voz. Cada modelo
precisa de evidência própria de origem, licença e autorização.

## Preparação isolada

Requisitos: Windows x64, Git para Windows e CPython 3.12.10 x64 instalado pelo
Python Install Manager oficial e disponível por `py -3.12`. A preparação não
usa o interpretador embutido no RVC antigo nem o ambiente Piper. Cria
`.venv\` com `include-system-site-packages=false`.

```powershell
Set-Location "C:\caminho\para\HYRON-v0.1"
Copy-Item ".\tools\rvc-runtime\.env.example" ".\tools\rvc-runtime\.env"
py -3.12 --version
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned `
  -File ".\tools\rvc-runtime\configure-windows.ps1" -Backend CUDA118
```

Use `-Backend CPU` para inferência via CPU. O script só busca o commit fixado por
HTTPS/Git; não chama `.bat`, `.ps1`, nem instalador remoto do upstream. Ele
cria `.venv` própria e aplica a revisão dos loaders. Por padrão, **não instala
pacotes**. A lista upstream inclui UI, treino, separação de fontes e backends
opcionais; para não instalar componentes desnecessários, este setup usa apenas
as dependências diretas em `requirements.inference-py312.txt`. O perfil CUDA
fixa PyTorch/Torchaudio 2.7.1+cu118; o perfil CPU fixa PyTorch/Torchaudio
2.4.1+cpu. Pacotes só são aceitos como wheels binárias dos índices oficiais,
sem builds de source.

```powershell
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned `
  -File ".\tools\rvc-runtime\configure-windows.ps1" `
  -Backend CUDA118 -InstallDependencies
```

Troque `CUDA118` por `CPU` para a alternativa CPU. `RemoteSigned` vale somente
para esse processo do PowerShell; a política global do Windows não é alterada.
O checkout usa somente o commit fixado, e o setup verifica o commit antes de
aplicar os patches. Todos os `torch.load` do caminho de inferência RVC são
ajustados localmente para `weights_only=True`; o teste força
`TORCH_FORCE_WEIGHTS_ONLY_LOAD=1`. Nenhum erro de unpickling deve ser contornado
com `weights_only=False`, allowlists abrangentes ou substituição de loader.
Se o checkpoint exigir objetos não permitidos, interrompa e gere um checkpoint
compatível a partir de treinamento autorizado.

Os índices usados são PyPI (`https://pypi.org/simple`) e o índice PyTorch
oficial do perfil selecionado. Depois da instalação, o script grava
`requirements.resolved.txt` com as versões efetivamente resolvidas. Para
reproduzir em outra máquina, preserve esse lock junto com Python 3.12.10 x64,
o perfil CPU/CUDA e o commit de runtime.

O runtime não baixa automaticamente checkpoints RVC, índices FAISS ou pesos
de voz de terceiros. Depois de instalar as dependências e revisar a origem, é
possível baixar somente HuBERT na revisão fixa abaixo e validar os hashes:

```powershell
.\.venv\Scripts\python.exe .\prepare-assets.py --runtime-path .\upstream
```

Para baixar também o estimador de pitch RMVPE explicitamente:

```powershell
.\.venv\Scripts\python.exe .\prepare-assets.py --runtime-path .\upstream --include-rmvpe
```

Assets auxiliares vêm de `lj1995/VoiceConversionWebUI` na revisão
`e6d0c1a17da07c33557852f9dfa2bd44cc75737d`. O script verifica a identidade
Git blob dos JSON e SHA-256 dos pesos; não abre nem desserializa arquivos.
Não use arquivos da antiga instalação sem verificar origem e autorização.

## Modelo e teste real

Não há um modelo de teste de voz validado/autorizado neste projeto. O script de
teste exige que o operador informe origem, licença e evidência de autorização;
esses campos documentam a declaração do operador, não provam sua veracidade.
Não baixe modelos de voz de pessoas/personagens nem modelos rotulados sem uma
licença e autorização claras.

Alternativa recomendada: grave a própria voz (ou use gravações com autorização
explícita para treinamento e conversão), registre consentimento, procedência e
termos de uso. Prefira pelo menos 10 minutos de fala limpa e variada, sem
música, reverberação, outras vozes ou longos silêncios; guarde os originais
locais e prepare cópias WAV mono sem clipping, conforme os requisitos do
pipeline do commit. O upstream recomenda aproximadamente 10 minutos ou mais
de dados de voz com baixo ruído.

### Dataset e treinamento de teste

O fluxo local de preparação e treino está implementado, mas nenhum áudio foi
fornecido e **nenhum treino foi iniciado**. Coloque apenas gravações próprias
ou explicitamente autorizadas em
[`datasets/hyron-test/README.md`](./datasets/hyron-test/README.md), execute o
preparador e revise/escute os segmentos e o manifesto antes de prosseguir. A
preparação converte para WAV mono PCM16 a 40 kHz, registra hashes e rejeita
arquivos inválidos; ela não verifica nem presume consentimento.

As duas dependências adicionais do caminho de treino (`matplotlib` e
`tensorboard`) estão listadas em `requirements.training-extra.txt` e foram
instaladas com autorização explícita somente no `.venv` isolado do runtime.
Isso deixa os imports necessários disponíveis, mas não remove os bloqueios de
dataset ausente e memória RAM insuficiente.

Depois de obter essa autorização, preparar/revisar dataset autorizado e decidir
iniciar o treino, use `train-windows.ps1`. O wrapper exige confirmação explícita
e declaração de autorização correspondente ao manifesto. O padrão conservador
é RVC v1/40 kHz, batch 1, 20 épocas, salvamento a cada 5 épocas, 0 workers e
sem cache GPU. Ele mede RAM/VRAM por APIs locais, aborta abaixo dos limites
configurados (padrão: 3,5 GiB de RAM livre e 4 GiB de VRAM livre) e monitora
recursos a cada 2 segundos. Esses limites não garantem que o treino caiba em
qualquer dataset; a verificação atual encontrou apenas 0,70 GiB de RAM livre,
portanto o treino seria recusado agora.

O export `.pth` só é copiado para `models/` depois de passar
`verify_checkpoint.py`, que carrega com `torch.load(..., weights_only=True)`,
valida o schema/tensores e grava SHA-256 no relatório de treinamento. Se o
loader restrito rejeitar o checkpoint, interrompa; não use
`weights_only=False`, allowlists amplas ou fallback.

Após checkpoint local verificado, origem/licença/autorização documentadas e
recursos suficientes, o operador poderá rodar `test-windows.ps1` com um WAV
real do Piper, `--index-rate 0` e sem índice FAISS. A conversão ainda não foi
executada nesta versão; veja o
[relatório v0.5.11](./RELATORIO-V0511.md) para as evidências e bloqueios.

Permissão para voz própria não implica automaticamente direitos de
redistribuição ou uso comercial. Esses usos dependem das permissões das
gravações, de todas as contribuições de terceiros e dos termos/licenças
documentados. Não use os checkpoints RVC antigos do workspace: sua
procedência e autorização não foram estabelecidas.

Use o WAV Piper existente apenas como entrada, nunca como fallback de saída:

```powershell
.\test-windows.ps1 `
  -InputWav "..\voice-engine\tests\output\piper-pt-br-v057.wav" `
  -ModelPth "C:\caminho\para\modelo-proprio.pth" `
  -OutputWav ".\output\piper-rvc.wav" `
  -ModelSource "URL ou registro de treinamento próprio" `
  -ModelLicense "licença/termos aplicáveis" `
  -AuthorizationEvidence "consentimento documentado; referência local não sensível"
```

O teste força carregamento PyTorch restrito, modo Transformers offline e
`--index-rate 0` (nenhum `.index` FAISS é carregado). Verifica WAV PCM de
entrada e saída, SHA-256, tamanho, parâmetros, sucesso/saída reportada pela CLI
e tempo de inferência. O relatório e o log ficam em `output\`. Não sobrescreve
uma saída anterior e falha explicitamente se não houver checkpoint/assets ou
se o CLI falhar. O hash diferente mais o exit code do CLI constituem evidência
de execução, não uma avaliação perceptual da qualidade.

O teste é um subprocesso, não um sandbox de segurança. Use apenas checkpoint
revisado, conta Windows sem privilégios, sem dados sensíveis e, se possível,
rede bloqueada pelo operador. Não integre ao HYRON até a execução independente
ser aprovada e revisada.
