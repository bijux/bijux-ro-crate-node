"""Regenerate browser model descriptors from the pinned upstream Pydantic classes.

Run using the recorded Python oracle environment with its dependencies installed.
The schema's property order is retained because it controls validation error order.
"""
import argparse
import json
import importlib.metadata
import tomllib
from pathlib import Path
import subprocess
import sys

PINNED_COMMIT = json.loads((Path(__file__).resolve().parents[2] / 'docs/compatibility/reference.json').read_text())['commit']
parser = argparse.ArgumentParser()
parser.add_argument('--upstream', type=Path, default=Path(__file__).resolve().parents[2] / 'artifacts/reference/python')
parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[2] / 'packages/validator/src/metadata/models/registry.js')
args = parser.parse_args()
commit = subprocess.check_output(['git', '-C', str(args.upstream), 'rev-parse', 'HEAD'], text=True).strip()
if commit != PINNED_COMMIT:
    parser.error(f'Expected upstream {PINNED_COMMIT}, found {commit}')
lock = tomllib.loads((args.upstream / 'poetry.lock').read_text())
locked = {item['name']: item['version'] for item in lock['package']}
for name in ('pydantic', 'pydantic-core'):
    installed = importlib.metadata.version(name)
    if installed != locked[name]:
        parser.error(f'Expected poetry.lock {name}=={locked[name]}, found {installed}')
sys.path.insert(0, str(args.upstream / 'src'))
from bia_ro_crate.models import ro_crate_models  # noqa: E402, F401. Registers all models.
from bia_ro_crate.models.model_registry import MODEL_REGISTRY  # noqa: E402
from bia_ro_crate.models.ro_crate_generator_utils import generate_standard_bia_context  # noqa: E402

registry = {}
for uri, model in MODEL_REGISTRY.items():
    defaults = {
        field.alias or name: field.get_default(call_default_factory=True)
        for name, field in model.model_fields.items()
        if not field.is_required()
    }
    registry[str(uri)] = {'name': model.__name__, 'schema': model.model_json_schema(), 'defaults': defaults}
context = generate_standard_bia_context().to_dict()
context = {key: context[key] for key in sorted(context)}
text = '// Generated from pinned upstream Pydantic models.\n'
text += 'export const MODEL_REGISTRY = ' + json.dumps(registry, indent=2) + ';\n\n'
text += 'export const STANDARD_CONTEXT = ' + json.dumps(context, indent=2) + ';\n'
args.output.write_text(text)
