from __future__ import annotations

import argparse
import ctypes
import hashlib
import importlib.util
import json
import os
import queue
import re
import shutil
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path


EXPECTED_COMMIT = "81eed5e8f68b6bed1789f682fe78cdd324495afc"
CONFIRMATION = "I_AUTHORIZE_HYRON_RVC_TRAINING"
TARGET_RATE = 40000
VERSION = "v1"


class MemoryStatus(ctypes.Structure):
    _fields_ = [
        ("dwLength", ctypes.c_ulong),
        ("dwMemoryLoad", ctypes.c_ulong),
        ("ullTotalPhys", ctypes.c_ulonglong),
        ("ullAvailPhys", ctypes.c_ulonglong),
        ("ullTotalPageFile", ctypes.c_ulonglong),
        ("ullAvailPageFile", ctypes.c_ulonglong),
        ("ullTotalVirtual", ctypes.c_ulonglong),
        ("ullAvailVirtual", ctypes.c_ulonglong),
        ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
    ]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def free_ram_gib() -> float:
    status = MemoryStatus()
    status.dwLength = ctypes.sizeof(status)
    if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
        raise OSError("GlobalMemoryStatusEx failed; refusing to start training.")
    return status.ullAvailPhys / (1024**3)


def gpu_snapshot() -> dict:
    result = subprocess.run(
        [
            "nvidia-smi",
            "--query-gpu=name,memory.free,memory.used,utilization.gpu",
            "--format=csv,noheader,nounits",
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=10,
    )
    rows = [line.split(",") for line in result.stdout.splitlines() if line.strip()]
    if len(rows) != 1 or len(rows[0]) != 4:
        raise RuntimeError("Expected exactly one visible NVIDIA GPU in nvidia-smi.")
    name, free_mib, used_mib, utilization = (value.strip() for value in rows[0])
    return {
        "name": name,
        "free_vram_gib": int(free_mib) / 1024,
        "used_vram_gib": int(used_mib) / 1024,
        "gpu_utilization_percent": int(utilization),
    }


def snapshot() -> dict:
    return {
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "free_ram_gib": free_ram_gib(),
        **gpu_snapshot(),
    }


def validate_dataset(dataset: Path, manifest_path: Path, authorization: str) -> dict:
    dataset = dataset.resolve(strict=True)
    manifest_path = manifest_path.resolve(strict=True)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("schema") != 1:
        raise ValueError("Unsupported dataset manifest schema.")
    if manifest.get("authorization_evidence", "").strip() != authorization.strip():
        raise ValueError("Authorization evidence does not match the dataset manifest.")
    if manifest.get("target_sample_rate") != TARGET_RATE or manifest.get("channels") != 1:
        raise ValueError("The training pipeline requires mono 40 kHz prepared recordings.")
    if not manifest.get("successes"):
        raise ValueError("Dataset manifest contains no validated recordings.")

    expected_output = Path(manifest["output_directory"]).resolve(strict=True)
    if expected_output != dataset:
        raise ValueError("Dataset directory does not match the prepared manifest.")
    entries = []
    for source in manifest["successes"]:
        for segment in source["segments"]:
            relative = Path(segment["path"])
            if relative.is_absolute() or ".." in relative.parts:
                raise ValueError(f"Unsafe dataset path in manifest: {relative}")
            path = (dataset / relative).resolve(strict=True)
            if path.parent != dataset or not path.is_file():
                raise ValueError(f"Dataset segment must be a direct file: {relative}")
            if sha256_file(path) != segment["sha256"]:
                raise ValueError(f"Dataset segment hash mismatch: {relative}")
            import soundfile as sf

            info = sf.info(str(path))
            if info.samplerate != TARGET_RATE or info.channels != 1 or info.format != "WAV":
                raise ValueError(f"Invalid prepared WAV format: {relative}")
            entries.append({"path": str(path), "sha256": segment["sha256"]})
    expected_names = {Path(entry["path"]).name for entry in entries}
    actual_names = {path.name for path in dataset.iterdir() if path.is_file()}
    if actual_names != expected_names:
        raise ValueError(
            "Prepared dataset directory contains files not listed in its manifest."
        )
    if len(entries) < 3:
        raise ValueError("At least three reviewed speech segments are required for this training test.")
    return {
        "path": str(dataset),
        "manifest_path": str(manifest_path),
        "manifest_sha256": sha256_file(manifest_path),
        "segment_count": len(entries),
        "segments": entries,
    }


def check_runtime(runtime: Path) -> None:
    commit = subprocess.run(
        ["git", "-C", str(runtime), "rev-parse", "HEAD"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    if commit != EXPECTED_COMMIT:
        raise RuntimeError(f"Expected pinned RVC commit {EXPECTED_COMMIT}, found {commit}.")
    for path in (
        runtime / "assets" / "hubert_base" / "config.json",
        runtime / "assets" / "hubert_base" / "preprocessor_config.json",
        runtime / "assets" / "hubert_base" / "pytorch_model.bin",
        runtime / "assets" / "rmvpe" / "rmvpe.pt",
    ):
        if not path.is_file():
            raise FileNotFoundError(f"Verified auxiliary asset missing at expected path: {path}")


def check_dependencies() -> None:
    required = ("matplotlib", "tensorboard")
    missing = [name for name in required if importlib.util.find_spec(name) is None]
    if missing:
        raise RuntimeError(
            "Training dependencies are not installed in the isolated environment: "
            + ", ".join(missing)
            + ". Review requirements.training-extra.txt and authorize installation before continuing."
        )


def drain_output(pipe, lines: queue.Queue) -> None:
    try:
        for line in iter(pipe.readline, ""):
            lines.put(line)
    finally:
        pipe.close()


def run_stage(
    name: str,
    command: list[str],
    runtime: Path,
    environment: dict[str, str],
    log_path: Path,
    minimum_ram: float,
    minimum_vram: float,
    samples: list[dict],
) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    lines: queue.Queue[str | None] = queue.Queue()
    with log_path.open("a", encoding="utf-8") as log:
        log.write(f"\n[{datetime.now(timezone.utc).isoformat()}] START {name}\n")
        initial = snapshot()
        samples.append({"stage": name, **initial})
        if initial["free_ram_gib"] < minimum_ram or initial["free_vram_gib"] < minimum_vram:
            raise RuntimeError(
                f"Insufficient resources before {name}: {initial['free_ram_gib']:.2f} GiB RAM "
                f"and {initial['free_vram_gib']:.2f} GiB VRAM free."
            )
        process = subprocess.Popen(
            command,
            cwd=runtime,
            env=environment,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
            shell=False,
        )
        reader = threading.Thread(target=drain_output, args=(process.stdout, lines), daemon=True)
        reader.start()
        last_sample = 0.0
        while process.poll() is None or reader.is_alive() or not lines.empty():
            try:
                line = lines.get(timeout=0.25)
            except queue.Empty:
                line = None
            if line is not None:
                print(line, end="", flush=True)
                log.write(line)
                log.flush()
            if process.poll() is not None and reader.is_alive():
                reader.join(timeout=0.1)
            if process.poll() is None and time.monotonic() - last_sample >= 2:
                last_sample = time.monotonic()
                try:
                    current = snapshot()
                    samples.append({"stage": name, **current})
                    log.write("RESOURCE " + json.dumps(current) + "\n")
                    log.flush()
                    if current["free_ram_gib"] < minimum_ram or current["free_vram_gib"] < minimum_vram:
                        process.terminate()
                        process.wait(timeout=10)
                        raise RuntimeError(
                            f"Resource guard stopped {name}: free RAM "
                            f"{current['free_ram_gib']:.2f} GiB; free VRAM "
                            f"{current['free_vram_gib']:.2f} GiB."
                        )
                except KeyboardInterrupt:
                    process.terminate()
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait()
                    raise
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
                    raise RuntimeError(f"Could not stop {name} after resource guard triggered.")
                except Exception:
                    if process.poll() is None:
                        process.terminate()
                        try:
                            process.wait(timeout=10)
                        except subprocess.TimeoutExpired:
                            process.kill()
                            process.wait()
                    raise
        reader.join()
        code = process.wait()
        log.write(f"[{datetime.now(timezone.utc).isoformat()}] EXIT {name} {code}\n")
        if code:
            raise RuntimeError(f"Training stage {name} failed with exit code {code}; log: {log_path}")


def build_filelist(experiment: Path) -> int:
    gt = experiment / "0_gt_wavs"
    features = experiment / "3_feature256"
    f0 = experiment / "2a_f0"
    f0nsf = experiment / "2b-f0nsf"
    sets = [
        {path.stem for path in gt.glob("*.wav")},
        {path.stem for path in features.glob("*.npy")},
        {path.name.removesuffix(".wav.npy") for path in f0.glob("*.wav.npy")},
        {path.name.removesuffix(".wav.npy") for path in f0nsf.glob("*.wav.npy")},
    ]
    names = sorted(set.intersection(*sets))
    if not names:
        raise RuntimeError("No aligned waveform, HuBERT, and F0 feature files were produced.")
    rows = [
        "|".join(
            (
                str(gt / f"{name}.wav"),
                str(features / f"{name}.npy"),
                str(f0 / f"{name}.wav.npy"),
                str(f0nsf / f"{name}.wav.npy"),
                "0",
            )
        )
        for name in names
    ]
    destination = experiment / "filelist.txt"
    if destination.exists():
        raise FileExistsError(f"Refusing to overwrite training filelist: {destination}")
    destination.write_text("\n".join(rows) + "\n", encoding="utf-8")
    return len(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description="Conservatively train a local RVC v1/40k test model.")
    parser.add_argument("--runtime-path", required=True, type=Path)
    parser.add_argument(
        "--dataset-directory",
        type=Path,
        default=Path(__file__).resolve().parent
        / "datasets" / "hyron-test" / "prepared" / "recordings",
    )
    parser.add_argument(
        "--dataset-manifest",
        type=Path,
        default=Path(__file__).resolve().parent
        / "datasets" / "hyron-test" / "reports" / "dataset-manifest.json",
    )
    parser.add_argument("--authorization-evidence", required=True)
    parser.add_argument("--experiment-name", required=True)
    parser.add_argument("--batch-size", type=int, default=1, choices=(1, 2))
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--save-every-epoch", type=int, default=5)
    parser.add_argument("--dataloader-workers", type=int, default=0, choices=(0, 1))
    parser.add_argument("--prefetch-factor", type=int, default=1, choices=(1, 2))
    parser.add_argument("--minimum-free-ram-gib", type=float, default=3.5)
    parser.add_argument("--minimum-free-vram-gib", type=float, default=4.0)
    parser.add_argument("--confirm-training", required=True)
    args = parser.parse_args()
    if args.confirm_training != CONFIRMATION:
        parser.error("The explicit training confirmation token does not match.")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,47}", args.experiment_name):
        parser.error("Experiment name must be 1-48 safe ASCII letters, digits, '_' or '-'.")
    if args.epochs < 1 or args.epochs > 100 or args.save_every_epoch < 1:
        parser.error("Epochs must be 1-100 and save frequency must be positive.")
    if args.minimum_free_ram_gib <= 0 or args.minimum_free_vram_gib <= 0:
        parser.error("Free memory thresholds must be positive.")

    runtime = args.runtime_path.resolve(strict=True)
    check_runtime(runtime)
    dataset = validate_dataset(
        args.dataset_directory, args.dataset_manifest, args.authorization_evidence
    )
    check_dependencies()
    hardener = Path(__file__).resolve().with_name("harden_runtime.py")
    subprocess.run(
        [sys.executable, str(hardener), "--runtime-path", str(runtime)],
        check=True,
        cwd=runtime,
    )

    experiment = runtime / "logs" / args.experiment_name
    if experiment.exists():
        raise FileExistsError(f"Refusing to reuse/overwrite experiment directory: {experiment}")
    upstream_export = runtime / "assets" / "weights" / f"{args.experiment_name}.pth"
    if upstream_export.exists():
        raise FileExistsError(f"Refusing to overwrite existing checkpoint: {upstream_export}")
    model_directory = Path(__file__).resolve().parent / "models"
    model_directory.mkdir(parents=True, exist_ok=True)
    exported = model_directory / f"{args.experiment_name}.pth"
    if exported.exists():
        raise FileExistsError(f"Refusing to overwrite existing checkpoint: {exported}")

    environment = os.environ.copy()
    environment.update(
        {
            "TORCH_FORCE_WEIGHTS_ONLY_LOAD": "1",
            "HF_HUB_OFFLINE": "1",
            "TRANSFORMERS_OFFLINE": "1",
            "CUDA_VISIBLE_DEVICES": "0",
            "OPENBLAS_NUM_THREADS": "1",
            "OMP_NUM_THREADS": "1",
            "MKL_NUM_THREADS": "1",
            "RVC_TRAIN_NUM_WORKERS": str(args.dataloader_workers),
            "RVC_TRAIN_PREFETCH": str(args.prefetch_factor),
        }
    )
    if args.dataloader_workers == 0:
        environment["RVC_TRAIN_PREFETCH"] = "1"

    report_directory = Path(__file__).resolve().parent / "datasets" / "hyron-test" / "reports"
    report_directory.mkdir(parents=True, exist_ok=True)
    report_path = report_directory / f"{args.experiment_name}.training-report.json"
    log_path = report_directory / f"{args.experiment_name}.training.log"
    if report_path.exists() or log_path.exists():
        raise FileExistsError("Refusing to overwrite an existing training report or log.")
    experiment.mkdir(parents=True)
    shutil.copyfile(runtime / "configs" / "v1" / "40k.json", experiment / "config.json")
    samples: list[dict] = []
    started = time.monotonic()
    result = {
        "schema": 1,
        "started_utc": datetime.now(timezone.utc).isoformat(),
        "runtime_commit": EXPECTED_COMMIT,
        "dataset": dataset,
        "authorization_evidence": args.authorization_evidence.strip(),
        "training": {
            "version": VERSION,
            "sample_rate": TARGET_RATE,
            "batch_size": args.batch_size,
            "epochs": args.epochs,
            "save_every_epoch": args.save_every_epoch,
            "dataloader_workers": args.dataloader_workers,
            "prefetch_factor": args.prefetch_factor,
            "pretrained_generator": None,
            "pretrained_discriminator": None,
        },
        "logs": str(log_path),
        "resource_samples": samples,
        "status": "running",
    }
    try:
        steps = [
            (
                "preprocess",
                [
                    sys.executable, "train/preprocess.py", dataset["path"],
                    str(TARGET_RATE), "1", str(experiment), "True", "3.0",
                ],
            ),
            (
                "f0-rmvpe-cpu",
                [
                    sys.executable, "train/dataset/extract_f0.py",
                    "cpu", str(experiment), "1", "rmvpe",
                ],
            ),
            (
                "hubert-cuda",
                [
                    sys.executable, "train/dataset/extract_hubert_feature.py",
                    "cuda:0", "1", "0", str(experiment), VERSION, "False",
                ],
            ),
        ]
        for name, command in steps:
            run_stage(
                name, command, runtime, environment, log_path,
                args.minimum_free_ram_gib, args.minimum_free_vram_gib, samples,
            )

        aligned_segments = build_filelist(experiment)
        result["training"]["aligned_segments"] = aligned_segments
        train_command = [
            sys.executable, "train/train.py",
            "-e", args.experiment_name,
            "-sr", "40k",
            "-f0", "1",
            "-bs", str(args.batch_size),
            "-g", "0",
            "-te", str(args.epochs),
            "-se", str(args.save_every_epoch),
            "-l", "1",
            "-c", "0",
            "-sw", "0",
            "-v", VERSION,
        ]
        run_stage(
            "training", train_command, runtime, environment, log_path,
            args.minimum_free_ram_gib, args.minimum_free_vram_gib, samples,
        )
        if not upstream_export.is_file():
            raise FileNotFoundError(
                f"Training finished without exported checkpoint: {upstream_export}"
            )
        verify_command = [
            sys.executable,
            str(Path(__file__).resolve().with_name("verify_checkpoint.py")),
            "--checkpoint", str(upstream_export),
        ]
        verification = subprocess.run(
            verify_command, check=True, cwd=runtime, env=environment,
            capture_output=True, text=True, timeout=180,
        )
        verified = json.loads(verification.stdout)
        shutil.copyfile(upstream_export, exported)
        if sha256_file(exported) != verified["sha256"]:
            raise RuntimeError("Checkpoint hash changed while copying out of the upstream tree.")
        upstream_export.unlink()
        result["checkpoint"] = verified
        result["checkpoint"]["path"] = str(exported)
        result["status"] = "completed"
    except Exception as error:
        result["status"] = "failed"
        result["error"] = f"{type(error).__name__}: {error}"
        raise
    finally:
        result["duration_seconds"] = round(time.monotonic() - started, 3)
        result["completed_utc"] = datetime.now(timezone.utc).isoformat()
        report_path.write_text(
            json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        print(f"Training report: {report_path}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"RVC training pipeline stopped: {error}", file=sys.stderr)
        raise SystemExit(1)
