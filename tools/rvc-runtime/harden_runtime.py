from __future__ import annotations

import argparse
import ast
import hashlib
import subprocess
from pathlib import Path


EXPECTED_COMMIT = "81eed5e8f68b6bed1789f682fe78cdd324495afc"
LOAD_CALLS = {
    "infer/cli.py": (
        b'torch.load(str(model_path), map_location="cpu")',
        b'torch.load(str(model_path), map_location="cpu", weights_only=True)',
    ),
    "infer/vc/modules.py": (
        b'torch.load(person, map_location="cpu")',
        b'torch.load(person, map_location="cpu", weights_only=True)',
    ),
    "infer/rtrvc.py": (
        b'torch.load(pth_path, map_location=torch.device("cpu"))',
        b'torch.load(pth_path, map_location=torch.device("cpu"), weights_only=True)',
    ),
    "infer/rmvpe.py": (
        b'torch.load(model_path, map_location="cpu")',
        b'torch.load(model_path, map_location="cpu", weights_only=True)',
    ),
}
TRAIN_LOAD_CALLS = {
    "train/train.py": (
        (
            b'torch.load(path, map_location="cpu")["model"]',
            b'torch.load(path, map_location="cpu", weights_only=True)["model"]',
            1,
        ),
        (
            b'torch.load(hps.pretrainD, map_location="cpu")["model"]',
            b'torch.load(hps.pretrainD, map_location="cpu", weights_only=True)["model"]',
            2,
        ),
        (
            b"""    train_loader = DataLoader(
        train_dataset,
        num_workers=4,
        shuffle=False,
        pin_memory=True,
        collate_fn=collate_fn,
        batch_sampler=train_sampler,
        persistent_workers=True,
        prefetch_factor=8,
    )""",
            b"""    train_workers = max(0, int(os.environ.get("RVC_TRAIN_NUM_WORKERS", "1")))
    loader_options = {}
    if train_workers:
        loader_options["persistent_workers"] = True
        loader_options["prefetch_factor"] = max(
            1, int(os.environ.get("RVC_TRAIN_PREFETCH", "2"))
        )
    train_loader = DataLoader(
        train_dataset,
        num_workers=train_workers,
        shuffle=False,
        pin_memory=torch.cuda.is_available(),
        collate_fn=collate_fn,
        batch_sampler=train_sampler,
        **loader_options,
    )""",
            1,
        ),
    ),
    "train/utils.py": (
        (
            b'torch.load(checkpoint_path, map_location="cpu")',
            b'torch.load(checkpoint_path, map_location="cpu", weights_only=True)',
            2,
        ),
    ),
    "train/data_utils.py": (
        (
            b"torch.load(spec_filename)",
            b"torch.load(spec_filename, weights_only=True)",
            2,
        ),
    ),
    "train/process_ckpt.py": (
        (
            b'torch.load(path, map_location="cpu")',
            b'torch.load(path, map_location="cpu", weights_only=True)',
            3,
        ),
        (
            b'torch.load(path1, map_location="cpu")',
            b'torch.load(path1, map_location="cpu", weights_only=True)',
            1,
        ),
        (
            b'torch.load(path2, map_location="cpu")',
            b'torch.load(path2, map_location="cpu", weights_only=True)',
            1,
        ),
    ),
}
ASSET_HASHES = {
    "assets/hubert_base/config.json": (
        "git-blob-sha1",
        "6f40f9bd2481c05c03d59f2b36f016fedc386187",
    ),
    "assets/hubert_base/preprocessor_config.json": (
        "git-blob-sha1",
        "3cb012fae1b439d92a815fec1c09fa0ce19fd6bf",
    ),
    "assets/hubert_base/pytorch_model.bin": (
        "sha256",
        "cc8c20f4b90a520757260197a3ff2505705a7adbd20ad9eeaa4e1a9b38442ef5",
    ),
    "assets/rmvpe.pt": (
        "sha256",
        "6d62215f4306e3ca278246188607209f09af3dc77ed4232efdd069798c4ec193",
    ),
    "assets/rmvpe/rmvpe.pt": (
        "sha256",
        "6d62215f4306e3ca278246188607209f09af3dc77ed4232efdd069798c4ec193",
    ),
}


def patches_by_path() -> dict[str, tuple[tuple[bytes, bytes, int], ...]]:
    result = {
        path: ((original, restricted, 1),)
        for path, (original, restricted) in LOAD_CALLS.items()
    }
    for path, patches in TRAIN_LOAD_CALLS.items():
        result[path] = (*result.get(path, ()), *patches)
    return result


def digest(path: Path, kind: str) -> str:
    hasher = hashlib.sha256() if kind == "sha256" else hashlib.sha1()
    if kind == "git-blob-sha1":
        hasher.update(f"blob {path.stat().st_size}\0".encode("ascii"))
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(block)
    return hasher.hexdigest()


def check_commit(runtime: Path) -> None:
    result = subprocess.run(
        ["git", "-C", str(runtime), "rev-parse", "HEAD"],
        check=True,
        capture_output=True,
        text=True,
    )
    actual = result.stdout.strip()
    if actual != EXPECTED_COMMIT:
        raise RuntimeError(
            f"Unexpected RVC source revision {actual}; expected {EXPECTED_COMMIT}"
        )


def verify_expected_worktree(runtime: Path) -> None:
    result = subprocess.run(
        ["git", "-C", str(runtime), "status", "--porcelain", "--untracked-files=all"],
        check=True,
        capture_output=True,
        text=True,
    )
    patch_map = patches_by_path()
    expected_paths = set(patch_map)
    for status_line in result.stdout.splitlines():
        relative_path = status_line[3:].replace("\\", "/")
        is_approved_asset = status_line[:2] == "??" and (
            relative_path in ASSET_HASHES
            or relative_path.rstrip("/") in {"assets/hubert_base", "assets/rmvpe"}
        )
        if (status_line[:2] == "??" and not is_approved_asset) or (
            status_line[:2] != "??" and relative_path not in expected_paths
        ):
            raise RuntimeError(
                f"Unexpected unreviewed runtime worktree change: {status_line}"
            )

    for relative_path, patches in patch_map.items():
        committed = subprocess.run(
            ["git", "-C", str(runtime), "show", f"HEAD:{relative_path}"],
            check=True,
            capture_output=True,
        ).stdout
        expected = committed
        for original, restricted, count in patches:
            if expected.count(original) != count:
                raise RuntimeError(
                    f"Pinned upstream source differs from the reviewed patch in {relative_path}"
                )
            expected = expected.replace(original, restricted)
        working_copy = (runtime / relative_path).read_bytes()
        if working_copy.replace(b"\r\n", b"\n") != expected.replace(b"\r\n", b"\n"):
            raise RuntimeError(
                f"Unexpected local changes in reviewed source file {relative_path}"
            )

    allowed_asset_files = set(ASSET_HASHES)
    for relative in ("assets/hubert_base", "assets/rmvpe"):
        directory = runtime / relative
        if directory.exists():
            actual_files = {
                path.relative_to(runtime).as_posix()
                for path in directory.rglob("*")
                if path.is_file()
            }
            unexpected = actual_files - allowed_asset_files
            if unexpected:
                raise RuntimeError(
                    "Unexpected file(s) in verified auxiliary asset directory: "
                    + ", ".join(sorted(unexpected))
                )
    for relative_path, (kind, expected_hash) in ASSET_HASHES.items():
        path = runtime / relative_path
        if path.is_file() and digest(path, kind) != expected_hash:
            raise RuntimeError(f"Auxiliary asset hash mismatch: {relative_path}")

def _call_name(node: ast.AST) -> str | None:
    parts = []
    while isinstance(node, ast.Attribute):
        parts.append(node.attr)
        node = node.value
    if isinstance(node, ast.Name):
        parts.append(node.id)
        return ".".join(reversed(parts))
    return None


def _canonical_call_name(
    node: ast.AST,
    modules: dict[str, str],
    functions: dict[str, str],
) -> str | None:
    name = _call_name(node)
    if name is None:
        return None
    if name in functions:
        return functions[name]
    head, separator, tail = name.partition(".")
    if separator and head in modules:
        return modules[head] + "." + tail
    return name


def _import_aliases(tree: ast.AST) -> tuple[dict[str, str], dict[str, str]]:
    modules: dict[str, str] = {}
    functions: dict[str, str] = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                bound_name = alias.asname or alias.name.split(".", 1)[0]
                modules[bound_name] = alias.name
        elif isinstance(node, ast.ImportFrom):
            imported_module = node.module or ""
            for alias in node.names:
                bound_name = alias.asname or alias.name
                if alias.name == "*":
                    continue
                if imported_module in {"pickle", "joblib"}:
                    functions[bound_name] = f"{imported_module}.{alias.name}"
                elif imported_module == "torch":
                    if alias.name in {"jit", "serialization"}:
                        modules[bound_name] = f"torch.{alias.name}"
                    else:
                        functions[bound_name] = f"torch.{alias.name}"
                elif imported_module == "torch.jit":
                    functions[bound_name] = f"torch.jit.{alias.name}"
    return modules, functions


def harden(runtime: Path) -> list[str]:
    check_commit(runtime)
    changed = []
    for relative_path, patches in patches_by_path().items():
        path = runtime / relative_path
        original_source = path.read_bytes()
        use_crlf = b"\r\n" in original_source
        source = original_source.replace(b"\r\n", b"\n")
        file_changed = False
        for original, restricted, expected_count in patches:
            original_count = source.count(original)
            restricted_count = source.count(restricted)
            if restricted_count == expected_count and original_count == 0:
                continue
            if original_count != expected_count or restricted_count:
                raise RuntimeError(
                    f"Cannot safely patch {relative_path}: expected {expected_count} "
                    f"known loader/resource block (found {original_count} original, "
                    f"{restricted_count} patched)"
                )
            source = source.replace(original, restricted)
            file_changed = True
        if file_changed:
            path.write_bytes(source.replace(b"\n", b"\r\n") if use_crlf else source)
            changed.append(relative_path)

    verify_expected_worktree(runtime)
    for source_root in ("infer", "train"):
        for path in (runtime / source_root).rglob("*.py"):
            source = path.read_text(encoding="utf-8")
            tree = ast.parse(source, filename=str(path))
            modules, functions = _import_aliases(tree)
            for node in ast.walk(tree):
                if (
                    not isinstance(node, ast.Call)
                    or _canonical_call_name(node.func, modules, functions) != "torch.load"
                ):
                    continue
                weights_only = next(
                    (keyword for keyword in node.keywords if keyword.arg == "weights_only"),
                    None,
                )
                if (
                    weights_only is None
                    or not isinstance(weights_only.value, ast.Constant)
                    or weights_only.value.value is not True
                ):
                    raise RuntimeError(
                        f"Unrestricted torch.load remains at "
                        f"{path.relative_to(runtime)}:{node.lineno}"
                    )

    return changed


def inspect_other_loaders(runtime: Path) -> tuple[list[str], list[str]]:
    reviewed_sources = [
        path
        for source_root in ("infer", "train")
        for path in (runtime / source_root).rglob("*.py")
    ]
    unsafe_deserializers = []
    faiss_loaders = []
    for path in reviewed_sources:
        source = path.read_text(encoding="utf-8")
        relative = path.relative_to(runtime).as_posix()
        tree = ast.parse(source, filename=str(path))
        modules, functions = _import_aliases(tree)
        call_names = {
            name
            for node in ast.walk(tree)
            if isinstance(node, ast.Call)
            if (name := _canonical_call_name(node.func, modules, functions)) is not None
        }
        if call_names.intersection(
            {"pickle.load", "pickle.loads", "joblib.load", "torch.jit.load"}
        ):
            unsafe_deserializers.append(relative)
        if "faiss.read_index" in call_names:
            faiss_loaders.append(relative)
    return unsafe_deserializers, faiss_loaders


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runtime-path", required=True, type=Path)
    args = parser.parse_args()
    runtime = args.runtime_path.resolve()
    changed = harden(runtime)
    unsafe_deserializers, faiss_loaders = inspect_other_loaders(runtime)
    if unsafe_deserializers:
        raise RuntimeError(
            "Review additional deserializers before inference: "
            + ", ".join(unsafe_deserializers)
        )
    print(f"Verified upstream commit: {EXPECTED_COMMIT}")
    print(
        "Explicit weights_only=True in inference loaders: "
        + ", ".join(LOAD_CALLS)
    )
    print(
        "Training torch.load calls and low-memory DataLoader settings verified: "
        + ", ".join(TRAIN_LOAD_CALLS)
    )
    print(
        "Files patched this run: "
        + (", ".join(changed) if changed else "already hardened")
    )
    print(
        "FAISS loader files (must stay disabled with --index-rate 0): "
        + (", ".join(faiss_loaders) if faiss_loaders else "none")
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
