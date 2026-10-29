from __future__ import annotations

import argparse
import hashlib
import shutil
import sys
from pathlib import Path


REPOSITORY = "lj1995/VoiceConversionWebUI"
REVISION = "e6d0c1a17da07c33557852f9dfa2bd44cc75737d"
ASSETS = {
    "hubert_base/config.json": {
        "target": "hubert_base/config.json",
        "kind": "git-blob-sha1",
        "digest": "6f40f9bd2481c05c03d59f2b36f016fedc386187",
    },
    "hubert_base/preprocessor_config.json": {
        "target": "hubert_base/preprocessor_config.json",
        "kind": "git-blob-sha1",
        "digest": "3cb012fae1b439d92a815fec1c09fa0ce19fd6bf",
    },
    "hubert_base/pytorch_model.bin": {
        "target": "hubert_base/pytorch_model.bin",
        "kind": "sha256",
        "digest": "cc8c20f4b90a520757260197a3ff2505705a7adbd20ad9eeaa4e1a9b38442ef5",
    },
    "rmvpe.pt": {
        "target": "rmvpe/rmvpe.pt",
        "kind": "sha256",
        "digest": "6d62215f4306e3ca278246188607209f09af3dc77ed4232efdd069798c4ec193",
    },
}


def digest(path: Path, kind: str) -> str:
    if kind == "sha256":
        hasher = hashlib.sha256()
        with path.open("rb") as source:
            for block in iter(lambda: source.read(1024 * 1024), b""):
                hasher.update(block)
        return hasher.hexdigest()
    if kind == "git-blob-sha1":
        hasher = hashlib.sha1()
        size = path.stat().st_size
        hasher.update(f"blob {size}\0".encode("ascii"))
        with path.open("rb") as source:
            for block in iter(lambda: source.read(1024 * 1024), b""):
                hasher.update(block)
        return hasher.hexdigest()
    raise ValueError(f"Unsupported digest kind: {kind}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Download and verify only the pinned HuBERT/RMVPE assets."
    )
    parser.add_argument("--runtime-path", required=True, type=Path)
    parser.add_argument("--include-rmvpe", action="store_true")
    args = parser.parse_args()

    runtime = args.runtime_path.resolve(strict=True)
    asset_root = runtime / "assets"
    selected = dict(ASSETS)
    if not args.include_rmvpe:
        selected.pop("rmvpe.pt")

    try:
        from huggingface_hub import hf_hub_download
    except ImportError as error:
        raise RuntimeError(
            "Install the pinned RVC dependencies before fetching auxiliary assets."
        ) from error

    for relative_path, expected in selected.items():
        target = asset_root / expected["target"]
        if target.is_file():
            actual = digest(target, expected["kind"])
            if actual != expected["digest"]:
                raise RuntimeError(
                    f"Existing asset hash mismatch at {target}; refusing to overwrite."
                )
            print(f"Verified existing asset: {relative_path}")
            continue

        legacy_local_path = asset_root / relative_path
        if (
            legacy_local_path.is_file()
            and digest(legacy_local_path, expected["kind"]) == expected["digest"]
        ):
            cached_path = legacy_local_path
        else:
            cached_path = Path(
                hf_hub_download(
                    repo_id=REPOSITORY,
                    filename=relative_path,
                    revision=REVISION,
                )
            )
        actual = digest(cached_path, expected["kind"])
        if actual != expected["digest"]:
            raise RuntimeError(
                f"Downloaded {relative_path} has {expected['kind']} {actual}; "
                f"expected {expected['digest']}."
            )

        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_suffix(target.suffix + ".download")
        try:
            shutil.copyfile(cached_path, temporary)
            temporary.replace(target)
        finally:
            if temporary.exists():
                temporary.unlink()
        print(f"Downloaded and verified: {relative_path} ({expected['kind']} {actual})")

    print(
        "These assets are auxiliary models; this script does not load them or "
        "download a voice checkpoint."
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"Asset preparation failed: {error}", file=sys.stderr)
        raise SystemExit(1)
