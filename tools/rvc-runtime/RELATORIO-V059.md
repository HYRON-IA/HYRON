# Relatório técnico — RVC de referência HYRON v0.5.9

Data da verificação: 2026-10-11

## Resultado executivo

**Ambiente preparado em código; conversão real não executada e não declarada
funcional.** O runtime foi selecionado por commit e licença identificáveis,
tem CLI offline documentada e suporta Windows, CPU e CUDA. O workspace atual
não tem Python 3.12 disponível pelo launcher nem checkpoint de voz com
procedência, licença e autorização verificáveis. O setup não foi executado:
não instalou pacotes, não baixou código/assets/modelos e não alterou a antiga
instalação RVC. A implementação HYRON continua sem integração.

Requisito exato ausente para conversão: **ambiente Python 3.12 x64 isolado com
dependências e assets auxiliares disponíveis, além de um checkpoint RVC
compatível com `weights_only=True` e uma autorização verificável de uso da voz**.

## Runtime selecionado

- Repositório: [RVC-Project/Retrieval-based-Voice-Conversion-WebUI](https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI)
- Commit: [`81eed5e8f68b6bed1789f682fe78cdd324495afc`](https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI/commit/81eed5e8f68b6bed1789f682fe78cdd324495afc), commit `main` consultado na API GitHub em 2026-10-11. O commit upstream está sem assinatura verificada.
- Licença do repositório: MIT (`LICENSE` no commit fixado).
- Inferência offline documentada: `infer/cli.py`, opções `--model`, `--input`,
  `--output`, `--speaker-id`, `--pitch`, `--f0-method`, `--index` e
  `--index-rate`; documentação em `docs/en/cli.md`.
- Compatibilidade: README e requirements do upstream descrevem Windows x64 e
  Python 3.12. Há perfis para CPU e NVIDIA CUDA. Para GPU anterior à RTX 50,
  o perfil recomendado é PyTorch/Torchaudio 2.7.1+cu118. CPU usa
  PyTorch/Torchaudio 2.4.1+cpu e DirectML opcional no Windows.
- SHA do arquivo upstream de dependências CUDA 11.8:
  `47162bc65a72a1a6b26c2377ee8931b4748923d3` (blob no commit fixado).
  SHA do arquivo CPU: `30735cefc2e24c567483cc32168667bea438082f`.
- As listas upstream especificam intervalos para várias dependências; não são
  locks completos. A configuração proposta guarda `pip freeze` local após
  instalação, para repetir posteriormente a resolução daquele ambiente.
- URLs oficiais de índice usadas opcionalmente pelo script:
  PyPI `https://pypi.org/simple` e PyTorch `https://download.pytorch.org/whl/`.
  Nenhum script remoto foi executado.
- Os assets auxiliares HuBERT/RMVPE podem ser obtidos separadamente do
  repositório Hugging Face `lj1995/VoiceConversionWebUI`, revisão
  `e6d0c1a17da07c33557852f9dfa2bd44cc75737d` (cartão declara MIT). Hashes
  consultados no manifesto de arquivos dessa revisão:
  `hubert_base/config.json` Git blob
  `6f40f9bd2481c05c03d59f2b36f016fedc386187`;
  `hubert_base/preprocessor_config.json` Git blob
  `3cb012fae1b439d92a815fec1c09fa0ce19fd6bf`;
  `hubert_base/pytorch_model.bin` SHA-256
  `cc8c20f4b90a520757260197a3ff2505705a7adbd20ad9eeaa4e1a9b38442ef5`;
  `rmvpe.pt` SHA-256
  `6d62215f4306e3ca278246188607209f09af3dc77ed4232efdd069798c4ec193`.
  `prepare-assets.py` baixa apenas esses nomes da revisão fixa e confere os
  hashes, sem executar os arquivos. Os assets não foram baixados nesta tarefa.

## Ambiente encontrado e isolamento

- Windows x64.
- `python --version`: Python 3.14.5; launcher `py -0p` listou Python 3.14 e
  3.13, sem Python 3.12. O ambiente Piper existente também aponta para Python
  3.14.5 e não foi usado.
- A exigência upstream é Python 3.12 x64. Não foi instalado Python.
- `tools/rvc-runtime/configure-windows.ps1` fixa o código upstream, cria um
  `.venv` separado e não chama os scripts de instalação WebUI do upstream.
  Dependências só são instaladas com `-InstallDependencies`.
- CUDA foi relatada como disponível no contexto do projeto, mas não foi
  revalidada nesta etapa. Não houve inferência CPU ou CUDA.
- Nenhuma dependência, arquivo em `tools/voice-engine`, configuração Wrangler,
  Worker, D1 ou `public/` foi modificada por esta preparação.

## Carregamento e mitigação

Revisão dos loaders no caminho offline do commit:

| Operação | Caminho | Decisão |
| --- | --- | --- |
| `torch.load` — leitura preliminar de metadados do modelo | `infer/cli.py` | Patch local exige `weights_only=True`. |
| `torch.load` — carregar checkpoint para inferência | `infer/vc/modules.py` | Patch local exige `weights_only=True`. |
| `torch.load` — caminho alternativo de inferência | `infer/rtrvc.py` | Patch local exige `weights_only=True`. |
| `torch.load` — pesos RMVPE | `infer/rmvpe.py` | Patch local exige `weights_only=True`. |
| HuBERT `from_pretrained` | `infer/hubert.py` | Carregamento local `local_files_only=True`; o teste define `TRANSFORMERS_OFFLINE=1` e `TORCH_FORCE_WEIGHTS_ONLY_LOAD=1`. |
| FAISS `read_index` | `infer/rtrvc.py`, `infer/vc/pipeline.py` | Index rate fixado em zero na CLI de teste; nenhum índice é passado/carregado. Parser FAISS não foi tratado como seguro. |
| `pickle.load`, `joblib.load`, `torch.jit.load` | árvore `infer` | Busca de código não encontrou chamadas diretas. Não equivale a auditoria de dependências transitivas. |
| `torch.load(..., weights_only=False)` | PyMSS/separação, fora do fluxo de conversão RVC da CLI | Não executar; variável PyTorch força o modo restrito para o processo de teste. |

O script local `harden_runtime.py` somente altera os quatro call sites conhecidos
e exige o commit esperado; falha se as linhas não corresponderem ou se restar
`torch.load` sem `weights_only=True` na árvore `infer`. Não amplia allowlists e
não usa `weights_only=False`. Se um checkpoint próprio for rejeitado, o teste
para e não deve ser contornado; gere/exporte formato compatível ou selecione
outra implementação com serialização segura.

O mecanismo `weights_only` reduz a superfície de execução pickle, mas não
protege contra DoS, bugs de parser ou exploração de dependências. Subprocesso
não é sandbox; a execução futura requer conta sem privilégios e isolamento
operacional apropriado.

## Modelo e procedência

- Modelo de voz de teste: **nenhum**.
- O pacote público Hugging Face `lj1995/VoiceConversionWebUI` apresenta
  metadado de licença MIT e uma revisão identificável
  (`e6d0c1a17da07c33557852f9dfa2bd44cc75737d`), mas o pacote agrega muitos
  checkpoints e não oferece autorização/licença individual suficientemente
  clara para cada voz. Não foi usado nem baixado qualquer `.pth` de voz.
- Os checkpoints/índices da instalação antiga foram excluídos: inventário
  anterior encontrou artefatos sem procedência/licença/consentimento
  verificáveis. Não foram copiados, lidos como serialização ou carregados.
- HuBERT e RMVPE são assets auxiliares necessários; não foram baixados nesta
  etapa. A fonte sugerida pelo upstream é o repositório
  [lj1995/VoiceConversionWebUI](https://huggingface.co/lj1995/VoiceConversionWebUI)
  na revisão acima, cujo cartão informa MIT. A licença upstream não substitui
  a verificação de cada asset nem a autorização de um modelo de voz.
- Procedimento de teste futuro: gravar voz própria ou autorizada; documentar
  consentimento, licença, origem e uso permitido; treinar/exportar checkpoint
  pelo commit de referência; verificar que `weights_only=True` o carrega sem
  allowlists; então usar o WAV Piper de entrada com índice desativado.

## Resultado de conversão e evidências

- Modelo: não disponível/verificado.
- Entrada Piper: referência proposta
  `tools/voice-engine/tests/output/piper-pt-br-v057.wav`.
- O WAV de entrada foi validado como PCM mono 16 kHz, 16-bit, 129.280 frames,
  258.604 bytes, SHA-256
  `c4477bb35a1e66449cd06060f172ecde10d8bd04e7a36dd585b68f01d3776eb8`.
- Saída convertida: nenhuma.
- SHA-256, parâmetros WAV e tempo de inferência: não aplicáveis — nenhum teste
  RVC foi executado.
- Evidência de inferência real: **inexistente**. Não foi criada saída
  convertida nem apresentado áudio original como convertido.
- Script de teste futuro:
  `test-windows.ps1` chama `infer/cli.py` sem shell, exige campos de origem,
  licença e autorização, força modo restrito/offline, fixa index-rate=0,
  valida PCM WAV e grava SHA-256, parâmetros, código de saída, tempo, log e
  JSON técnico. Ele se recusa a sobrescrever saída e a declarar êxito se CLI
  falhar, saída ausente ou hash idêntico ao input.

## Compatibilidade/integration e próximos passos

1. Instalar/disponibilizar Python 3.12 x64 e executar
   `configure-windows.ps1` numa instalação limpa isolada.
2. Revisar as dependências fixadas pelo commit; instalar com a opção explícita
   e preservar `requirements.resolved.txt`.
3. Obter os assets HuBERT/RMVPE na revisão registrada e conferir integridade
   e procedência antes de os colocar no checkout isolado.
4. Criar checkpoint próprio/autorizado e testar somente com
   `weights_only=True`. Se houver rejeição do unpickler, não contornar.
5. Usar o WAV Piper v0.5.7; guardar relatório JSON, log, hashes e WAV de saída.
6. Somente após conversão independente comprovada, revisar sandbox e contrato
   de processo antes de documentar integração com `RVCEngine`. Nenhuma alteração
   de integração foi feita.
