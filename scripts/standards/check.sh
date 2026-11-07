#!/usr/bin/env bash
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
root="$(cd "${root}" && pwd -P)"
pin="${root}/.github/standards/bijux-std.sha"
[[ -f "${pin}" && ! -L "${pin}" ]] || { echo 'A regular accepted standards pin is required' >&2; exit 1; }
git -C "${root}" ls-files --error-unmatch .github/standards/bijux-std.sha >/dev/null
sha="$(cat "${pin}")"
[[ "${sha}" =~ ^[0-9a-f]{40}$ ]] || { echo 'A full lowercase standards commit is required' >&2; exit 1; }
source_dir="${root}/artifacts/standards/accepted-source/${sha}"
for location in "${root}/artifacts" "${root}/artifacts/standards" "${root}/artifacts/standards/accepted-source" "${source_dir}"; do
  [[ ! -L "${location}" ]] || { echo 'Standards cache must not use path aliases' >&2; exit 1; }
done
if [[ ! -e "${source_dir}" ]]; then
  mkdir -p "${source_dir}"
  git -C "${source_dir}" init --quiet
  git -C "${source_dir}" remote add origin https://github.com/bijux/bijux-std.git
fi
[[ "$(cd "${source_dir}" && pwd -P)" == "${source_dir}" ]] || { echo 'Standards cache must not use path aliases' >&2; exit 1; }
[[ "$(git -C "${source_dir}" rev-parse --show-toplevel)" == "${source_dir}" ]] || { echo 'Standards cache must be its own repository' >&2; exit 1; }
[[ "$(git -C "${source_dir}" remote get-url origin)" == 'https://github.com/bijux/bijux-std.git' ]] || { echo 'Standards cache must use the official origin' >&2; exit 1; }
[[ -z "$(git -C "${source_dir}" status --porcelain --untracked-files=all)" ]] || { echo 'Standards cache contains modified or untracked files' >&2; exit 1; }
git -C "${source_dir}" fetch --quiet --depth 1 origin "${sha}"
[[ "$(git -C "${source_dir}" rev-parse 'FETCH_HEAD^{commit}')" == "${sha}" ]] || { echo 'Fetched standards identity differs' >&2; exit 1; }
if git -C "${source_dir}" rev-parse --verify HEAD >/dev/null 2>&1; then
  [[ "$(git -C "${source_dir}" rev-parse HEAD)" == "${sha}" ]] || { echo 'Standards cache HEAD differs' >&2; exit 1; }
else
  git -C "${source_dir}" checkout --quiet --detach FETCH_HEAD
fi
# Admission and projection stay owned by the independently fetched standard.
PYTHONDONTWRITEBYTECODE=1 python3 "${source_dir}/.github/scripts/check_workflow_projection.py" \
  --target "${root}" --repo bijux-ro-crate-node --source-sha "${sha}"
