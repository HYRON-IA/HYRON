[CmdletBinding()]
param(
    [ValidateSet("CPU", "CUDA118")]
    [string]$Backend = "CUDA118",
    [switch]$InstallDependencies
)

$ErrorActionPreference = "Stop"
$runtimeCommit = "81eed5e8f68b6bed1789f682fe78cdd324495afc"
$runtimeUrl = "https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI.git"
$root = $PSScriptRoot
$sourcePath = Join-Path $root "upstream"
$venvPath = Join-Path $root ".venv"
$pythonPath = Join-Path $venvPath "Scripts\python.exe"
$markerPath = Join-Path $root ".backend"
$oldRuntimePath = "C:\Users\Admin\Downloads\RVC20260718Nvidia\RVC20260718Nvidia"

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Description,
        [Parameter(Mandatory = $true)]
        [scriptblock]$Command
    )
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Description failed with exit code $LASTEXITCODE."
    }
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "Git is required. Install Git for Windows, then rerun this script."
}
if (-not (Get-Command py -ErrorAction SilentlyContinue)) {
    throw "The Python launcher is required. Install Python 3.12 x64, then rerun."
}

Invoke-Checked "Inspect the Python 3.12 base interpreter" {
    $pythonInfoJson = & py -3.12 -c "import json,struct,sys; print(json.dumps({'version': '.'.join(map(str,sys.version_info[:3])), 'bits': struct.calcsize('P')*8, 'executable': sys.executable, 'prefix': sys.prefix}))"
    if ($LASTEXITCODE -ne 0) {
        throw "Cannot query the Python 3.12 launcher runtime."
    }
    $pythonInfo = $pythonInfoJson | ConvertFrom-Json
    if ($pythonInfo.version -ne "3.12.10" -or $pythonInfo.bits -ne 64) {
        throw "Expected official Python 3.12.10 x64; found Python $($pythonInfo.version), $($pythonInfo.bits)-bit."
    }
    if ($pythonInfo.executable.StartsWith($oldRuntimePath, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to use Python embedded in the old RVC installation."
    }
    $script:basePython = $pythonInfo.executable
    Write-Host "Base interpreter: $basePython"
}

if (Test-Path $venvPath) {
    if (-not (Test-Path $pythonPath)) {
        throw "Found an incomplete isolated environment at $venvPath; inspect it before repair."
    }
    if (Test-Path $markerPath) {
        $oldBackend = (Get-Content -Raw $markerPath).Trim()
        if ($oldBackend -ne $Backend) {
            throw "This venv was configured for $oldBackend. Use a separate runtime folder for $Backend."
        }
    }
} else {
    Invoke-Checked "Create the isolated Python 3.12 environment" {
        & $basePython -m venv $venvPath
    }
}

Invoke-Checked "Verify isolated Python version, architecture, and site isolation" {
    & $pythonPath -c "import struct,sys; assert sys.version_info[:3] == (3,12,10); assert struct.calcsize('P') == 8; assert sys.prefix != sys.base_prefix; print('version:',sys.version); print('executable:',sys.executable); print('prefix:',sys.prefix); print('base_prefix:',sys.base_prefix); print('bits:',struct.calcsize('P')*8)"
    if ($LASTEXITCODE -ne 0) {
        throw "The .venv is not isolated on official Python 3.12.10 x64."
    }
    $venvConfiguration = Get-Content -LiteralPath (Join-Path $venvPath "pyvenv.cfg") -Raw
    if ($venvConfiguration -notmatch '(?im)^include-system-site-packages\s*=\s*false\s*$') {
        throw "The .venv must not include system site-packages."
    }
    & $pythonPath -m pip --version
    if ($LASTEXITCODE -ne 0) {
        throw "pip is unavailable in the isolated .venv."
    }
}

if (Test-Path $sourcePath) {
    $existingHead = (& git -C $sourcePath rev-parse HEAD 2>$null).Trim()
    if ($LASTEXITCODE -ne 0 -or $existingHead -ne $runtimeCommit) {
        throw "Refusing to reuse $sourcePath because it is not the pinned clean checkout."
    }
} else {
    New-Item -ItemType Directory -Path $sourcePath | Out-Null
    Invoke-Checked "Initialize isolated RVC source checkout" {
        git -C $sourcePath init
    }
    Invoke-Checked "Add official RVC origin" {
        git -C $sourcePath remote add origin $runtimeUrl
    }
    Invoke-Checked "Fetch only the pinned upstream commit" {
        git -C $sourcePath fetch --depth 1 origin $runtimeCommit
    }
    Invoke-Checked "Check out the pinned RVC commit" {
        git -C $sourcePath checkout --detach FETCH_HEAD
    }
}

$actualHead = (& git -C $sourcePath rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $actualHead -ne $runtimeCommit) {
    throw "Pinned source verification failed: expected $runtimeCommit, got $actualHead."
}

Invoke-Checked "Apply reviewed restricted-loader hardening" {
    & $pythonPath (Join-Path $root "harden_runtime.py") --runtime-path $sourcePath
}

Set-Content -LiteralPath $markerPath -Value $Backend -Encoding Ascii

if ($InstallDependencies) {
    $inferenceRequirements = Join-Path $root "requirements.inference-py312.txt"
    if (-not (Test-Path $inferenceRequirements)) {
        throw "The reviewed minimal inference requirements file is missing."
    }
    if ($Backend -eq "CUDA118") {
        $torchIndex = "https://download.pytorch.org/whl/cu118"
    } else {
        $torchIndex = "https://download.pytorch.org/whl/cpu"
    }
    if ($Backend -eq "CUDA118") {
        Invoke-Checked "Install pinned PyTorch CUDA 11.8 wheels" {
            & $pythonPath -m pip install `
                "torch==2.7.1+cu118" "torchaudio==2.7.1+cu118" `
                --only-binary=:all: --index-url $torchIndex `
                --extra-index-url "https://pypi.org/simple" `
                --disable-pip-version-check --no-input
        }
    } else {
        Invoke-Checked "Install pinned CPU PyTorch wheels" {
            & $pythonPath -m pip install `
                "torch==2.4.1+cpu" "torchaudio==2.4.1+cpu" `
                --only-binary=:all: --index-url $torchIndex `
                --extra-index-url "https://pypi.org/simple" `
                --disable-pip-version-check --no-input
        }
    }

    $lockPath = Join-Path $root "requirements.resolved.txt"
    if (Test-Path $lockPath) {
        Invoke-Checked "Restore the previously resolved isolated dependencies" {
            & $pythonPath -m pip install -r $lockPath `
                --only-binary=:all: --index-url "https://pypi.org/simple" `
                --extra-index-url $torchIndex --disable-pip-version-check --no-input
        }
    } else {
        Invoke-Checked "Install only direct RVC inference dependencies" {
            & $pythonPath -m pip install -r $inferenceRequirements `
                --only-binary=:all: --index-url "https://pypi.org/simple" `
                --disable-pip-version-check --no-input
        }
        Invoke-Checked "Record resolved package versions for repeat installs" {
            $packages = & $pythonPath -m pip freeze --all
            if ($LASTEXITCODE -ne 0) {
                throw "pip freeze failed with exit code $LASTEXITCODE."
            }
            Set-Content -LiteralPath $lockPath -Value $packages -Encoding Ascii
        }
    }
    Invoke-Checked "Validate dependency consistency" {
        & $pythonPath -m pip check
    }
    Invoke-Checked "Record PyTorch and CUDA availability" {
        & $pythonPath -c "import torch,torchaudio; print('torch:',torch.__version__); print('torchaudio:',torchaudio.__version__); print('cuda:',torch.version.cuda); available=torch.cuda.is_available(); print('cuda available:',available); print('gpu:',torch.cuda.get_device_name(0) if available else 'not available')"
    }
    Invoke-Checked "Import core audio and signal dependencies" {
        & $pythonPath -c "import importlib.metadata as m; import av,faiss,ffmpeg,librosa,numpy,parselmouth,scipy,soundfile; print('av:',av.__version__); print('faiss-cpu:',m.version('faiss-cpu')); print('librosa:',librosa.__version__); print('numpy:',numpy.__version__); print('parselmouth:',parselmouth.__version__); print('scipy:',scipy.__version__); print('soundfile:',soundfile.__version__)"
    }
    Invoke-Checked "Import local model and asset tooling dependencies" {
        & $pythonPath -c "import huggingface_hub,transformers; print('huggingface_hub:',huggingface_hub.__version__); print('transformers:',transformers.__version__)"
    }
    Invoke-Checked "Test pinned RVC CLI help without loading a checkpoint" {
        & $pythonPath (Join-Path $sourcePath "infer\cli.py") --help
    }
    Invoke-Checked "Validate restricted loader patches after installation" {
        & $pythonPath (Join-Path $root "harden_runtime.py") --runtime-path $sourcePath
    }
}

Write-Host "Pinned runtime source ready at: $sourcePath"
Write-Host "Dedicated environment: $venvPath"
Write-Host "Backend profile: $Backend"
if (-not $InstallDependencies) {
    Write-Host "Dependencies were not installed. Rerun with -InstallDependencies after reviewing the pinned requirements."
}
Write-Host "No voice checkpoint was downloaded or loaded."
