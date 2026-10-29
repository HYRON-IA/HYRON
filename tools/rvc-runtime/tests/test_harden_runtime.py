import sys
import textwrap
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import harden_runtime


def source_for(relative_path: str) -> bytes:
    patches = harden_runtime.patches_by_path()[relative_path]
    functions = []
    for index, (original, _, count) in enumerate(patches):
        snippet = textwrap.dedent(original.decode("utf-8")).strip()
        functions.extend(
            f"def fixture_{index}_{copy_index}():\n"
            + textwrap.indent(snippet, "    ")
            for copy_index in range(count)
        )
    return ("\n\n".join(functions) + "\n").encode("utf-8")


class HardenRuntimeTests(unittest.TestCase):
    def create_runtime(self, root: Path) -> None:
        for relative_path in harden_runtime.patches_by_path():
            source = root / relative_path
            source.parent.mkdir(parents=True, exist_ok=True)
            source.write_bytes(source_for(relative_path))

    def test_patches_inference_and_training_loaders_restrictively_and_idempotently(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime = Path(directory)
            self.create_runtime(runtime)
            with patch.object(harden_runtime, "check_commit"):
                with patch.object(harden_runtime, "verify_expected_worktree"):
                    changed = harden_runtime.harden(runtime)
                    changed_again = harden_runtime.harden(runtime)

            self.assertEqual(set(changed), set(harden_runtime.patches_by_path()))
            self.assertEqual(changed_again, [])
            for relative_path, patches in harden_runtime.patches_by_path().items():
                expected = source_for(relative_path)
                for original, restricted, _ in patches:
                    expected = expected.replace(original, restricted)
                self.assertEqual((runtime / relative_path).read_bytes(), expected)

    def test_verifies_only_the_reviewed_loader_and_resource_edits(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime = Path(directory)
            committed_sources = {}
            for relative_path, patches in harden_runtime.patches_by_path().items():
                committed = source_for(relative_path)
                expected = committed
                for original, restricted, _ in patches:
                    expected = expected.replace(original, restricted)
                committed_sources[relative_path] = committed
                source = runtime / relative_path
                source.parent.mkdir(parents=True, exist_ok=True)
                source.write_bytes(expected.replace(b"\n", b"\r\n"))

            def git_output(*args, **kwargs):
                command = args[0]
                if "status" in command:
                    return type("Result", (), {"stdout": ""})()
                relative_path = command[-1].removeprefix("HEAD:")
                return type(
                    "Result", (), {"stdout": committed_sources[relative_path]}
                )()

            with patch.object(harden_runtime.subprocess, "run", side_effect=git_output):
                harden_runtime.verify_expected_worktree(runtime)

            unexpected = runtime / "train" / "data_utils.py"
            unexpected.write_bytes(unexpected.read_bytes() + b"# changed\n")
            with patch.object(harden_runtime.subprocess, "run", side_effect=git_output):
                with self.assertRaisesRegex(RuntimeError, "Unexpected local changes"):
                    harden_runtime.verify_expected_worktree(runtime)

    def test_refuses_unknown_or_unrestricted_torch_loads_in_training(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime = Path(directory)
            self.create_runtime(runtime)
            unexpected = runtime / "train" / "unexpected.py"
            unexpected.write_text("torch.load(path)\n", encoding="utf-8")
            with patch.object(harden_runtime, "check_commit"):
                with patch.object(harden_runtime, "verify_expected_worktree"):
                    with self.assertRaisesRegex(RuntimeError, "Unrestricted torch.load"):
                        harden_runtime.harden(runtime)

    def test_loader_audit_resolves_module_and_function_aliases(self):
        tree = harden_runtime.ast.parse(
            "import pickle as serialization\n"
            "from joblib import load as load_job\n"
            "import torch.jit as jit\n"
            "from torch import jit as torch_jit\n"
            "serialization.loads(blob)\n"
            "load_job(path)\n"
            "jit.load(path)\n"
            "torch_jit.load(path)\n"
        )
        modules, functions = harden_runtime._import_aliases(tree)
        calls = {
            harden_runtime._canonical_call_name(node.func, modules, functions)
            for node in harden_runtime.ast.walk(tree)
            if isinstance(node, harden_runtime.ast.Call)
        }
        self.assertIn("pickle.loads", calls)
        self.assertIn("joblib.load", calls)
        self.assertIn("torch.jit.load", calls)

    def test_refuses_unreviewed_untracked_runtime_files(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime = Path(directory)
            self.create_runtime(runtime)

            def git_output(*args, **kwargs):
                return type("Result", (), {"stdout": "?? train/custom.py\n"})()

            with patch.object(harden_runtime.subprocess, "run", side_effect=git_output):
                with self.assertRaisesRegex(RuntimeError, "Unexpected unreviewed runtime"):
                    harden_runtime.verify_expected_worktree(runtime)


if __name__ == "__main__":
    unittest.main()
