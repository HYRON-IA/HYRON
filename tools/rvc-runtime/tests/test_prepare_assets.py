import hashlib
import importlib.util
import tempfile
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "prepare-assets.py"
SPEC = importlib.util.spec_from_file_location("prepare_assets", SCRIPT_PATH)
prepare_assets = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(prepare_assets)


class PrepareAssetsTests(unittest.TestCase):
    def test_rmvpe_is_installed_at_the_runtime_lookup_path(self):
        self.assertEqual(
            prepare_assets.ASSETS["rmvpe.pt"]["target"],
            "rmvpe/rmvpe.pt",
        )

    def test_git_blob_sha1_matches_hugging_face_asset_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "config.json"
            path.write_bytes(b'{"test":true}\n')
            expected = hashlib.sha1(b"blob 14\0" + b'{"test":true}\n').hexdigest()
            self.assertEqual(
                prepare_assets.digest(path, "git-blob-sha1"),
                expected,
            )

    def test_sha256_checks_weight_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "weights.bin"
            path.write_bytes(b"restricted test weights")
            self.assertEqual(
                prepare_assets.digest(path, "sha256"),
                hashlib.sha256(b"restricted test weights").hexdigest(),
            )


if __name__ == "__main__":
    unittest.main()
