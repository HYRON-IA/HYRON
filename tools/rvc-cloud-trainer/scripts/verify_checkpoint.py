from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

try:
    import torch
except Exception:  # pragma: no cover - runtime dependency check
    torch = None


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def validate_checkpoint(path: Path) -> dict:
    if torch is None:
        raise RuntimeError("torch is required for checkpoint verification in the Kaggle runtime")
    if not path.exists():
        raise FileNotFoundError(f"checkpoint not found: {path}")
    if path.suffix.lower() != ".pth":
        raise ValueError(f"checkpoint must use .pth extension: {path}")

    try:
        loaded = torch.load(str(path), map_location="cpu", weights_only=True)
    except Exception as exc:
        raise RuntimeError(f"checkpoint is incompatible with restricted torch.load(..., weights_only=True): {exc}") from exc

    if not isinstance(loaded, dict):
        raise TypeError("checkpoint payload is not a dictionary-like object; unexpected format")

    allowed_keys = {"state_dict", "model", "config", "model_state_dict", "trainer", "metadata"}
    if not set(loaded.keys()) & allowed_keys:
        raise ValueError("checkpoint payload does not look like a supported RVC model bundle")

    return {
        "path": str(path),
        "sha256": sha256_file(path),
        "keys": sorted(loaded.keys()),
        "type": type(loaded).__name__,
        "strict_load_ok": True,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate a checkpoint using restricted loading semantics.")
    parser.add_argument("--checkpoint", required=True, type=Path, help="Path to the .pth checkpoint")
    parser.add_argument("--report", type=Path, default=None, help="Optional JSON report path")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        result = validate_checkpoint(args.checkpoint)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        if args.report:
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        return 0
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
