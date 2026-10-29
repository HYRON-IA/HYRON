# Relatório técnico — RVC de referência HYRON v0.5.10

Data da verificação: 2026-10-11

## Resultado executivo

**Runtime isolado instalado e validado; conversão real não executada nem
declarada funcional.** O checkout está fixado em um commit identificável e a
CLI offline inicia. O ambiente CUDA para Windows passou pelas verificações de
dependências, importação e disponibilidade da GPU.

Os assets auxiliares HuBERT/RMVPE foram baixados após autorização explícita e
seus hashes conferem. O bloqueio para conversão é a ausência de um checkpoint
de voz com procedência, licença e autorização de uso verificáveis. Nenhum
modelo da instalação RVC antiga foi reutilizado, e o runtime não foi integrado
ao Voice Engine.

## Runtime selecionado

- Projeto: [RVC-Project/Retrieval-based-Voice-Conversion-WebUI](https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI)
- URL Git: `https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI.git`
- Commit fixado: [`81eed5e8f68b6bed1789f682fe78cdd324495afc`](https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI/commit/81eed5e8f68b6bed1789f682fe78cdd324495afc); commit consultado na API oficial do GitHub, sem assinatura verificada.
- Licença do código: MIT, conforme `LICENSE` no commit fixado.
- Interface: `infer/cli.py`, documentada em
  [docs/en/cli.md no commit selecionado](https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI/blob/81eed5e8f68b6bed1789f682fe78cdd324495afc/docs/en/cli.md).
- Compatibilidade: Windows x64, Python 3.12, CPU e CUDA. Foi selecionado o
  perfil CUDA 11.8 apropriado à GPU detectada.
- O upstream está em `tools/rvc-runtime/upstream`, em checkout detached no
  commit esperado. O setup não executa instaladores ou scripts remotos.

A licença MIT cobre o código upstream, não os direitos de cada gravação ou
checkpoint de voz. Origem, termos de uso e autorização precisam ser verificados
para cada modelo.

## Ambiente e dependências

- Sistema: Windows x64.
- Python base instalado pelo Python Install Manager oficial:
  `C:\Users\Admin\AppData\Local\Python\pythoncore-3.12-64\python.exe`,
  CPython 3.12.10 x64.
- Ambiente isolado: `tools/rvc-runtime/.venv`, criado a partir desse Python;
  `include-system-site-packages=false`. O ambiente Piper e o Python embutido
  na instalação RVC antiga não foram usados.
- GPU: NVIDIA GeForce RTX 3050 6GB Laptop GPU.
- PyTorch: `2.7.1+cu118`; Torchaudio: `2.7.1+cu118`; CUDA informada por
  PyTorch: 11.8; `torch.cuda.is_available()`: `True`.
- Dependências diretas mínimas de inferência:
  `requirements.inference-py312.txt`.
- Versões efetivamente resolvidas na instalação:
  `requirements.resolved.txt` (saída de `pip freeze --all` do `.venv`).
- Índices usados: PyPI (`https://pypi.org/simple`) e índice oficial PyTorch
  CUDA 11.8 (`https://download.pytorch.org/whl/cu118`). Instalação limitada a
  wheels binárias; não foi usado o requirements completo upstream, que inclui
  componentes de UI, treinamento e separação de fontes.
- `pip check`: **No broken requirements found.**

## Carregamento e controles

O setup verificou o commit antes de aplicar o hardening local. Os quatro
`torch.load` do caminho RVC de inferência exigem `weights_only=True`:

| Arquivo | Operação revisada |
| --- | --- |
| `infer/cli.py` | Leitura inicial de metadados do modelo |
| `infer/vc/modules.py` | Carregamento do checkpoint para inferência |
| `infer/rtrvc.py` | Caminho alternativo do checkpoint |
| `infer/rmvpe.py` | Carregamento dos pesos RMVPE |

O teste de conversão também força `TORCH_FORCE_WEIGHTS_ONLY_LOAD=1`,
`HF_HUB_OFFLINE=1` e `TRANSFORMERS_OFFLINE=1`. Os carregadores FAISS
permanecem sem mitigação de desserialização; o teste futuro deve manter
`--index-rate 0` e não fornecer arquivo `.index`. Nenhum fallback para
`weights_only=False` ou allowlist ampla foi introduzido.

O hardener audita os loaders na árvore de inferência e recusa alterações
inesperadas. Os testes cobrem as edições restritas/idempotentes, resolução de
aliases, rejeição de loaders irrestritos e hashes do manifesto de assets.
Isso reduz riscos de pickle, mas não é uma sandbox nem elimina riscos em
dependências e parsers.

## Assets e modelo de voz

- Checkpoint de teste: **nenhum disponível/verificado**.
- Procedência/licença/autorização de um modelo: **não aplicável; não foi
  selecionado nem carregado checkpoint**.
- Assets auxiliares HuBERT/RMVPE: baixados da revisão fixa após autorização
  explícita e verificados por hash com `prepare-assets.py`. Os arquivos não
  foram abertos, desserializados ou carregados.
- Fonte indicada para futura avaliação dos assets auxiliares:
  [lj1995/VoiceConversionWebUI](https://huggingface.co/lj1995/VoiceConversionWebUI),
  revisão `e6d0c1a17da07c33557852f9dfa2bd44cc75737d`. O cartão do repositório
  informa MIT; isso não substitui a verificação dos termos de cada arquivo.
- Hashes verificados localmente:
  - `hubert_base/config.json` (Git blob):
    `6f40f9bd2481c05c03d59f2b36f016fedc386187`
  - `hubert_base/preprocessor_config.json` (Git blob):
    `3cb012fae1b439d92a815fec1c09fa0ce19fd6bf`
  - `hubert_base/pytorch_model.bin` (SHA-256):
    `cc8c20f4b90a520757260197a3ff2505705a7adbd20ad9eeaa4e1a9b38442ef5`
  - `rmvpe.pt` (SHA-256):
    `6d62215f4306e3ca278246188607209f09af3dc77ed4232efdd069798c4ec193`

Não usar modelos de celebridades, personagens ou terceiros sem licença e
autorização claras. A alternativa é criar um modelo próprio a partir de
gravações próprias ou explicitamente autorizadas, documentando consentimento,
origem, licença e usos permitidos. Se o checkpoint for rejeitado por
`weights_only=True`, não relaxar o loader: interromper o teste e exportar um
checkpoint compatível ou escolher outra implementação segura.

## Validação e resultado da conversão

Executado:

1. `configure-windows.ps1 -Backend CUDA118 -InstallDependencies`: **concluído**.
2. Verificação do ambiente, isolamento e commit upstream: **passou**.
3. `pip check`: **passou**.
4. Imports PyTorch/Torchaudio, CUDA/GPU, dependências de áudio, Transformers e
   Hugging Face: **passaram**.
5. `infer/cli.py --help`: **passou**; opções documentadas incluem modelo,
   entrada, saída, speaker, pitch e método F0.
6. `prepare-assets.py --include-rmvpe`: **concluído**; os quatro arquivos da
   lista acima foram baixados e os hashes conferem. O script apenas verifica
   bytes e não carrega os pesos.
7. Testes unitários de runtime: **6 passaram**, incluindo hardening de loaders
   e validação de hashes do manifesto.
8. Sintaxe PowerShell e verificação de whitespace dos documentos: **passaram**.

Durante a primeira tentativa, uma importação agrupada falhou com erro do
Windows indicando espaço insuficiente no arquivo de paginação. O teste de
dependências foi separado em verificações apropriadas; a importação isolada de
Parselmouth e a configuração completa subsequente passaram. Não foi alterada
configuração de memória ou paginação do Windows.

Nenhuma entrada Piper foi submetida ao RVC nesta etapa. Não há saída de áudio
convertida, SHA-256 de saída, parâmetros WAV de saída, duração de inferência ou
evidência de inferência real. Não foi apresentado áudio original como se fosse
convertido.

## Próximos passos e integração

1. Criar ou fornecer checkpoint compatível, com origem, licença e autorização
   verificáveis; não usar checkpoints da instalação antiga.
2. Executar `test-windows.ps1` com o WAV produzido pelo Piper. O script exige
   campos de procedência/licença/autorização, força o carregamento restrito,
   mantém o índice FAISS desativado, valida o WAV e grava SHA-256, tempo e
   relatório técnico. Não sobrescreve saída existente.
3. Revisar as evidências da conversão independente antes de documentar
   integração com `RVCEngine`.

Nenhum arquivo do Worker, Cloudflare D1, Wrangler, `public/` ou integração
principal foi alterado; não houve deploy. A instalação RVC anterior não foi
modificada, e nenhum checkpoint foi publicado.
