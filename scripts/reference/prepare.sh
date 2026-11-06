#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"
mkdir -p artifacts/reference artifacts/cache/uv artifacts/work
export UV_CACHE_DIR="$root/artifacts/cache/uv"
export TMPDIR="$root/artifacts/work"
if [[ ! -d artifacts/reference/python/.git ]]; then
  git clone --no-checkout https://github.com/BioImage-Archive/bia-ro-crate-validator.git artifacts/reference/python
fi
expected=cda44ee8e9340137b409614294e0bba227bce008
if [[ -n "$(git -C artifacts/reference/python status --porcelain)" ]]; then
  echo "Refusing modified oracle checkout" >&2; exit 1
fi
git -C artifacts/reference/python checkout --detach "$expected"
if [[ ! -x artifacts/reference/python-env/bin/python ]]; then
  uv venv --python "${BIJUX_REFERENCE_PYTHON:-3.13}" artifacts/reference/python-env
fi
uv pip install --python artifacts/reference/python-env/bin/python -e artifacts/reference/python -r tests/parity/requirements-oracle.txt
