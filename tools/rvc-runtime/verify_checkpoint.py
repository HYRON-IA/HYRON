from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import torch


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def verify(path: Path) -> dict:
    checkpoint = torch.load(str(path), map_location="cpu", weights_only=True)
    if not isinstance(checkpoint, dict):
        raise ValueError("Restricted loader returned a non-dictionary checkpoint.")
    weights = checkpoint.get("weight")
    if not isinstance(weights, dict) or not weights:
        raise ValueError("Checkpoint has no non-empty 'weight' state dictionary.")
    if not all(isinstance(key, str) and isinstance(value, torch.Tensor) for key, value in weights.items()):
        raise ValueError("Checkpoint weights must map string keys to tensors only.")
    config = checkpoint.get("config")
    if not isinstance(config, (list, tuple)) or len(config) < 18:
        raise ValueError("Checkpoint config is missing or has an unsupported shape.")
    if checkpoint.get("f0") != 1 or checkpoint.get("version") not in {"v1", "v2"}:
        raise ValueError("Only an RVC pitch-guided v1/v2 inference checkpoint is accepted.")
    if checkpoint.get("sr") not in {"32k", "40k", "48k"}:
        raise ValueError(f"Unsupported checkpoint sample rate: {checkpoint.get('sr')!r}")
    embedding = weights.get("emb_g.weight")
    if not isinstance(embedding, torch.Tensor) or embedding.ndim != 2:
        raise ValueError("Checkpoint speaker embedding is invalid.")
    return {
        "sha256": sha256_file(path),
        "size_bytes": path.stat().st_size,
        "format": "PyTorch weights-only checkpoint",
        "weights_only": True,
        "version": checkpoint["version"],
        "sample_rate": checkpoint["sr"],
        "f0_guided": True,
        "tensor_count": len(weights),
        "speaker_count": int(embedding.shape[0]),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify a local RVC checkpoint in restricted mode.")
    parser.add_argument("--checkpoint", required=True, type=Path)
    args = parser.parse_args()
    path = args.checkpoint.resolve(strict=True)
    if path.suffix.lower() != ".pth":
        parser.error("Checkpoint must have a .pth extension.")
    print(json.dumps(verify(path), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"Checkpoint restricted-load verification failed: {error}", file=sys.stderr)
        raise SystemExit(1)
