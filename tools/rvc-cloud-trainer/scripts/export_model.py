from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export a validated Kaggle checkpoint into a HYRON-ready package.")
    parser.add_argument("--checkpoint", required=True, type=Path, help="Validated .pth checkpoint")
    parser.add_argument("--config", required=True, type=Path, help="Model config JSON file")
    parser.add_argument("--manifest", required=True, type=Path, help="Manifest JSON describing input dataset")
    parser.add_argument("--output-dir", required=True, type=Path, help="Directory where the export package is written")
    parser.add_argument("--runtime-name", default="RVC-Project/Retrieval-based-Voice-Conversion-WebUI", help="Upstream runtime name")
    parser.add_argument("--runtime-commit", default="81eed5e8f68b6bed1789f682fe78cdd324495afc", help="Runtime commit pinned for training")
    return parser.parse_args()


def export_package(
    checkpoint: Path,
    config: Path,
    manifest: Path,
    output_dir: Path,
    runtime_name: str,
    runtime_commit: str,
) -> dict:
    if not checkpoint.exists():
        raise FileNotFoundError(checkpoint)
    if not config.exists():
        raise FileNotFoundError(config)
    if not manifest.exists():
        raise FileNotFoundError(manifest)

    output_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_destination = output_dir / checkpoint.name
    config_destination = output_dir / config.name
    shutil.copy2(checkpoint, checkpoint_destination)
    shutil.copy2(config, config_destination)

    metadata = {
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "runtime_name": runtime_name,
        "runtime_commit": runtime_commit,
        "checkpoint_path": str(checkpoint_destination),
        "checkpoint_sha256": sha256_file(checkpoint_destination),
        "config_path": str(config_destination),
        "config_sha256": sha256_file(config_destination),
        "manifest_path": str(manifest),
        "manifest_sha256": sha256_file(manifest),
        "export_version": "0.5.12",
        "notes": [
            "Checkpoint produced in a Kaggle session must be reviewed before use in the local HYRON runtime.",
            "Restricted torch.load(..., weights_only=True) must remain enabled during verification.",
            "No original recordings are included in the export package by default.",
        ],
    }
    metadata_path = output_dir / "export-metadata.json"
    metadata_path.write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    export_manifest = {
        "export": metadata,
        "dataset_manifest": json.loads(manifest.read_text(encoding="utf-8")),
    }
    package_manifest = output_dir / "export-manifest.json"
    package_manifest.write_text(json.dumps(export_manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return export_manifest


def main() -> int:
    args = parse_args()
    try:
        result = export_package(
            args.checkpoint,
            args.config,
            args.manifest,
            args.output_dir,
            args.runtime_name,
            args.runtime_commit,
        )
        print(json.dumps(result["export"], indent=2, ensure_ascii=False))
        return 0
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
