"""Capture RDFLib literal lexical identity using the pinned oracle environment."""

import argparse
import contextlib
import importlib.metadata
import io
import json
import logging
import unicodedata
import platform
from pathlib import Path
import subprocess
import sys
from dependency_integrity import verify_installed_files

root = Path(__file__).resolve().parents[2]
reference = json.loads((root / "docs/compatibility/reference.json").read_text())
parser = argparse.ArgumentParser()
parser.add_argument(
    "--output",
    type=Path,
    default=root / "tests/parity/expected/literal-identities.json",
)
parser.add_argument("--write-runtime-digits", action="store_true")
args = parser.parse_args()
commit = subprocess.check_output(
    ["git", "-C", str(root / "artifacts/reference/python"), "rev-parse", "HEAD"],
    text=True,
).strip()
assert commit == reference["commit"], "Oracle source mismatch"
assert platform.python_version() == reference["python"], "Oracle interpreter mismatch"
assert sys.get_int_max_str_digits() == 4300, (
    "Default Python integer conversion limit required"
)
subprocess.run(
    ["git", "-C", str(root / "artifacts/reference/python"), "diff", "HEAD", "--quiet"],
    check=True,
)
integrity = verify_installed_files(importlib.metadata.distribution("rdflib"))
assert importlib.metadata.version("rdflib") == "7.6.0", "Locked RDFLib version required"

digit_data = {
    "unicode_version": unicodedata.unidata_version,
    "zero_points": [
        point for point in range(0x110000) if unicodedata.decimal(chr(point), None) == 0
    ],
}
digit_path = root / "packages/validator/src/metadata/rdf/literals/decimal-digits.json"
if args.write_runtime_digits:
    digit_path.write_text(json.dumps(digit_data, indent=2) + "\n")
assert json.loads(digit_path.read_text()) == digit_data, (
    "Regenerate pinned decimal digit data with --write-runtime-digits"
)

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
groups["duration"] += [
    sign + "P" + years + "Y" + months + "M"
    for sign in ["", "-"]
    for years in ["0", "1.0000001", "999999999999999999999999999999"]
    for months in ["0.0000005", "0.00000050", "0.00000005", "0.000001",
                   "1.333333333333333333333333333333", "999999999999999999999999999999",
                   "12.000000000000000000000000001", "11.999999999999999999999999999",
                   "0.000000000000000000000000000001"]
]
groups["duration"] += ["P1.0000001Y11.9999988M", "-P1.0000001Y11.9999988M"]
groups["dayTimeDuration"] = groups["duration"]
groups["yearMonthDuration"] = groups["duration"]
scalar_values = [
    "0",
    "-0",
    "+0",
    "1",
    "+01",
    "1.00",
    "1.0",
    "+1.0",
    "1e3",
    "1.00e3",
    "0e3",
    "0e-3",
    "-0.00",
    "1e-6",
    "1e-4",
    "1e16",
    "1e15",
    "1e309",
    "NaN",
    "-NaN",
    "NaN001",
    "sNaN02",
    "INF",
    "Infinity",
    "-Infinity",
    "_1_",
    "1__0",
    "1_0",
    "+_1",
    "1_.0",
    "1e_3",
    "1_0.0_0e+0_2",
    "١٢",
    "𝟙𝟚",
    "１２",
    " 1 ",
    "\x1c1\x1c",
    "1\x00",
    "invalid",
    "0x10",
    "\U00010d40",
    "\U00010d41",
    "+",
    ".",
    "",
]
for kind in ["integer", "decimal", "float", "double"]:
    groups[kind] = list(scalar_values)
groups["integer"].extend(
    ["+" + "0" * 4300, "+" + "0" * 4301, "0_" * 4299 + "0", "0_" * 4300 + "0"]
)
groups["decimal"].extend(
    [
        "12e999999999999999999",
        "1e1000000000000000000",
        "1e-1999999999999999998",
        "0e999999999999999999",
    ]
)
groups["boolean"] = [
    "true",
    "TRUE",
    "1",
    "false",
    "FALSE",
    "0",
    " true ",
    "yes",
    "-1",
    "",
]
for kind in ["normalizedString", "token"]:
    groups[kind] = ["a\tb", "a b", "  a   b  ", "a\r\nb", "\x1ca b\x1c", "a\u00a0b"]
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
            "unicode_version": unicodedata.unidata_version,
            "rdflib": importlib.metadata.version("rdflib"),
            "values": rows,
        },
        indent=2,
        ensure_ascii=False,
    )
    + "\n"
)
