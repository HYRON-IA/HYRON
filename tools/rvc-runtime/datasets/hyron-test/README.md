# Dataset local HYRON RVC

Copie aqui somente gravações suas ou explicitamente autorizadas:

- `inbox/`: arquivos-fonte fornecidos pelo operador.
- `prepared/recordings/`: WAV mono limpo gerado pelo preparador local.
- `reports/`: manifestos de origem, validação e treino.
- `upstream/logs/<experimento>/`: intermediários do treinamento no checkout
  isolado; `models/` guarda o checkpoint exportado localmente.

O conteúdo de áudio, manifestos locais, logs e checkpoints fica ignorado pelo
Git. Não grave áudio automaticamente. Para uma captura própria, use uma sala
silenciosa, microfone fixo e ganho sem clipping; grave fala natural variada,
com pausas e fonemas diversos, sem música, reverberação ou outras vozes. Um
conjunto de alguns minutos serve apenas para validar o pipeline, não garante
qualidade nem estabilidade de voz. Registre consentimento e uso permitido em
uma referência local não sensível antes de importar.

Exemplo de preparação após copiar gravações autorizadas para `inbox`:

```powershell
Set-Location ".\tools\rvc-runtime\datasets\hyron-test"
& ..\..\.venv\Scripts\python.exe ..\..\prepare_dataset.py `
  --source .\inbox `
  --output .\prepared\recordings `
  --report .\reports\dataset-manifest.json `
  --authorization-evidence "Voz própria; autorização do operador registrada localmente"
```

O preparador recusa saídas existentes, relata arquivos ilegíveis e cria WAV
mono PCM a 40 kHz com silêncios longos aparados/divididos. Revise o manifesto,
ouça os segmentos e confirme que só contêm voz autorizada antes de qualquer
treino. A preparação local não prova consentimento nem a identidade de quem
fala.
