"""Run the pinned Python parser against the exact bytes supplied to JavaScript."""

import contextlib
import importlib.metadata
import io
import json
import logging
import copy
from pathlib import Path
import sys
import tempfile
import hashlib
import subprocess
import bia_ro_crate

from bia_ro_crate.core.parser.ro_crate_parser import ROCrateParser
from bia_ro_crate.validator.validation import _report_issues
import pyld.jsonld
from rdflib.plugins.shared.jsonld import context as rdflib_context
from rocrate_validator.utils.http import HttpRequester
import requests


# Serve the identical pinned standard context at the transport boundary.
# This keeps crate bytes and every upstream validation stage unchanged.
context_bytes = Path(__file__).with_name("context.json").read_bytes()
context_sha256 = hashlib.sha256(context_bytes).hexdigest()
assert context_sha256 == "4a8c4cbdfd73d3d11be5ebe135f6122a0fc711fd1433e4258a748c80cc257ab7", "Bundled standard context changed"
standard_context = json.loads(context_bytes)
standard_urls = {"https://w3id.org/ro/crate/1.1/context", "https://w3id.org/ro/crate/1.1/context.jsonld"}


def cached_source_to_json(source, *args, **kwargs):
    if str(source) in standard_urls:
        return copy.deepcopy(standard_context), None
    raise RuntimeError(f"Unexpected oracle context request: {source}")


rdflib_context.source_to_json = cached_source_to_json


def cached_document_loader(url, options=None):
    if url in standard_urls:
        return {"contextUrl": None, "documentUrl": url, "document": copy.deepcopy(standard_context)}
    raise RuntimeError(f"Unexpected oracle context request: {url}")


pyld.jsonld.set_document_loader(cached_document_loader)


def cached_http_get(self, url, *args, **kwargs):
    if url in standard_urls:
        response = requests.Response()
        response.status_code = 200
        response.url = url
        response.encoding = "utf-8"
        response.headers["Content-Type"] = "application/ld+json"
        response._content = json.dumps(standard_context).encode("utf-8")
        return response
    raise RuntimeError(f"Unexpected oracle HTTP request: {url}")


HttpRequester.get = cached_http_get


def exception_tree(error):
    result = {"type": type(error).__name__, "message": str(error)}
    if isinstance(error, BaseExceptionGroup):
        result["children"] = [exception_tree(child) for child in error.exceptions]
    return result


def case_path(root, name):
    relative = Path(name)
    if not name or relative.is_absolute() or ".." in relative.parts or "\\" in name or "\x00" in name:
        raise ValueError("Oracle inputs require confined crate-relative file names")
    target = root / relative
    if not target.resolve().is_relative_to(root.resolve()) or target == root:
        raise ValueError("Oracle input escapes its crate")
    return target


def run_case(case):
    with tempfile.TemporaryDirectory(prefix="bijux-oracle-", dir=Path(__file__).parents[2] / "artifacts/work") as directory:
        root = Path(directory)
        for name, text in case["files"].items():
            target = case_path(root, name)
            target.parent.mkdir(parents=True, exist_ok=True)
            if isinstance(text, list):
                target.write_bytes(bytes(text))
            else:
                target.write_text(text, encoding="utf-8")
        parser = ROCrateParser(root)
        failure = None
        try:
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                parser.parse()
                parser.result
        except BaseException as error:
            failure = exception_tree(error)
        report = _report_issues(parser)
        # ExceptionGroup is how the upstream parser signals validation failures.
        status = "valid" if failure is None else "invalid" if failure["type"] == "ExceptionGroup" and any(issue.severity.value >= 40 for issue in parser.issues) else "incomplete"
        return {
            "name": case["name"],
            "status": status,
            "report": report,
            "error_mode_exit_code": 0 if failure is None else 1,
            # bia_roc_validation(..., 'report') returns in finally and suppresses errors.
            "report_mode_exit_code": 0,
            "exception": failure,
            "root": str(root),
            "root_uri": root.as_uri(),
        }


def main():
    logging.disable(logging.CRITICAL)
    source_root = Path(bia_ro_crate.__file__).resolve().parents[2]
    commit = subprocess.check_output(["git", "-C", str(source_root), "rev-parse", "HEAD"], text=True).strip()
    assert commit == "cda44ee8e9340137b409614294e0bba227bce008", f"Unexpected upstream commit {commit}"
    subprocess.run(["git", "-C", str(source_root), "diff", "HEAD", "--quiet", "--", "src", "pyproject.toml", "poetry.lock"], check=True)
    for requirement in (Path(__file__).parent / "requirements-oracle.txt").read_text().splitlines():
        if "==" in requirement:
            name, expected_version = requirement.split("==", 1)
            actual_version = importlib.metadata.version(name)
            assert actual_version == expected_version, f"{name}=={actual_version} differs from locked {expected_version}"
    untracked = subprocess.check_output(["git", "-C", str(source_root), "ls-files", "--others", "--exclude-standard", "--", "src"], text=True)
    assert not untracked, "Untracked importable oracle source"
    reference = json.loads((Path(__file__).parents[2] / "docs/compatibility/reference.json").read_text())
    for relative, expected in reference["inputs"].items():
        assert hashlib.sha256((source_root / relative).read_bytes()).hexdigest() == expected, f"Reference input drift: {relative}"
    request = json.load(sys.stdin)
    versions = {
        name: importlib.metadata.version(name)
        for name in ["bia-ro-crate-validator", "pandas", "pydantic", "pyld", "rdflib", "roc-validator"]
    }
    cases = []
    for case in request["cases"]:
        result = run_case(case)
        cases.append(result)
        print(f"oracle {case['name']} {result['status']}", file=sys.stderr, flush=True)
        if request.get("stream"):
            print(json.dumps(result), flush=True)
    if not request.get("stream"):
        print(json.dumps({"commit": commit, "context_sha256": context_sha256, "versions": versions, "cases": cases}))


if __name__ == "__main__":
    main()
