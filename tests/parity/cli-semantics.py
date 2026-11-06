"""Verify exit behavior through the actual upstream Typer CLI."""

import json
import logging
from pathlib import Path
import shutil
import tempfile

# Apply only the standard-context transport cache used by the differential oracle.
import oracle
from bia_ro_crate.cli import bia_ro_crate
from typer.testing import CliRunner


runner = CliRunner()
logging.disable(logging.CRITICAL)
results = []
fixture_root = Path(__file__).parent / "fixtures"
with tempfile.TemporaryDirectory(prefix="bijux-cli-parity-", dir=Path(__file__).parents[2] / "artifacts/work") as directory:
    root = Path(directory)
    for name, source_name, expected_error_exit in [
        ("valid", "test_minimal_valid_ro_crate", 0),
        ("invalid", "test_duplicate_entity_id", 1),
        ("malformed-json", "test_minimal_valid_ro_crate", 1),
    ]:
        crate = root / name
        shutil.copytree(fixture_root / source_name, crate)
        if name == "malformed-json":
            (crate / "ro-crate-metadata.json").write_text("{")
        error_result = runner.invoke(bia_ro_crate, ["validate", str(crate)])
        report_result = runner.invoke(bia_ro_crate, ["validate", str(crate), "--report-json"])
        assert error_result.exit_code == expected_error_exit, (name, error_result.output)
        assert report_result.exit_code == 0, (name, report_result.output)
        report = json.loads(report_result.stdout)
        results.append({
            "name": name,
            "error_mode_exit_code": error_result.exit_code,
            "report_mode_exit_code": report_result.exit_code,
            "highest_error_level": report["highest_error_level"],
            "error_count": len(report["issues"]["ERROR"]),
            "exception_type": type(error_result.exception).__name__ if error_result.exception else None,
        })
print(json.dumps({"passed": len(results), "cases": results}, indent=2))
