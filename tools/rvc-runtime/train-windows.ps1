[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ExperimentName,
    [string]$DatasetDirectory = (Join-Path $PSScriptRoot "datasets\hyron-test\prepared\recordings"),
    [string]$DatasetManifest = (Join-Path $PSScriptRoot "datasets\hyron-test\reports\dataset-manifest.json"),
    [Parameter(Mandatory = $true)]
    [string]$AuthorizationEvidence,
    [Parameter(Mandatory = $true)]
    [string]$ConfirmTraining,
    [ValidateRange(1, 2)]
    [int]$BatchSize = 1,
    [ValidateRange(1, 100)]
    [int]$Epochs = 20,
    [ValidateRange(1, 100)]
    [int]$SaveEveryEpoch = 5,
    [ValidateSet(0, 1)]
    [int]$DataLoaderWorkers = 0,
    [ValidateSet(1, 2)]
    [int]$PrefetchFactor = 1,
    [ValidateRange(1, 7)]
    [double]$MinimumFreeRamGiB = 3.5,
    [ValidateRange(1, 6)]
    [double]$MinimumFreeVramGiB = 4.0
)

$ErrorActionPreference = "Stop"
if ($ConfirmTraining -cne "I_AUTHORIZE_HYRON_RVC_TRAINING") {
    throw 'Explicit confirmation required: -ConfirmTraining "I_AUTHORIZE_HYRON_RVC_TRAINING".'
}

$pythonPath = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $pythonPath)) {
    throw "Isolated Python environment not found: $pythonPath"
}

$arguments = @(
    (Join-Path $PSScriptRoot "train_rvc.py"),
    "--runtime-path", (Join-Path $PSScriptRoot "upstream"),
    "--dataset-directory", [System.IO.Path]::GetFullPath($DatasetDirectory),
    "--dataset-manifest", [System.IO.Path]::GetFullPath($DatasetManifest),
    "--authorization-evidence", $AuthorizationEvidence,
    "--experiment-name", $ExperimentName,
    "--batch-size", "$BatchSize",
    "--epochs", "$Epochs",
    "--save-every-epoch", "$SaveEveryEpoch",
    "--dataloader-workers", "$DataLoaderWorkers",
    "--prefetch-factor", "$PrefetchFactor",
    "--minimum-free-ram-gib", "$MinimumFreeRamGiB",
    "--minimum-free-vram-gib", "$MinimumFreeVramGiB",
    "--confirm-training", "I_AUTHORIZE_HYRON_RVC_TRAINING"
)

& $pythonPath @arguments
if ($LASTEXITCODE -ne 0) {
    throw "RVC training pipeline stopped with exit code $LASTEXITCODE."
}
