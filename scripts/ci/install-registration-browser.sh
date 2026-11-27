#!/usr/bin/env bash
set -euo pipefail
# Limit this apt invocation to the runner's signed Ubuntu archive; never modify system sources.
root=$(pwd)
source_file=/etc/apt/sources.list.d/ubuntu.sources
node_path=$(command -v node)
mkdir -p "$root/artifacts/work"
task_dir=$(mktemp -d "$root/artifacts/work/ubuntu-apt.XXXXXXXX")
trap 'rm -rf -- "$task_dir"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
mkdir "$task_dir/sources"
cp -p -- "$source_file" "$task_dir/sources/ubuntu.sources"
"$node_path" --import tsx "$root/scripts/ci/ubuntu-sources.mts" "$task_dir/sources/ubuntu.sources"
printf 'Dir::Etc::sourcelist "/dev/null";\nDir::Etc::sourceparts "%s";\n' "$task_dir/sources" > "$task_dir/apt.conf"
sudo env "APT_CONFIG=$task_dir/apt.conf" "$node_path" "$root/node_modules/playwright/cli.js" install-deps chromium
"$node_path" "$root/node_modules/playwright/cli.js" install chromium
