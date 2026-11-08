"""Run the pinned Python parser against the exact bytes supplied to JavaScript."""

import contextlib
import importlib.metadata
import io
import json
import logging
import copy
from contextvars import ContextVar
from pathlib import Path
import sys
import tempfile
import hashlib
import subprocess
import bia_ro_crate

from bia_ro_crate.core.parser.ro_crate_parser import ROCrateParser
from bia_ro_crate.core.validation.severity import Severity
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
case_contexts = ContextVar("case_contexts", default={})


def context_document(url):
    url = str(url)
    if url in standard_urls:
        return copy.deepcopy(standard_context)
    resources = case_contexts.get()
    if url not in resources:
        raise RuntimeError(f"Unexpected oracle context request: {url}")
    document = copy.deepcopy(resources[url])
    return json.loads(document) if isinstance(document, str) else document


def cached_source_to_json(source, *args, **kwargs):
    return context_document(source), None


rdflib_context.source_to_json = cached_source_to_json


def cached_document_loader(url, options=None):
    return {"contextUrl": None, "documentUrl": url, "document": context_document(url)}


pyld.jsonld.set_document_loader(cached_document_loader)


def cached_http_get(self, url, *args, **kwargs):
    response = requests.Response()
    response.status_code = 200
    response.url = url
    response.encoding = "utf-8"
    response.headers["Content-Type"] = "application/ld+json"
    response._content = json.dumps(context_document(url)).encode("utf-8")
    return response


HttpRequester.get = cached_http_get


def exception_tree(error):
    result = {"type": type(error).__name__, "message": str(error)}
    if isinstance(error, BaseExceptionGroup):
        result["children"] = [exception_tree(child) for child in error.exceptions]
    return result


def completion_status(error, issues):
    fatal = [issue.format_message() for issue in issues if issue.severity is Severity.ERROR]
    if error is None:
        return 'incomplete' if fatal else 'valid'
    # Only Parser._raise_errors' exact rejection signature is completed rule
    # rejection. An unrelated or mixed ExceptionGroup can accompany findings.
    if (type(error) is ExceptionGroup and error.message == 'Validation failed.'
            and fatal and all(type(child) is Exception for child in error.exceptions)
            and sorted(map(str, error.exceptions)) == sorted(fatal)):
        return 'invalid'
    return 'incomplete'


def case_path(root, name):
    relative = Path(name)
    if not name or relative.is_absolute() or ".." in relative.parts or "\\" in name or "\x00" in name:
        raise ValueError("Oracle inputs require confined crate-relative file names")
    target = root / relative
    if not target.resolve().is_relative_to(root.resolve()) or target == root:
        raise ValueError("Oracle input escapes its crate")
    return target


def run_case(case):
    token = case_contexts.set(copy.deepcopy(case.get("contexts", {})))
    try:
        return run_local_case(case)
    finally:
        case_contexts.reset(token)


def run_local_case(case):
    with tempfile.TemporaryDirectory(prefix="bijux-oracle-", dir=Path(__file__).parents[2] / "artifacts/work") as directory:
        root = Path(directory)
        for name, text in case["files"].items():
            target = case_path(root, name)
            target.parent.mkdir(parents=True, exist_ok=True)
            if isinstance(text, list):
                target.write_bytes(bytes(text))
            else:
                target.write_text(text, encoding="utf-8")
        inputs_sha256 = {name: hashlib.sha256(case_path(root, name).read_bytes()).hexdigest()
                         for name in case['files']}
        parser = ROCrateParser(root)
        failure = None
        status = None
        try:
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                parser.parse()
                parser.result
        except BaseException as error:
            failure = exception_tree(error)
            status = completion_status(error, parser.issues)
        report = _report_issues(parser)
        if status is None:
            status = completion_status(None, parser.issues)
        assert inputs_sha256 == {name: hashlib.sha256(case_path(root, name).read_bytes()).hexdigest()
                                 for name in case['files']}, 'Oracle mutated its input files'
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
            "inputs_sha256": inputs_sha256,
        }


def main():
    logging.disable(logging.CRITICAL)
    source_root = Path(bia_ro_crate.__file__).resolve().parents[2]
    commit = subprocess.check_output(["git", "-C", str(source_root), "rev-parse", "HEAD"], text=True).strip()
    reference = json.loads((Path(__file__).parents[2] / "docs/compatibility/reference.json").read_text())
    assert commit == reference['commit'], f"Unexpected upstream commit {commit}"
    subprocess.run(["git", "-C", str(source_root), "diff", "HEAD", "--quiet", "--", "src", "pyproject.toml", "poetry.lock"], check=True)
    for requirement in (Path(__file__).parent / "requirements-oracle.txt").read_text().splitlines():
        if "==" in requirement:
            name, expected_version = requirement.split("==", 1)
            actual_version = importlib.metadata.version(name)
            assert actual_version == expected_version, f"{name}=={actual_version} differs from locked {expected_version}"
    untracked = subprocess.check_output(["git", "-C", str(source_root), "ls-files", "--others", "--exclude-standard", "--", "src"], text=True)
    assert not untracked, "Untracked importable oracle source"
    assert '.'.join(map(str, sys.version_info[:3])) == reference['python'], 'Oracle Python patch version drift'
    for relative, expected in reference["inputs"].items():
        assert hashlib.sha256((source_root / relative).read_bytes()).hexdigest() == expected, f"Reference input drift: {relative}"
    root = Path(__file__).parents[2]
    environment = subprocess.check_output([sys.executable, str(root / 'scripts/reference/verify-environment.py')], text=True)
    report_dir = root / 'artifacts/reports'
    report_dir.mkdir(parents=True, exist_ok=True)
    (report_dir / 'oracle-environment.json').write_text(environment)
    request = json.load(sys.stdin)
    corpus_sha256 = hashlib.sha256(json.dumps(request['cases'], ensure_ascii=False,
                                             separators=(',', ':'), allow_nan=False).encode('utf-8')).hexdigest()
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
        print(json.dumps({"commit": commit, "context_sha256": context_sha256, "versions": versions,
                          "corpus_sha256": corpus_sha256,
                          "python": '.'.join(map(str, sys.version_info[:3])),
                          "imported_module": str(Path(bia_ro_crate.__file__).resolve()), "cases": cases}))


if __name__ == "__main__":
    main()
