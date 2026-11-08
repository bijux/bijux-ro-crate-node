"""Keep executable preparation fail-closed during download and cache failures."""

from pathlib import Path
import json
import runpy
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
prepare = runpy.run_path(str(ROOT / "scripts/reference/prepare-ontology.py"))["prepare_tool"]
reference = ROOT / "artifacts/reference/python"


class OntologyPreparation(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(dir=ROOT / "artifacts/work")
        self.addCleanup(self.directory.cleanup)
        self.destination = Path(self.directory.name) / "tools/robot.jar"
        self.tool = runpy.run_path(str(reference / "scripts/ontology/check_ontology.py"))
        self.tool["ROBOT_JAR"] = self.destination
        self.pins = patch("runpy.run_path", return_value=self.tool)
        self.pins.start()
        self.addCleanup(self.pins.stop)

    def test_corrupt_cache_is_rejected_without_network(self):
        self.destination.parent.mkdir()
        self.destination.write_bytes(b"corrupt")
        with patch.dict(prepare.__globals__, download=lambda *args: self.fail("Unexpected download")):
            with self.assertRaisesRegex(ValueError, "checksum mismatch"):
                prepare(reference)

    def test_corrupt_download_never_becomes_an_installed_compiler(self):
        def corrupt(url, destination, *args):
            destination.write_bytes(b"corrupt")
        with patch.dict(prepare.__globals__, download=corrupt):
            with self.assertRaisesRegex(ValueError, "checksum mismatch"):
                prepare(reference)
        self.assertFalse(self.destination.exists())

    def test_transport_and_asset_metadata_failures_never_install(self):
        for metadata in [{"assets": []}, {"assets": [{"name": "robot.jar", "id": 1, "size": 2**40}]}]:
            def unavailable(url, destination, *args):
                if "api.github.com" not in url:
                    raise subprocess.CalledProcessError(22, ["curl"])
                destination.write_text(json.dumps(metadata))
            with patch.dict(prepare.__globals__, download=unavailable):
                with self.assertRaisesRegex(ValueError, "Expected one bounded"):
                    prepare(reference)
            self.assertFalse(self.destination.exists())


if __name__ == "__main__":
    unittest.main()
