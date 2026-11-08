"""Capture the pinned OWL converter outcomes after RDFLib literal construction."""
import argparse
import subprocess
import sys
from importlib.metadata import version
import json
from pathlib import Path
from rdflib import Literal, URIRef
from owlrl.DatatypeHandling import AltXSDToPYTHON
root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, default=root / 'tests/parity/expected/datatype-errors.json')
args = parser.parse_args()
subprocess.run([sys.executable, str(root / 'scripts/reference/verify-environment.py')], check=True, stdout=subprocess.DEVNULL)
assert version('owlrl') == '7.1.4' and version('rdflib') == '7.6.0'
XSD = 'http://www.w3.org/2001/XMLSchema#'
RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
values = {
 'integer':['1','0','bad','1_0','١',''], 'byte':['127','128','-129'],
 'short':['32767','32768'], 'int':['2147483647','2147483648'],
 'long':['9223372036854775807','9223372036854775808'],
 'unsignedByte':['0','255','256'], 'unsignedShort':['65535','65536'],
 'unsignedInt':['4294967295','4294967296'], 'unsignedLong':['18446744073709551615','18446744073709551616'],
 'positiveInteger':['0','1'], 'negativeInteger':['-1','0'], 'nonPositiveInteger':['0','1'], 'nonNegativeInteger':['-1','0'],
 'decimal':['1','NaN','sNaN','Infinity','bad','1E2','1.00000000000000000001'],
 'float':['0','1','inf','nan','1e40','1e-50'], 'double':['0','1','inf','nan','1e310','1e-330'],
 'boolean':['true','false','bad'], 'anyURI':['',':bad','?bad','%AA','%XX','https://example.org/'],
 'base64Binary':['','YQ==','a','AA==','YQ====','A=AA'], 'hexBinary':['','a','01','gg','-01'],
 'date':['2024-01-01','2024-99-01',''],
 'dateTime':['2024-01-01T00:00:00','2024-01-01T00:00:00.123456','bad',''],
 'dateTimeStamp':['2024-01-01T00:00:00','2024-01-01T00:00:00Z'],
 'time':['12:00:00','25:00:00',''],
 'language':['en','bad_tag'], 'NMTOKEN':['a:b','bad space',''], 'Name':['abc','1bad'], 'NCName':['abc','a:b','1bad'],
 'normalizedString':['','one\ntwo'], 'token':['','good token',' bad '], 'string':['','value'],
}
cases=[]
for name, entries in values.items():
 for raw in entries:
  term=Literal(raw,datatype=URIRef(XSD+name)); lexical=str(term)
  try:AltXSDToPYTHON[term.datatype](lexical); outcome='valid'
  except ValueError:outcome='error-node'
  except Exception:outcome='incomplete'
  cases.append({'datatype':str(term.datatype),'input':raw,'lexical':lexical,'outcome':outcome})
for name,entries in {'PlainLiteral':['plain@en','plain@','plain@bad_tag','plain'],'XMLLiteral':['<root/>','<root>','<a/><b/>']}.items():
 for raw in entries:
  term=Literal(raw,datatype=URIRef(RDF+name));lexical=str(term)
  try:AltXSDToPYTHON[term.datatype](lexical);outcome='valid'
  except ValueError:outcome='error-node'
  except Exception:outcome='incomplete'
  cases.append({'datatype':str(term.datatype),'input':raw,'lexical':lexical,'outcome':outcome})
boundaries=json.loads((root/'tests/parity/datatypes/lexical-boundaries.json').read_text())['cases']
for item in boundaries:
 term=Literal(item['input'],datatype=URIRef(XSD+item['datatype']));lexical=str(term)
 try:AltXSDToPYTHON[term.datatype](lexical);outcome='valid'
 except ValueError:outcome='error-node'
 except Exception:outcome='incomplete'
 cases.append({'name':item['name'],'datatype':str(term.datatype),'input':item['input'],'lexical':lexical,'outcome':outcome})
path=args.output
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps({'owlrl':'7.1.4','rdflib':'7.6.0','cases':cases},indent=2)+'\n')
