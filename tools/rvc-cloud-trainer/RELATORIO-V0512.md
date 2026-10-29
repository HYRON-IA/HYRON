# Relatorio tecnico — HYRON RVC Cloud Trainer v0.5.12

Data de atualizacao: 2026-10-11

## Resumo e criterio de evidencia

Foi reportado um teste real de sessao Kaggle com Python 3.13.15, PyTorch
2.11.0+cu128, CUDA 12.8, 29.62 GB de RAM livre e duas NVIDIA Tesla T4
com 14.46 GB de VRAM cada. O notebook foi atualizado para refletir esse
ambiente, deixar visivel somente a GPU fisica 0 e reportar dependencias
instaladas sem instalar ou substituir pacotes.

Os valores de hardware/software acima sao os resultados fornecidos pelo
operador da sessao Kaggle; eles nao foram reproduzidos a partir deste workspace.
Eles confirmam o ambiente, **nao** confirmam que o RVC foi importado,
preprocessado ou treinado nesse ambiente. Nao houve treino nem carregamento de
checkpoint nesta atualizacao.

## Resultados do diagnostico Kaggle

| Item | Resultado informado | Estado |
| --- | --- | --- |
| Python | 3.13.15 | Ambiente confirmado pelo operador |
| PyTorch | 2.11.0+cu128 | Ambiente confirmado pelo operador |
| CUDA | 12.8, disponivel | Ambiente confirmado pelo operador |
| `CUDA_VISIBLE_DEVICES=0` | Funcionou | Ambiente confirmado pelo operador |
| RAM livre | aproximadamente 29.62 GB | Ambiente confirmado pelo operador |
| GPU 0 | NVIDIA Tesla T4, 14.46 GB VRAM disponivel | Selecionada inicialmente |
| GPU 1 | NVIDIA Tesla T4, 14.46 GB VRAM disponivel | Nao sera usada inicialmente |
| NumPy | 2.1.3 | Ambiente confirmado pelo operador |
| librosa | 0.11.0 | Ambiente confirmado pelo operador |
| SciPy | 1.16.3 | Ambiente confirmado pelo operador |
| soundfile | 0.14.0 | Ambiente confirmado pelo operador |
| Transformers | 5.16.1 | Ambiente confirmado pelo operador |
| TensorBoard | 2.20.0 | Ambiente confirmado pelo operador |
| matplotlib | 3.10.0 | Ambiente confirmado pelo operador |
| `faiss-cpu`, `av`, `praat-parselmouth` | Ausentes | Ambiente confirmado pelo operador |
| Kaggle usando o runtime RVC fixado | Sem resultado fornecido | Nao verificado |
| Treinamento | Nao iniciado | Intencional |

O notebook define `CUDA_VISIBLE_DEVICES=0` antes de importar PyTorch e
seleciona `cuda:0`, correspondente a primeira GPU visivel. A mascara limita a
sessao do notebook a GPU fisica 0; CUDA enumera essa unica GPU como device 0.
O notebook tambem registra quantidade/nome/VRAM visiveis e memoria livre.

## Runtime fixado e compatibilidade

Runtime de referencia:

- Repositorio: `RVC-Project/Retrieval-based-Voice-Conversion-WebUI`
- Commit: `81eed5e8f68b6bed1789f682fe78cdd324495afc`
- O checkout local de referencia foi confirmado nesse SHA com
  `git rev-parse HEAD`.
- Perfil de dependencias upstream revisado:
  [`requirments_cu128_py312.txt`](https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI/blob/81eed5e8f68b6bed1789f682fe78cdd324495afc/requirments_cu128_py312.txt).

### Compatibilidade verificada

- **Hardware Kaggle informado:** duas Tesla T4, CUDA ativo e memoria disponivel.
- **Checkout local:** o commit corresponde ao SHA fixado.
- **Protecao local dos loaders:** as copias HYRON dos caminhos de inferencia e
  treino foram revisadas para exigir `torch.load(..., weights_only=True)`;
  `harden_runtime.py` define/verifica os patches e a configuracao conservadora
  do DataLoader.
- **Notebook:** a configuracao agora restringe a GPU visivel a GPU 0 e nao
  contem etapa de instalacao nem comando de treinamento.

Esses fatos nao demonstram que os mesmos patches foram aplicados ao checkout
criado numa sessao Kaggle. Isso precisa ser confirmado na sessao antes de
qualquer tentativa de treino.

### Incompatibilidades identificadas no perfil upstream

O perfil CUDA do commit esta explicitamente direcionado a Python 3.12 e
documenta PyTorch/Torchaudio `2.7.1+cu128`, com Torch abaixo de `2.8`. O Kaggle
reportado tem Python 3.13.15 e Torch 2.11.0+cu128, fora do perfil declarado.
Portanto, a compatibilidade runtime + treino nao esta verificada; nao se deve
instalar esse perfil nem substituir PyTorch/Torchaudio automaticamente.

O mesmo arquivo fixa `numpy>=1.26.4,<2`. O NumPy 1.x nao oferece wheel CPython
3.13 no limite 1.26.4, enquanto migrar para NumPy 2 nao satisfaz o limite
`<2` e pode expor incompatibilidades de API/ABI em dependencias antigas.
Assim, esta especificacao nao resolve de forma reproduzivel para o ambiente
Python 3.13 sem revisao/atualizacao coordenada do runtime e dependencias.

O conjunto upstream tambem fixa ou limita dependencias antigas da interface
(por exemplo Gradio 3.14 e FastAPI/Pydantic/Starlette antigos) e
`onnxruntime-gpu<1.20`. Elas nao foram instaladas nem testadas nesta sessao.
Parte da interface/ONNX nao e necessaria para o caminho minimo de treino; nao
instalar o `requirements` inteiro as cegas. Os pacotes efetivamente presentes
no Kaggle foram informados abaixo. O notebook inclui inventario de versoes,
`pip check` e testes isolados de importacao; esses testes ainda precisam ser
executados no Kaggle para obter resultados reais.

### Dependencias do treino e classificacao por evidencia

| Dependencia | Papel no runtime fixado | Estado no Kaggle | Classificacao |
| --- | --- | --- | --- |
| PyTorch | Treino/inferencia; CUDA e AMP | 2.11.0+cu128 | **Incompatibilidade confirmada com o perfil** (`<2.8`); funcionalidade RVC nao verificada |
| NumPy | Arrays e operacoes numericas | 2.1.3 | **Incompatibilidade confirmada com o perfil** (`>=1.26.4,<2`); compatibilidade funcional ainda nao verificada |
| Python | Runtime base | 3.13.15 | **Fora do alvo declarado** (perfil Python 3.12); compatibilidade funcional nao verificada |
| librosa | Leitura/processamento de audio | 0.11.0 | **Incompatibilidade confirmada com o limite declarado** (`>=0.10.2,<0.11`); compatibilidade funcional nao verificada |
| Transformers | HuBERT e extracao de features | 5.16.1 | **Incompatibilidade confirmada com o limite declarado** (`>=4.49,<4.50`); API do runtime nao verificada |
| SciPy, soundfile | Processamento e escrita de audio | 1.16.3, 0.14.0 | Versoes relatadas; compatibilidade com o fluxo ainda nao verificada |
| TensorBoard, matplotlib | Logs e rotinas de visualizacao do treino | 2.20.0, 3.10.0 | Versoes relatadas; compatibilidade com o fluxo ainda nao verificada |
| PyAV (`av`), ffmpeg-python | Decodificacao e carregamento do audio | `av` ausente; ffmpeg-python nao informado | **Obrigatorio para o caminho de audio atual**; o import incondicional de `av` bloqueia `infer.audio` |
| praat-parselmouth | Extrator de pitch F0 | Ausente | **Obrigatorio para importar o extrator atual**: importado no topo mesmo quando se seleciona RMVPE |
| FAISS (`faiss-cpu`) | Construcao/leitura de indice de busca | Ausente | **Opcional** para treino acustico sem criar/usar indice |
| torchaudio | Backend CUDA opcional de resampling | Nao informado | Opcional para o caminho que usa fallback FFmpeg |

As incompatibilidades confirmadas acima sao conflitos objetivos com as
restricoes publicadas no arquivo de requisitos daquele commit; nao sao prova
de que cada API ou operacao necessariamente falhara. Nenhuma versao antiga
sera instalada automaticamente, e PyTorch/NumPy existentes nao serao
substituidos.

### Estados usados neste relatorio

- **Funcionalidade comprovada:** observacao executada no ambiente Kaggle ou
  verificacao local explicitamente identificada; nao generaliza para treino.
- **Compatibilidade provavel:** inferida do codigo/dependencias, sem execucao
  representativa no ambiente alvo.
- **Compatibilidade nao verificada:** faltam execucao e evidencias suficientes.
- **Incompatibilidade confirmada:** divergencia comprovada em relacao aos
  limites declarados no perfil upstream. Nao implica necessariamente uma falha
  funcional em toda execucao.

O notebook atualizado prepara `pip check`, compilacao estaticamente segura e
imports isolados. A saida desses testes ainda nao existe; nao se presume
resultado positivo nem negativo.

As notas oficiais do [PyTorch 2.11.0](https://github.com/pytorch/pytorch/releases/tag/v2.11.0)
tambem informam que `pip install torch` sem indice especifico passou a obter
wheels CUDA 13.0 no PyPI, embora wheels cu128 continuem disponiveis no indice
oficial. Como o ambiente Kaggle ja reporta `2.11.0+cu128`, nao executar
instalacao generica de Torch; ela pode substituir o build CUDA presente.

### PyTorch 2.11

O fato de o Kaggle iniciar PyTorch 2.11.0+cu128 com CUDA disponivel confirma
somente que a distribuicao PyTorch carregou e ve CUDA/GPU. Nao confirma que o
codigo RVC nesse commit funciona com essa versao. A revisao do perfil upstream
mostra a versao testada/declarada como 2.7.1 e o limite `<2.8`; nao foi
encontrada uma declaracao upstream de suporte a 2.11. Validar API de treino,
AMP, checkpoints e dependencias continua pendente de smoke tests na sessao.

O argumento `weights_only=True` e mantido nos loaders HYRON de inferencia e
treino. O notebook inspeciona se o `torch.load` presente expoe esse parametro;
isso nao substitui validar checkpoint autorizado. Falha de carregamento
restrito deve interromper o fluxo. Nao usar `weights_only=False`, allowlists
amplas ou outro contorno.

## Estrategia reproduzivel para Kaggle

Sem fazer instalacao nem treino:

1. Iniciar uma sessao Kaggle com a imagem que reportou Python 3.13.15 e Torch
   2.11.0+cu128; guardar a saida integral do diagnostico.
2. Executar o notebook atualizado desde a primeira celula. Ele define
   `CUDA_VISIBLE_DEVICES=0` antes de importar PyTorch e limita o processo a uma
   GPU. Confirmar `torch.cuda.device_count() == 1`, GPU T4 e memoria.
3. Clonar o repositorio upstream, fazer checkout explicito do SHA fixado e
   interromper se `git rev-parse HEAD` divergir.
4. Disponibilizar o `tools/rvc-runtime/harden_runtime.py` revisado do HYRON
   atraves de upload manual de codigo ou Kaggle Dataset privado. A nova celula
   importa o helper e chama apenas `check_commit`, `verify_expected_worktree`
   e `inspect_other_loaders`: ela verifica que os patches restritos ja estao
   aplicados no checkout, sem chamar `harden()` e sem alterar arquivos. Se os
   patches nao estiverem presentes, o teste falha; esta etapa nao os aplica.
5. Nao executar
   `pip install -r requirments_cu128_py312.txt`: esse perfil e para Python 3.12,
   exige Torch anterior a 2.8 e conflita com Python 3.13/NumPy `<2`.
6. Nao trocar/downgradear Torch nem instalar dependencias automaticamente.
   Inventariar dependencias preinstaladas, executar `pip check`, compilar
   estaticamente os arquivos `.py` e importar modulos reutilizaveis em
   subprocessos separados, sem dataset/checkpoint. Entry points com efeitos
   colaterais no import sao compilados, mas nao executados/importados. Registrar
   falhas e bloquear a conclusao de compatibilidade quando houver.
7. Manter workers em 0 inicialmente, `cuda:0`, batch size 1 e salvar
   checkpoints intermediarios. Essas opcoes nao provam compatibilidade ou
   limite de memoria.
8. Somente depois dos testes de compatibilidade, anexar dataset proprio ou
   explicitamente autorizado, revisar o manifesto e solicitar confirmacao
   explicita antes de iniciar treino.

O notebook nao executa os passos de clone, instalacao ou treino
automaticamente. Essa sequencia e um procedimento de verificacao, nao
evidencia de execucao bem-sucedida do RVC.

## Dataset, checkpoints e exportacao

O preparo continua em `scripts/prepare_dataset.py`; exige declaracao de
autorizacao, normaliza para WAV mono PCM16, segmenta, calcula hashes e grava
manifesto. Nao coleta nem publica audio. Privacidade e retencao dependem das
politicas Kaggle e do operador.

`scripts/verify_checkpoint.py` usa exclusivamente
`torch.load(..., map_location="cpu", weights_only=True)`, calcula SHA-256 e
rejeita carga/estrutura incompativel. `scripts/export_model.py` nao inclui
gravacoes originais por padrao. Nenhum checkpoint foi criado nem carregado
nesta atualizacao.

## Testes e limitacoes

Executado/confirmado neste workspace:

- confirmacao do SHA do checkout local;
- revisao do perfil upstream no mesmo commit e comparacao com versoes Kaggle
  informadas;
- notebook atualizado para preparar `pip check`, verificacao de commit e
  patches em modo somente leitura, compilacao sem execucao e imports isolados;
- configuracao atualizada para selecionar GPU 0 e nao instalar PyTorch;
- nenhum treinamento, deploy ou alteracao ao HYRON principal.

Pendente:

- reexecutar o notebook no Kaggle apos estas alteracoes;
- registrar a saida efetiva de `pip check` e dos imports de smoke test;
- executar os testes de sintaxe no checkout Kaggle;
- verificar commit e aplicacao previa dos patches restritos no clone Kaggle;
- teste de dataset/checkpoint autorizado e treino, somente apos aprovacao.

**Conclusao:** o ambiente Kaggle de hardware/software esta confirmado por
relato do operador, mas a compatibilidade do runtime RVC fixado com Python
3.13.15 e PyTorch 2.11.0+cu128 permanece **nao verificada**. O perfil de
dependencias upstream disponivel e incompatível como receita direta. Nao
instalar versoes antigas automaticamente nem iniciar treinamento ate resolver
e testar as incompatibilidades acima.
