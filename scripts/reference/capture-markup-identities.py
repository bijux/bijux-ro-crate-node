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
from html5rdf.html5parser import InForeignContentPhase
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
# Strict tree-builder failures preserve the lexical spelling; legal implied
# endings and fostered text still normalize through the reference serializer.
html_fragments += [
    '<BR></BR>',
    '<br><br>',
    '<caption>x</caption>',
    'x',
    '<noscript>a &amp; b</noscript>',
    '<noscript>a & b</noscript>',
    "<CAPTION data-x='1'>x</CAPTION>",
    "<COL data-x='1'>x</COL>",
    "<COLGROUP data-x='1'>x</COLGROUP>",
    "<FRAME data-x='1'>x</FRAME>",
    "<HEAD data-x='1'>x</HEAD>",
    "<TBODY data-x='1'>x</TBODY>",
    "<TD data-x='1'>x</TD>",
    "<TFOOT data-x='1'>x</TFOOT>",
    "<TH data-x='1'>x</TH>",
    "<THEAD data-x='1'>x</THEAD>",
    "<TR data-x='1'>x</TR>",
    "<HTML data-x='1'>x</HTML>",
    "<BODY data-x='1'>x</BODY>",
    '</br>',
    '</p>',
    '<p>x</span></p>',
    '<div>x</p></div>',
    '<p>x</DIV>',
    '<div><span>x</div>',
    '<form><div>x</form></div>',
    '<P>a<P>b',
    '<DIV><P>x</DIV>',
    '<select><option>a<option>b</select>',
    '<table><caption>x</caption><tr><td>x</table>',
    '<table><colgroup><col></colgroup><tr><td>x</td></tr></table>',
    '<table><div>x</div></table>',
    '<image src=x>',
    '<svg><image href=x/></svg>',
    '<svg><path d=x/></svg>',
    '<svg><linearGradient></linearGradient></svg>',
    '<svg><g></svg>',
    '<svg><foreignObject><p>x</p></foreignObject></svg>',
    '<math><mi>x</mi></math>',
    '<math><mtext><span>x</span></mtext></math>',
    '<b><i>x</i></b>',
    '<b><i>x</b></i>',
    '<template><p>a &amp; b</p></template>',
    "<DIV data-x='1'>a &amp; b</DIV>",
    "<SPAN data-x='1'>a &amp; b</SPAN>",
    "<P data-x='1'>a &amp; b</P>",
    "<UL data-x='1'>a &amp; b</UL>",
    "<LI data-x='1'>a &amp; b</LI>",
    "<B data-x='1'>a &amp; b</B>",
    "<A data-x='1'>a &amp; b</A>",
    "<BUTTON data-x='1'>a &amp; b</BUTTON>",
    "<FORM data-x='1'>a &amp; b</FORM>",
    "<NOSCRIPT data-x='1'>a &amp; b</NOSCRIPT>",
    "<SCRIPT data-x='1'>a &amp; b</SCRIPT>",
    "<STYLE data-x='1'>a &amp; b</STYLE>",
    "<TEXTAREA data-x='1'>a &amp; b</TEXTAREA>",
    "<TITLE data-x='1'>a &amp; b</TITLE>",
    "<X-CUSTOM data-x='1'>a &amp; b</X-CUSTOM>",
    '<noscript><p>a &amp; b</p></noscript>',
    '<noscript>x</br>y</noscript>',
    '<script><p>a &amp; b</p></script>',
    '<script>x</br>y</script>',
    '<style><p>a &amp; b</p></style>',
    '<style>x</br>y</style>',
    '<textarea><p>a &amp; b</p></textarea>',
    '<textarea>x</br>y</textarea>',
    '<title><p>a &amp; b</p></title>',
    '<title>x</br>y</title>',
    '<DIV><table>x</table></DIV>',
    '<table>x<tr><td>y</table>',
    '<B><p>x</B>',
    '<BUTTON><button>x</BUTTON>',
    '<A><a>x</A>',
    '<A>x</A><A>y</A>',
    '<TABLE><td>x</TABLE>',
    '<table><tbody><td>x</td></tbody></table>',
    '<table>x<input type=hidden></table>',
    '<table><input type=hidden></table>',
    '<table><form>x</form></table>',
    '<table><table>x</table></table>',
    '<table><caption>x<tr><td>y</table>',
    '<TEMPLATE><optgroup>x</TEMPLATE>',
    '<TEMPLATE><p>x</TEMPLATE>',
    '<template><table>x</table></template>',
    '<template><template>x</template></template>',
    '<svg><option>x</svg>',
    '<svg><foreignObject><P>x</foreignObject></svg>',
    '<math><mtext><p>x</mtext></math>',
]
# HTML dispatch, rather than lexical tag spelling, decides whether a deprecated
# element or a foreign-content breakout is a strict parse failure.
html_fragments += [
    '<ISINDEX></ISINDEX>', '<isindex></isindex>', '<isindex>',
    '<svg><p>x</p>', '<svg></svg><p>x',
    '<math><span>x</span>', '<math></math><span>x</span>',
    '<svg><g/></svg>', '<svg><g></g></svg>',
    '<svg><isindex></isindex></svg>',
    '<math><isindex></isindex></math>',
    '<svg><foreignObject><isindex></isindex></foreignObject></svg>',
    '<math><mtext><isindex></isindex></mtext></math>',
    '<script>"<isindex>"</script>',
    '<!--<isindex>-->', '&lt;isindex&gt;',
    '<svg><![CDATA[<isindex>]]></svg>',
    '<svg><foreignObject><p>x</p></foreignObject></svg>',
    '<math><annotation-xml encoding="text/html"><p>x</p></annotation-xml></math>',
    '<math><annotation-xml encoding="application/xml"><p>x</p></annotation-xml></math>',
    '<math><mi><mglyph><span>x</span></mglyph></mi></math>',
]
for outer in ('svg', 'math'):
    for tag in sorted(InForeignContentPhase.breakoutElements):
        html_fragments.append(f'<{outer}><{tag}>x</{tag}></{outer}>')
    for attrs in ('', ' color="red"', ' face="serif"', ' size="1"', ' data-x="1"'):
        html_fragments.append(f'<{outer}><font{attrs}>x</font></{outer}>')
for integration in ('mi', 'mo', 'mn', 'ms', 'mtext'):
    html_fragments.append(f'<math><{integration}><span>x</span></{integration}></math>')
xml_fragments = [
    '<p xmlns="a b"></p>', '<p xmlns="a b"/>',
    '<p xmlns:x="a b"/>', '<p xmlns="a\tb"/>', '<p xmlns="a&#32;b"/>',
    '<p xmlns="a&#9;b"/>', '<p xmlns="a&#10;b"/>', '<p xmlns="a&#13;b"/>',
    '<p xmlns="a\u0085b"/>', '<p xmlns="a\u2028b"/>',
    '<p>\u0085</p>', '<p>\n</p>', '<p>\u2028</p>', '<p>\u2029</p>',
    '<p>\r\u0085</p>', '<p>\r\n</p>', '<p>\r</p>',
    '<p a="x\u0085y"/>', '<p a="x\u2028y"/>', '<p a="x\u2029y"/>',
    '<p><![CDATA[\u0085\u2028\u2029]]></p>',
]
rows = []
for kind, values in [('XMLLiteral', shared_fragments + xml_fragments), ('HTML', shared_fragments + html_fragments)]:
    values = list(dict.fromkeys(values))
    for text in values:
        try:
            literal = Literal(text, datatype=RDF[kind])
            rows.append(dict(kind=kind, input=text, canonical=str(literal), converted=literal.value is not None))
        except Exception as error:
            rows.append(dict(kind=kind, input=text, error=type(error).__name__, message=str(error)))
args.output.write_text(json.dumps({'reference': reference['commit'], 'python': platform.python_version(),
                                  'rdflib': version('rdflib'), 'html5rdf': version('html5rdf'), 'values': rows}, indent=2) + '\n')
print(f'{len(rows)} markup identities captured')
