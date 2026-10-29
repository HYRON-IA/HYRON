from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    import av
except ModuleNotFoundError:  # pragma: no cover - optional in local validation
    av = None

try:
    import numpy as np
except ModuleNotFoundError:  # pragma: no cover - optional in local validation
    np = None

try:
    import soundfile as sf
except ModuleNotFoundError:  # pragma: no cover - optional in local validation
    sf = None

SUPPORTED_SUFFIXES = {
    ".aac",
    ".aif",
    ".aiff",
    ".flac",
    ".m4a",
    ".mka",
    ".mkv",
    ".mov",
    ".mp3",
    ".mp4",
    ".oga",
    ".ogg",
    ".opus",
    ".wav",
    ".webm",
    ".wma",
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def decode_mono(path: Path, target_rate: int) -> np.ndarray:
    if np is None:
        raise RuntimeError("numpy is required to normalize and segment audio")
    if av is None:
        raise RuntimeError("av is required to decode audio; install av in the Kaggle environment or the target runtime")
    if sf is None:
        raise RuntimeError("soundfile is required to write normalized WAV segments")
    chunks: list[np.ndarray] = []
    with av.open(str(path), mode="r") as container:
        audio_streams = [stream for stream in container.streams if stream.type == "audio"]
        if len(audio_streams) != 1:
            raise ValueError(f"expected one audio stream, found {len(audio_streams)}")
        stream = audio_streams[0]
        source_rate = stream.codec_context.sample_rate
        if not source_rate or source_rate <= 0:
            raise ValueError("audio stream has no valid sample rate")
        resampler = av.AudioResampler(format="fltp", layout="mono", rate=target_rate)
        for frame in container.decode(stream):
            for converted in resampler.resample(frame):
                data = np.asarray(converted.to_ndarray(), dtype=np.float32).reshape(-1)
                if data.size:
                    chunks.append(data)
        for converted in resampler.resample(None):
            data = np.asarray(converted.to_ndarray(), dtype=np.float32).reshape(-1)
            if data.size:
                chunks.append(data)
    if not chunks:
        raise ValueError("decoder produced no audio samples")
    audio = np.concatenate(chunks)
    if not np.isfinite(audio).all():
        raise ValueError("decoded audio contains NaN or infinity")
    peak = float(np.max(np.abs(audio)))
    if peak > 1.001:
        raise ValueError(f"audio exceeds full scale ({peak:.4f}); refusing implicit clipping")
    return audio.astype(np.float32)


def active_regions(
    audio: np.ndarray,
    sample_rate: int,
    threshold_dbfs: float,
    silence_seconds: float,
    padding_seconds: float,
    minimum_seconds: float,
) -> list[tuple[int, int]]:
    window = max(1, round(sample_rate * 0.02))
    frame_count = (audio.size + window - 1) // window
    rms = np.zeros(frame_count, dtype=np.float32)
    for index in range(frame_count):
        frame = audio[index * window : min((index + 1) * window, audio.size)]
        rms[index] = np.sqrt(np.mean(np.square(frame), dtype=np.float64))
    active = rms >= 10 ** (threshold_dbfs / 20)
    if not np.any(active):
        return []

    silence_frames = max(1, math.ceil(silence_seconds * sample_rate / window))
    padding = round(padding_seconds * sample_rate)
    minimum = round(minimum_seconds * sample_rate)
    active_indices = np.flatnonzero(active)
    splits = np.flatnonzero(np.diff(active_indices) > silence_frames) + 1
    groups = np.split(active_indices, splits)
    regions: list[tuple[int, int]] = []
    for group in groups:
        start = max(0, int(group[0]) * window - padding)
        end = min(audio.size, (int(group[-1]) + 1) * window + padding)
        if end - start >= minimum:
            regions.append((start, end))
    return regions


def safe_stem(path: Path) -> str:
    stem = re.sub(r"[^A-Za-z0-9_-]+", "-", path.stem).strip("-_")[:48]
    return stem or "recording"


def prepare_dataset(
    source: Path,
    output: Path,
    report: Path,
    authorization_evidence: str,
    target_rate: int,
    threshold_dbfs: float,
    silence_seconds: float,
    padding_seconds: float,
    minimum_seconds: float,
) -> dict:
    source = source.resolve(strict=True)
    output = output.resolve()
    report = report.resolve()
    if not source.is_dir():
        raise ValueError(f"source is not a directory: {source}")
    if output.exists() and any(path.name != ".gitkeep" for path in output.iterdir()):
        raise FileExistsError(f"output directory is not empty: {output}")
    if report.exists():
        raise FileExistsError(f"refusing to overwrite report: {report}")
    if not authorization_evidence.strip():
        raise ValueError("authorization evidence is required")

    files = sorted(
        path
        for path in source.rglob("*")
        if path.is_file() and path.suffix.lower() in SUPPORTED_SUFFIXES
    )
    if not files:
        raise ValueError(f"no supported audio files found under {source}")

    output.mkdir(parents=True, exist_ok=True)
    successful_files: list[dict] = []
    rejected_files: list[dict] = []

    for path in files:
        entry = {
            "source_name": path.relative_to(source).as_posix(),
            "source_sha256": sha256_file(path),
        }
        try:
            audio = decode_mono(path, target_rate)
            regions = active_regions(
                audio,
                target_rate,
                threshold_dbfs,
                silence_seconds,
                padding_seconds,
                minimum_seconds,
            )
            if not regions:
                raise ValueError("no speech segments met the activity/minimum-duration thresholds")

            source_key = hashlib.sha256(
                path.relative_to(source).as_posix().encode("utf-8")
            ).hexdigest()[:8]
            written: list[Path] = []
            segments: list[dict] = []
            try:
                for index, (start, end) in enumerate(regions, start=1):
                    segment = audio[start:end]
                    filename = f"{safe_stem(path)}-{source_key}-{index:03d}.wav"
                    destination = output / filename
                    temporary = destination.with_name(destination.name + ".partial")
                    if destination.exists() or temporary.exists():
                        raise FileExistsError(f"refusing to overwrite prepared segment: {destination}")
                    sf.write(str(temporary), segment, target_rate, format="WAV", subtype="PCM_16")
                    info = sf.info(str(temporary))
                    temporary.replace(destination)
                    written.append(destination)
                    segments.append(
                        {
                            "path": filename,
                            "sha256": sha256_file(destination),
                            "sample_rate": info.samplerate,
                            "channels": info.channels,
                            "frames": info.frames,
                            "duration_seconds": info.duration,
                        }
                    )
            except Exception:
                for created in written:
                    created.unlink(missing_ok=True)
                raise

            entry["segments"] = segments
            successful_files.append(entry)
            print(f"Prepared {path.name}: {len(segments)} segment(s)")
        except Exception as error:  # pragma: no cover - CLI diagnostic path
            entry["error"] = f"{type(error).__name__}: {error}"
            rejected_files.append(entry)
            print(f"Rejected {path.name}: {entry['error']}", file=sys.stderr)

    if not successful_files:
        raise RuntimeError(
            f"no usable recordings prepared; {len(rejected_files)} file(s) rejected"
        )

    manifest = {
        "schema": 1,
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "source_directory": str(source),
        "output_directory": str(output),
        "authorization_evidence": authorization_evidence.strip(),
        "operator_attestation": (
            "Operator attests that source recordings are self-owned or explicitly "
            "authorized; this script cannot verify consent."
        ),
        "target_sample_rate": target_rate,
        "channels": 1,
        "format": "WAV PCM16",
        "silence_threshold_dbfs": threshold_dbfs,
        "silence_seconds": silence_seconds,
        "padding_seconds": padding_seconds,
        "minimum_segment_seconds": minimum_seconds,
        "files": successful_files,
        "rejected_files": rejected_files,
    }
    report.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return manifest


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Prepare a Kaggle-ready RVC dataset from authorized recordings.")
    parser.add_argument("--input-dir", required=True, type=Path, help="Folder containing original recordings")
    parser.add_argument("--output-dir", required=True, type=Path, help="Directory for normalized WAV segments")
    parser.add_argument("--report", required=True, type=Path, help="JSON report path")
    parser.add_argument("--authorization-evidence", required=True, help="Operator declaration of source ownership or authorization")
    parser.add_argument("--target-rate", type=int, default=40000, help="Target sample rate (default: 40000)")
    parser.add_argument("--threshold-dbfs", type=float, default=-35.0, help="Voice activity threshold in dBFS")
    parser.add_argument("--silence-seconds", type=float, default=0.6, help="Silence gap for segment splitting")
    parser.add_argument("--padding-seconds", type=float, default=0.15, help="Padding around active speech regions")
    parser.add_argument("--minimum-seconds", type=float, default=0.45, help="Minimum segment duration")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        prepare_dataset(
            args.input_dir,
            args.output_dir,
            args.report,
            args.authorization_evidence,
            args.target_rate,
            args.threshold_dbfs,
            args.silence_seconds,
            args.padding_seconds,
            args.minimum_seconds,
        )
        print(f"Dataset preparation succeeded. Report: {args.report}")
        return 0
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
