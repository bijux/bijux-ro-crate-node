"""Capture locked RDFLib XML/HTML terms and HTML serialization constants."""
import argparse
from importlib.metadata import distribution, version
from pathlib import Path
import json
import logging
import platform
import subprocess
import sys
from dependency_integrity import verify_installed_files

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, default=root / 'tests/parity/expected/markup-identities.json')
parser.add_argument('--write-runtime-data', action='store_true')
args = parser.parse_args()
subprocess.run([sys.executable, str(root / 'scripts/reference/verify-environment.py')],
               check=True, stdout=subprocess.DEVNULL)
reference = json.loads((root / 'docs/compatibility/reference.json').read_text())
verify_installed_files(distribution('rdflib'))
verify_installed_files(distribution('html5rdf'))
from rdflib import Literal, RDF
from html5rdf.constants import namespaces, booleanAttributes, voidElements, rcdataElements
logging.disable(logging.CRITICAL)
data = {'namespace': namespaces['html'],
        'boolean_attributes': {k: sorted(v) for k, v in sorted(booleanAttributes.items())},
        'void_elements': sorted(voidElements), 'raw_text': sorted(rcdataElements)}
data_path = root / 'packages/validator/src/metadata/rdf/literals/markup/html-data.json'
if args.write_runtime_data:
    data_path.write_text(json.dumps(data, indent=2) + '\n')
assert json.loads(data_path.read_text()) == data, 'HTML serialization constants differ from locked reference'

shared_fragments = [
    '',
    'abc',
    '<p a="1"></p>',
    "<p a='1'/>",
    '<p/>',
    '<P>abc</P>',
    '<p>abc</p>',
    '<p>abc',
    '<div>abc</div>',
    '<div>abc',
    '<p>a</p> <p>b</p>',
    '<p>a &amp; &lt;b&gt;</p>',
    '<p a="&quot;">x</p>',
    '<p a="a b">x</p>',
    '<p a="a\tb">x</p>',
    '<p a="a\nb">x</p>',
    '<p a="a\rb">x</p>',
    '<p a="&#x9;">x</p>',
    '<p a="">x</p>',
    '<p a="1" b="2"/>',
    '<p b="2" a="1"/>',
    '<p a=1>x</p>',
    '<p a="1" a="2"/>',
    '<p>&undefined;</p>',
    '<p>&#x0;</p>',
    '<p>\x00</p>',
    '<p>\x01</p>',
    '<p>\r\nx</p>',
    '<!--comment--><p/>',
    '<![CDATA[a<b]]>',
    '<p/><span/>',
    '<x:p xmlns:x="urn:x"/>',
    '<x:p/>',
    '<p xmlns="urn:p"/>',
    '<?xml version="1.0"?><p/>',
    '<!DOCTYPE p><p/>',
    '<?pi x?><p/>',
    '<p>\ud800</p>',
    '<p>\uffff</p>',
    '<?pi?>',
    '<p>\rX</p>',
    '<p>\r\nX</p>',
    "<p a='&#13;&#10;&#9;'/>",
    '<p>&quot; &apos;</p>',
    '<p><!--a--><![CDATA[b]]>c</p>',
    '<p xmlns:xml="urn:x"/>',
    '<p xmlns:xmlns="urn:x"/>',
    '<p xmlns=""/>',
]
html_fragments = [
    '<input disabled="disabled">',
    '<input checked="false" value="yes">',
    '<img src="a/b">',
    '<br/>',
    '<ul><li>a</li><li>b</li></ul>',
    '<dl><dt>a</dt><dd>b</dd></dl>',
    '<select><option>a</option><option>b</option></select>',
    '<table><tr><td>a</td><td>b</td></tr></table>',
    '<table><tbody><tr><td>a</td></tr></tbody></table>',
    '<svg><path d="x"/></svg>',
    '<svg><a xlink:href="urn:x"/></svg>',
    '<math><mi>x</mi></math>',
    '<script>a < b && c > d</script>',
    '<style>a > b { color: red }</style>',
    '<textarea>a &amp; b</textarea>',
    '<title>a &lt; b</title>',
    '<template><p>a</p></template>',
    '<h>x</h>',
    '<label a="\xa0">x</label>',
    '<p title="&quot;">x</p>',
    '<p title="&apos;">x</p>',
    '<p title="&quot;&apos;">x</p>',
    '<!--comment--><p>a</p>\n',
    '<p>a</p><!--comment-->',
    '<p/>abc',
    '<!DOCTYPE html><p>x</p>',
    '<constructor a="1"></constructor>',
    '<hasOwnProperty a="1"></hasOwnProperty>',
    '<p __proto__="1">x</p>',
    '<ruby><rt>a</rt><rp>b</rp></ruby>',
    '<table><colgroup><col></colgroup><tbody><tr><td>a</td></tr></tbody></table>',
    '<table><thead><tr><th>a</th></tr></thead><tbody><tr><td>b</td></tr></tbody></table>',
    '<p>a</p><div>b</div>',
    '<p>a</p>\t',
    '<noscript>x</noscript>',
    '<option>x',
    '<div>x</span>',
    'plain & nope',
]
rows = []
for kind, values in [('XMLLiteral', shared_fragments), ('HTML', shared_fragments + html_fragments)]:
    for text in values:
        try:
            literal = Literal(text, datatype=RDF[kind])
            rows.append(dict(kind=kind, input=text, canonical=str(literal), converted=literal.value is not None))
        except Exception as error:
            rows.append(dict(kind=kind, input=text, error=type(error).__name__, message=str(error)))
args.output.write_text(json.dumps({'reference': reference['commit'], 'python': platform.python_version(),
                                  'rdflib': version('rdflib'), 'html5rdf': version('html5rdf'), 'values': rows}, indent=2) + '\n')
print(f'{len(rows)} markup identities captured')
