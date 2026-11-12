"""Run the unchanged parser with a narrowly scoped temporal conversion correction."""
import argparse
import contextlib
import hashlib
import io
import json
import runpy
import sys
from pathlib import Path
from rules import corrected_temporal_converters, correction_receipt

folder = Path(__file__).parent
root = folder.parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--corrected', action='store_true')
args = parser.parse_args()
receipt = correction_receipt()
if args.corrected:
    request = json.load(sys.stdin)
    registered = json.loads((folder / 'inputs.json').read_text())
    encode = lambda value: json.dumps(value, ensure_ascii=False, separators=(',', ':'))
    assert encode(request) == encode(registered), 'Temporal correction requires the complete registered inputs'
    sys.stdin = io.StringIO(encode(request))
sys.path.insert(0, str(root / 'tests/parity'))
if args.corrected:
    sys.path.insert(0, str(root / 'tests/reference/competing-collections'))
    from qualification import collection_qualification
    oracle = runpy.run_path(str(root / 'tests/parity/oracle.py'))
    output = io.StringIO()
    with corrected_temporal_converters(), collection_qualification(oracle, request, folder / 'inputs.json') as collection_stamp, contextlib.redirect_stdout(output):
        oracle['main']()
    capture = json.loads(output.getvalue())
    assert all(row['status'] in {'valid', 'invalid'} for row in capture['cases']), 'Temporal qualification interrupted by a parser or instrumentation exception'
    capture['collection_qualification'] = collection_stamp
    capture['temporal_correction'] = {**receipt,
        'capture_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    print(json.dumps(capture))
else:
    runpy.run_path(str(root / 'tests/parity/oracle.py'), run_name='__main__')
