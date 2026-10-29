import importlib.util
import tempfile
import unittest
from pathlib import Path

import numpy as np
import soundfile as sf


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "prepare_dataset.py"
SPEC = importlib.util.spec_from_file_location("prepare_dataset", SCRIPT_PATH)
prepare_dataset = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(prepare_dataset)


class PrepareDatasetTests(unittest.TestCase):
    def test_splits_long_silence_and_prepares_mono_target_rate(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source"
            output = root / "prepared"
            source.mkdir()
            rate = 16000
            tone = 0.25 * np.sin(
                2 * np.pi * 220 * np.arange(rate, dtype=np.float32) / rate
            )
            silence = np.zeros(rate, dtype=np.float32)
            audio = np.concatenate(
                (silence[: rate // 4], tone, silence, tone, silence[: rate // 4])
            )
            sf.write(source / "voice.wav", audio, rate, subtype="PCM_16")
            manifest = prepare_dataset.prepare(
                source, output, root / "manifest.json", "self-owned authorized voice",
                40000, -40, 0.5, 0.05, 0.5,
            )
            self.assertEqual(len(manifest["successes"]), 1)
            self.assertEqual(len(manifest["successes"][0]["segments"]), 2)
            for segment in manifest["successes"][0]["segments"]:
                info = sf.info(output / segment["path"])
                self.assertEqual(info.samplerate, 40000)
                self.assertEqual(info.channels, 1)
                self.assertEqual(info.subtype, "PCM_16")

    def test_records_corrupt_audio_and_keeps_valid_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source"
            source.mkdir()
            rate = 40000
            voice = 0.25 * np.sin(
                2 * np.pi * 220 * np.arange(rate * 2, dtype=np.float32) / rate
            )
            sf.write(source / "valid.wav", voice, rate, subtype="PCM_16")
            (source / "corrupt.wav").write_bytes(b"not a wave file")
            manifest = prepare_dataset.prepare(
                source, root / "prepared", root / "manifest.json",
                "operator authorization reference", rate, -40, 0.8, 0.05, 0.5,
            )
            self.assertEqual(len(manifest["successes"]), 1)
            self.assertEqual(len(manifest["failures"]), 1)
            self.assertIn("error", manifest["failures"][0])

    def test_refuses_overwriting_prepared_dataset(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source"
            output = root / "prepared"
            source.mkdir()
            output.mkdir()
            (output / "existing.wav").write_bytes(b"existing")
            with self.assertRaises(FileExistsError):
                prepare_dataset.prepare(
                    source, output, root / "manifest.json", "authorized",
                    40000, -45, 0.8, 0.12, 1.0,
                )

    def test_build_filelist_uses_rvc_f0_cache_names(self):
        import sys

        sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
        import train_rvc

        with tempfile.TemporaryDirectory() as directory:
            experiment = Path(directory)
            for folder in ("0_gt_wavs", "3_feature256", "2a_f0", "2b-f0nsf"):
                (experiment / folder).mkdir()
            (experiment / "0_gt_wavs" / "clip_001.wav").touch()
            (experiment / "3_feature256" / "clip_001.npy").touch()
            (experiment / "2a_f0" / "clip_001.wav.npy").touch()
            (experiment / "2b-f0nsf" / "clip_001.wav.npy").touch()
            self.assertEqual(train_rvc.build_filelist(experiment), 1)
            row = (experiment / "filelist.txt").read_text(encoding="utf-8").strip()
            self.assertIn("clip_001.wav.npy", row)
            self.assertEqual(row.split("|")[-1], "0")


if __name__ == "__main__":
    unittest.main()
