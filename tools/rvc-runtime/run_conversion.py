from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
import wave
from datetime import datetime, timezone
from pathlib import Path

from harden_runtime import check_commit, verify_expected_worktree


EXPECTED_COMMIT = "81eed5e8f68b6bed1789f682fe78cdd324495afc"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def inspect_wav(path: Path) -> dict[str, int | str]:
    with wave.open(str(path), "rb") as audio:
        if audio.getcomptype() != "NONE":
            raise ValueError(f"Expected uncompressed PCM WAV: {path}")
        frames = audio.getnframes()
        rate = audio.getframerate()
        channels = audio.getnchannels()
        width = audio.getsampwidth()
        if frames <= 0 or rate < 16000 or channels not in (1, 2) or width not in (2, 3, 4):
            raise ValueError(f"Invalid PCM WAV parameters in {path}")
        return {
            "sample_rate": rate,
            "channels": channels,
            "sample_width_bytes": width,
            "frames": frames,
        }


def verify_hardened_runtime(runtime: Path) -> None:
    check_commit(runtime)
    verify_expected_worktree(runtime)

    required_loaders = {
        "infer/cli.py": 'torch.load(str(model_path), map_location="cpu", weights_only=True)',
        "infer/vc/modules.py": 'torch.load(person, map_location="cpu", weights_only=True)',
        "infer/rtrvc.py": (
            'torch.load(pth_path, map_location=torch.device("cpu"), '
            "weights_only=True)"
        ),
        "infer/rmvpe.py": 'torch.load(model_path, map_location="cpu", weights_only=True)',
    }
    for relative, call in required_loaders.items():
        if call not in (runtime / relative).read_text(encoding="utf-8"):
            raise RuntimeError(f"Restricted loader patch missing from {relative}")

    for source_path in (runtime / "infer").rglob("*.py"):
        for line_number, line in enumerate(
            source_path.read_text(encoding="utf-8").splitlines(), start=1
        ):
            if "torch.load(" in line and "weights_only=True" not in line:
                raise RuntimeError(
                    f"Unrestricted torch.load at "
                    f"{source_path.relative_to(runtime)}:{line_number}"
                )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runtime-path", required=True, type=Path)
    parser.add_argument("--input-wav", required=True, type=Path)
    parser.add_argument("--model-pth", required=True, type=Path)
    parser.add_argument("--output-wav", required=True, type=Path)
    parser.add_argument("--report-path", required=True, type=Path)
    parser.add_argument("--model-source", required=True)
    parser.add_argument("--model-license", required=True)
    parser.add_argument("--authorization-evidence", required=True)
    parser.add_argument("--speaker-id", required=True, type=int)
    parser.add_argument("--pitch", required=True, type=int)
    parser.add_argument("--f0-method", required=True, choices=("pm", "rmvpe"))
    args = parser.parse_args()

    os.environ["TORCH_FORCE_WEIGHTS_ONLY_LOAD"] = "1"
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"

    runtime = args.runtime_path.resolve(strict=True)
    input_wav = args.input_wav.resolve(strict=True)
    model_pth = args.model_pth.resolve(strict=True)
    output_wav = args.output_wav.resolve()
    report_path = args.report_path.resolve()
    if Path(sys.executable).resolve() != (runtime.parent / ".venv" / "Scripts" / "python.exe").resolve():
        raise RuntimeError("Use the isolated tools/rvc-runtime/.venv Python interpreter.")
    if model_pth.suffix.lower() != ".pth":
        raise ValueError("The supplied model must be an RVC .pth checkpoint.")
    if output_wav.exists():
        raise FileExistsError(f"Refusing to overwrite output: {output_wav}")
    if input_wav == output_wav or model_pth == output_wav:
        raise ValueError("Input, model, and output must be distinct files.")
    if not args.model_source.strip() or not args.model_license.strip():
        raise ValueError("Model source and license evidence must be provided.")
    if not args.authorization_evidence.strip():
        raise ValueError("Consent/authorization evidence must be provided.")
    if not (runtime / "assets" / "hubert_base" / "config.json").is_file():
        raise FileNotFoundError("Pinned local assets/hubert_base files are missing.")
    if args.f0_method == "rmvpe" and not (runtime / "assets" / "rmvpe" / "rmvpe.pt").is_file():
        raise FileNotFoundError("Pinned local assets/rmvpe/rmvpe.pt is missing.")

    verify_hardened_runtime(runtime)
    input_info = inspect_wav(input_wav)
    model_hash = sha256_file(model_pth)
    input_hash = sha256_file(input_wav)

    import torch

    torch_version = torch.__version__
    cuda_version = torch.version.cuda
    cuda_available = torch.cuda.is_available()
    gpu_name = torch.cuda.get_device_name(0) if cuda_available else None

    output_wav.parent.mkdir(parents=True, exist_ok=True)
    log_path = output_wav.with_suffix(output_wav.suffix + ".rvc.log")
    command = [
        sys.executable,
        "-m",
        "infer.cli",
        "--model",
        str(model_pth),
        "--input",
        str(input_wav),
        "--output",
        str(output_wav),
        "--speaker-id",
        str(args.speaker_id),
        "--pitch",
        str(args.pitch),
        "--f0-method",
        args.f0_method,
        "--index-rate",
        "0",
    ]
    started = time.perf_counter()
    result = subprocess.run(
        command,
        cwd=runtime,
        env=os.environ.copy(),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    elapsed_seconds = time.perf_counter() - started
    log_path.write_text(
        result.stdout + ("\n--- STDERR ---\n" + result.stderr if result.stderr else ""),
        encoding="utf-8",
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"RVC CLI failed with exit code {result.returncode}; inspect {log_path}."
        )
    if not output_wav.is_file() or output_wav.stat().st_size <= 44:
        raise RuntimeError("RVC CLI succeeded but did not produce a non-empty WAV.")

    output_info = inspect_wav(output_wav)
    output_hash = sha256_file(output_wav)
    if input_hash == output_hash:
        raise RuntimeError(
            "Output SHA-256 equals input SHA-256; refusing to report a conversion."
        )
    if str(output_wav) not in result.stdout:
        raise RuntimeError(
            "The pinned CLI did not report writing the requested output path."
        )

    # CLI success, its reported destination, and a distinct validated WAV are
    # retained as evidence that the RVC path ran rather than copying the input.
    report = {
        "status": "inference_succeeded",
        "recorded_at_utc": datetime.now(timezone.utc).isoformat(),
        "runtime_repository": "https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI",
        "runtime_commit": EXPECTED_COMMIT,
        "runtime_license": "MIT",
        "restricted_torch_load": True,
        "torch_force_weights_only_load": os.environ["TORCH_FORCE_WEIGHTS_ONLY_LOAD"],
        "faiss_index_rate": 0,
        "torch_version": torch_version,
        "cuda_version": cuda_version,
        "cuda_available": cuda_available,
        "gpu_name": gpu_name,
        "input": {
            "path": str(input_wav),
            "sha256": input_hash,
            "bytes": input_wav.stat().st_size,
            **input_info,
        },
        "model": {
            "path": str(model_pth),
            "sha256": model_hash,
            "bytes": model_pth.stat().st_size,
            "source": args.model_source,
            "license": args.model_license,
            "authorization_evidence": args.authorization_evidence,
        },
        "output": {
            "path": str(output_wav),
            "sha256": output_hash,
            "bytes": output_wav.stat().st_size,
            **output_info,
        },
        "inference_seconds": round(elapsed_seconds, 3),
        "cli_exit_code": result.returncode,
        "cli_reported_output_path": str(output_wav) in result.stdout,
        "cli_log": str(log_path),
        "parameters": {
            "speaker_id": args.speaker_id,
            "pitch_semitones": args.pitch,
            "f0_method": args.f0_method,
        },
        "limitations": [
            "A distinct output hash and successful pinned CLI execution are recorded; this is not a perceptual quality assessment.",
            "The process is not an OS sandbox. Run only checkpoints whose origin and use authorization are verified.",
        ],
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"RVC test failed: {error}", file=sys.stderr)
        raise SystemExit(1)
