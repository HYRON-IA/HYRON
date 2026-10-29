# HYRON RVC Cloud Trainer v0.5.12

Este diretório prepara um ambiente de treinamento RVC compatível com o Kaggle, mantendo o runtime local do HYRON isolado e sem execução automática de treinamento. O objetivo é permitir preparar dataset, verificar recursos e exportar checkpoints em um ambiente com GPU disponível, cobrindo a necessidade de treinamento em nuvem sem consumir RAM/GPU do computador local.

## Estrutura

- `notebooks/HYRON_RVC_Kaggle.ipynb`: notebook de diagnóstico e orquestração.
- `scripts/prepare_dataset.py`: valida, normaliza, segmenta e grava manifesto do dataset.
- `scripts/verify_checkpoint.py`: valida checkpoint usando carregamento restrito.
- `scripts/export_model.py`: empacota checkpoint, configuração e metadados.
- `configs/training.json`: configuração conservadora para GPU Kaggle.
- `output/`: diretório de saída para artefatos gerados.

## Requisitos do Kaggle

- Conta Kaggle com acesso a um notebook.
- GPU NVIDIA disponível na sessão; se não houver, o notebook apenas reporta o bloqueio.
- Ambiente reportado em 2026-10-11: Python 3.13.15, PyTorch 2.11.0+cu128, CUDA ativo, 29.65 GB RAM livre e duas NVIDIA Tesla T4 (14.56 GB VRAM cada). O notebook mascara as GPUs para começar usando somente a GPU física 0.
- Esses dados confirmam o ambiente, não certificam compatibilidade RVC: o perfil upstream fixado é para Python 3.12 e Torch 2.7.1 (<2.8), então o treino com Python 3.13/Torch 2.11 permanece não verificado.
- Acesso ao dataset do operador ou a um Kaggle Dataset privado com autorização explícita.
- Sem credenciais armazenadas no notebook.
- Internet para baixar o runtime upstream fixado, se a sessão permitir.

**Não instale `requirments_cu128_py312.txt` upstream nessa sessão:** os limites não correspondem ao ambiente reportado. Não faça downgrade automático de Torch/Torchaudio. Primeiro inventarie as dependências preinstaladas, rode `pip check` e valide imports/sintaxe do caminho mínimo. O notebook não executa treinamento.

## Como usar

1. Abra o notebook em um ambiente Kaggle.
2. Verifique se a sessão possui GPU e memória suficiente.
3. Anexe o dataset autorizado do operador.
4. Ajuste os caminhos em `configs/training.json` ou no notebook.
5. Execute apenas as células de diagnóstico; não inicie treinamento automaticamente.
6. Quando autorizado, execute:

```bash
python scripts/prepare_dataset.py \
  --input-dir /kaggle/input/<dataset> \
  --output-dir /kaggle/working/rvc-prepared \
  --report /kaggle/working/rvc-prepared/manifest.json \
  --authorization-evidence "<evidencia de autoria/autorização>"
```

7. Valide o checkpoint gerado:

```bash
python scripts/verify_checkpoint.py \
  --checkpoint /kaggle/working/rvc-output/model.pth \
  --report /kaggle/working/rvc-output/checkpoint-report.json
```

8. Empacote para uso local:

```bash
python scripts/export_model.py \
  --checkpoint /kaggle/working/rvc-output/model.pth \
  --config /kaggle/working/rvc-output/config.json \
  --manifest /kaggle/working/rvc-prepared/manifest.json \
  --output-dir /kaggle/working/rvc-export
```

## Segurança

- Não publicar gravações; preservar privacidade e retenção conforme política do Kaggle.
- Se a GPU não estiver disponível, o notebook deve interromper com mensagem clara.
- Não usar `weights_only=False` como solução automática para compatibilidade.
- Não declarar sucesso de treino sem execução real e validação do checkpoint.
- Requer autorização explícita do operador para qualquer dataset ou checkpoint.

## Configuração conservadora

O arquivo `configs/training.json` usa valores padrão seguros e moderados:

```json
{
  "runtime_commit": "81eed5e8f68b6bed1789f682fe78cdd324495afc",
  "sample_rate": 40000,
  "batch_size": 1,
  "epochs": 20,
  "save_every": 5,
  "f0_method": "rmvpe",
  "num_workers": 0,
  "index_rate": 0,
  "use_intermediate_checkpoints": true
}
```

Esses valores servem como linha de base e não garantem qualidade em qualquer dataset. O operador deve confirmar o início do treinamento antes da execução real.

## Limitações

- O notebook não inicia treinamento automaticamente.
- O Kaggle pode não fornecer GPU, memória ou espaço em disco suficientes.
- A compatibilidade do runtime upstream com o ambiente do Kaggle deve ser revalidada a cada sessão.
- O pacote exportado não substitui a revisão da origem, autorização e hash do checkpoint final.

## Próximos passos

1. Importar o notebook no Kaggle.
2. Validar GPU, RAM e VRAM.
3. Usar dataset autorizado e revisar manifesto.
4. Aguardar confirmação explícita do operador antes de treinar.
5. Executar verificação do checkpoint e exportar artefatos.

## Documentação relacionada

- `../rvc-runtime/RELATORIO-V0511.md`
- `RELATORIO-V0512.md`
