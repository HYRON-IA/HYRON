[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$InputWav,
    [Parameter(Mandatory = $true)]
    [string]$ModelPth,
    [Parameter(Mandatory = $true)]
    [string]$OutputWav,
    [Parameter(Mandatory = $true)]
    [string]$ModelSource,
    [Parameter(Mandatory = $true)]
    [string]$ModelLicense,
    [Parameter(Mandatory = $true)]
    [string]$AuthorizationEvidence,
    [int]$SpeakerId = 0,
    [int]$Pitch = 0,
    [ValidateSet("pm", "rmvpe")]
    [string]$F0Method = "rmvpe",
    [string]$ReportPath = (Join-Path $PSScriptRoot "output\conversion-report.json")
)

$ErrorActionPreference = "Stop"
$pythonPath = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
$runtimePath = Join-Path $PSScriptRoot "upstream"

if (-not (Test-Path $pythonPath)) {
    throw "Isolated environment not found. Run configure-windows.ps1 first."
}
if (-not (Test-Path $runtimePath)) {
    throw "Pinned RVC source not found. Run configure-windows.ps1 first."
}
if ([string]::IsNullOrWhiteSpace($ModelSource) -or
    [string]::IsNullOrWhiteSpace($ModelLicense) -or
    [string]::IsNullOrWhiteSpace($AuthorizationEvidence)) {
    throw "A model source, license, and authorization/consent evidence are all required."
}

$resolvedInput = (Resolve-Path -LiteralPath $InputWav).Path
$resolvedModel = (Resolve-Path -LiteralPath $ModelPth).Path
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputWav)
$resolvedReport = [System.IO.Path]::GetFullPath($ReportPath)
if (Test-Path $resolvedOutput) {
    throw "Refusing to overwrite existing output: $resolvedOutput"
}
if ([System.IO.Path]::GetExtension($resolvedInput) -ne ".wav" -or
    [System.IO.Path]::GetExtension($resolvedOutput) -ne ".wav") {
    throw "Input and output must both have a .wav extension."
}

$env:TORCH_FORCE_WEIGHTS_ONLY_LOAD = "1"
$env:HF_HUB_OFFLINE = "1"
$env:TRANSFORMERS_OFFLINE = "1"
& $pythonPath (Join-Path $PSScriptRoot "run_conversion.py") `
    --runtime-path $runtimePath `
    --input-wav $resolvedInput `
    --model-pth $resolvedModel `
    --output-wav $resolvedOutput `
    --report-path $resolvedReport `
    --model-source $ModelSource `
    --model-license $ModelLicense `
    --authorization-evidence $AuthorizationEvidence `
    --speaker-id $SpeakerId `
    --pitch $Pitch `
    --f0-method $F0Method
if ($LASTEXITCODE -ne 0) {
    throw "RVC conversion/test failed with exit code $LASTEXITCODE."
}
