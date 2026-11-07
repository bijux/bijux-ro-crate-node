"""Capture RDFLib literal lexical identity using the pinned oracle environment."""

import argparse
import contextlib
import importlib.metadata
import io
import json
import logging
import platform
from pathlib import Path
import subprocess
from dependency_integrity import verify_installed_files

root = Path(__file__).resolve().parents[2]
reference = json.loads((root / "docs/compatibility/reference.json").read_text())
parser = argparse.ArgumentParser()
parser.add_argument(
    "--output",
    type=Path,
    default=root / "tests/parity/expected/literal-identities.json",
)
args = parser.parse_args()
commit = subprocess.check_output(
    ["git", "-C", str(root / "artifacts/reference/python"), "rev-parse", "HEAD"],
    text=True,
).strip()
assert commit == reference["commit"], "Oracle source mismatch"
assert platform.python_version() == reference["python"], "Oracle interpreter mismatch"
subprocess.run(
    ["git", "-C", str(root / "artifacts/reference/python"), "diff", "HEAD", "--quiet"],
    check=True,
)
integrity = verify_installed_files(importlib.metadata.distribution("rdflib"))
assert importlib.metadata.version("rdflib") == "7.6.0", "Locked RDFLib version required"

from rdflib import Literal, XSD

logging.disable(logging.CRITICAL)
groups = {
    "dateTime": [
        "2024-01-01T00:00:00Z",
        "2024-01-01T00:00:00+00:00",
        "2024-01-01 00:00:00",
        "20240101T000000",
        "2024-W01-1T00:00",
        "2024-01-01X00:00:00",
        "2024-01-01T00:00:00.1234567",
        "2024-01-01T00:00:00,1",
        "2024-01-01T01:00:00+01:00",
        "2024-01-01T00:00:00+00:00:00.5",
        "2024-01-01T00:00:00+01:00:30.5",
        "2024-01-01T00",
        "2024-01-01T00:00",
        "2024-01-01",
        "0000-01-01T00:00:00",
        "2024-02-30T00:00:00",
        "2024-01-01T24:00:00",
        "2024-01-01T00:00:00z",
        "2024W01100:00:00",
        "2024-W01-1100:00:00",
        "2024-W01-7100:00:00",
    ],
    "date": [
        "2024-01-01",
        "2024-01-01Z",
        "2024-01-01z",
        "2024-01-01+01:00",
        "2024-01-01-09:00",
        "2024-01-01T99:99:99",
        "20240101",
        "2024-W01-1",
        "2024-001",
        "0000-01-01",
        "-2024-01-01",
        "2024-02-30",
    ],
    "time": [
        "00:00:00",
        "00:00:00Z",
        "00:00:00+00:00",
        "00:00:00.1234567",
        "00:00:00,1",
        "T00:00:00",
        "000000",
        "00",
        "00:00",
        "01:00:00+01:00",
        "00:00:00+00:00:00.5",
        "00:00:00-00:00",
        "23:59:59.999999",
        "24:00:00",
        "00:00:60",
        "00:00:00z",
        "00:00:00+24:00",
        "00:00:00+01:99",
    ],
    "hexBinary": [
        "Aa",
        "aa",
        "AA",
        "aA",
        "ff00",
        "FF00",
        "a",
        "a a",
        " aa",
        "aa ",
        "GG",
        "",
        "éé",
        "0001",
    ],
    "base64Binary": [
        "YQ==",
        "Y Q==",
        "YQ===",
        "YQ==garbage",
        "YQ==!",
        "YQ",
        "YQ=",
        "YQ=======",
        "YR==",
        "YWJj",
        "YWJj====",
        "YWJj!",
        "YWJj=YWJj",
        "YWJj\n",
        "====",
        "!",
        "",
        "é",
        "YQ\x00==",
        "AAE=",
    ],
    "duration": [
        "P12M",
        "P1Y",
        "P1D",
        "PT24H",
        "P",
        "PT",
        "P0D",
        "PT0S",
        "-P0D",
        "+P1D",
        "P1W",
        "P7D",
        "P0.5W",
        "P3.5D",
        "PT0.0000005S",
        "PT0.0000015S",
        "P1.5Y",
        "P18M",
        "P1.50Y",
        "P0.5Y",
        "P6M",
        "P1.5M",
        "P0.5M",
        "P1Y0M",
        "P1Y12M",
        "P1Y0.5M",
        "P1,5D",
        "P1W2D",
        "P1DT2H3M4.5S",
        "-P1D",
        "-P1Y",
        "-P1Y1D",
        "P00010101T000000",
        "P0001-01-01T00:00:00",
        "P999999999999999999999D",
        " PT1S",
        "PT1S\n",
        "P1.2.3D",
        "P1.50M",
        "P13.50M",
        "P1.00Y0.50M",
        "P1.50Y1.00M",
        "P999999999999999999999999999999M",
        "-PT23999999999H",
        "-PT23999999976H",
        "-P999999999DT0.000001S",
        "P1000000000D",
    ],
}
groups["dayTimeDuration"] = groups["duration"]
groups["yearMonthDuration"] = groups["duration"]
rows = []
for kind, values in groups.items():
    for value in values:
        try:
            with contextlib.redirect_stderr(io.StringIO()):
                term = Literal(value, datatype=XSD[kind])
            rows.append({"datatype": kind, "input": value, "canonical": str(term)})
        except Exception as e:
            rows.append(
                {
                    "datatype": kind,
                    "input": value,
                    "error": type(e).__name__,
                    "message": str(e),
                }
            )
args.output.write_text(
    json.dumps(
        {
            "reference": commit,
            "python": platform.python_version(),
            "installed_files_verified": integrity["files_verified"],
            "rdflib": importlib.metadata.version("rdflib"),
            "values": rows,
        },
        indent=2,
        ensure_ascii=False,
    )
    + "\n"
)
