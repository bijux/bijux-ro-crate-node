"""Record actual RDFLib reference checks with stable URI normalization."""
import json
import importlib.metadata
from pathlib import Path
for name, version in {'pydantic': '2.12.5', 'pydantic-core': '2.41.5', 'PyLD': '2.0.4', 'rdflib': '7.6.0'}.items():
    actual = importlib.metadata.version(name)
    if actual != version:
        raise RuntimeError(f'Expected poetry.lock {name}=={version}, found {actual}')

from bia_ro_crate.core.parser.jsonld_metadata_parser import JSONLDMetadataParser

HERE=Path(__file__).parent
ROOT=HERE.parents[2] / 'artifacts/work/reference-probes'
ROOT.mkdir(parents=True, exist_ok=True)
CONTEXT={'schema':'http://schema.org/','x':'http://example.org/','link':{'@id':'x:link'},'conformsTo':'http://purl.org/dc/terms/conformsTo','literal':'x:literal'}
CASES=[
 ('connected',[{'@id':'ro-crate-metadata.json','@type':'schema:CreativeWork','link':{'@id':'#a'}},{'@id':'#a','@type':'x:Entity'}]),
 ('undefined local reference',[{'@id':'ro-crate-metadata.json','@type':'schema:CreativeWork','link':{'@id':'#missing'}}]),
 ('inboundless objects',[{'@id':'ro-crate-metadata.json','@type':'schema:CreativeWork'},{'@id':'#a','@type':'x:Entity'},{'@id':'#b','literal':'b'}]),
 ('blank subject',[{'@id':'_:blank','@type':'x:Entity','link':{'@id':'#missing'}}]),
 ('blank object',[{'@id':'ro-crate-metadata.json','link':{'@id':'_:blank'}},{'@id':'_:blank','literal':'value'}]),
 ('type global subtraction',[{'@id':'ro-crate-metadata.json','@type':'x:Entity','link':{'@id':'x:Entity'}}]),
 ('profile global subtraction',[{'@id':'ro-crate-metadata.json','conformsTo':{'@id':'http://example.org/profile'},'link':{'@id':'http://example.org/profile'}}]),
 ('type objects inboundless',[{'@id':'ro-crate-metadata.json','@type':'x:Entity'},{'@id':'x:Entity','literal':'a'}]),
 ('object with no triples',[{'@id':'ro-crate-metadata.json','link':{'@id':'#a'}},{'@id':'#a'}]),
 ('nested entity',[{'@id':'ro-crate-metadata.json','link':{'@id':'#a','literal':'a'}}]),
 ('cyclic disconnected',[{'@id':'ro-crate-metadata.json','@type':'schema:CreativeWork'},{'@id':'#a','link':{'@id':'#b'}},{'@id':'#b','link':{'@id':'#a'}}]),
 ('literal resembling URL',[{'@id':'ro-crate-metadata.json','literal':'http://example.org/undefined'}]),
 ('numeric node ID',[{'@id':'ro-crate-metadata.json','link':{'@id':7}},{'@id':'#a','literal':'a'}]),
 ('null node ID',[{'@id':None,'literal':'a'}]),
 ('object node ID',[{'@id':{},'literal':'a'}]),
 ('aliased numeric node ID',[{'@context':{'id':'@id'},'id':7,'literal':'a'}]),
 ('object type',[{'@id':'#a','@type':{}}]),
 ('null type',[{'@id':'#a','@type':None}]),
 ('numeric type',[{'@id':'#a','@type':7}]),
 ('mixed malformed type',[{'@id':'#a','@type':[7,'http://example.org/type',{}]}]),
 ('relative root',[{'@id':'ro-crate-metadata.json','link':{'@id':'./'}},{'@id':'./','@type':'schema:Dataset'}]),
 ('reverse reference',[{'@id':'ro-crate-metadata.json','@reverse':{'link':{'@id':'#a'}}},{'@id':'#a','literal':'a'}]),
]
RDF='http://www.w3.org/1999/02/22-rdf-syntax-ns#'
XSD='http://www.w3.org/2001/XMLSchema#'
for predicate in ('first', 'rest'):
 for name, values in [
  ('large integer distinct', [{'@value':9007199254740992,'@type':XSD+'integer'},{'@value':9007199254740993,'@type':XSD+'integer'}]),
  ('large integer implicit datatype', [{'@value':9007199254740992},{'@value':9007199254740992,'@type':XSD+'integer'}]),
  ('large integer duplicate', [{'@value':9007199254740992},{'@value':9007199254740992}]),
  ('empty', []), ('single', ['a']), ('duplicate', ['a','a']), ('distinct', ['a','b']),
  ('normalized integer', [{'@value':'01','@type':XSD+'integer'},{'@value':'1','@type':XSD+'integer'}]),
  ('normalized boolean', [{'@value':'1','@type':XSD+'boolean'},{'@value':'true','@type':XSD+'boolean'}]),
  ('language case', [{'@value':'a','@language':'EN'},{'@value':'a','@language':'en'}]),
  ('distinct language', [{'@value':'a','@language':'de'},{'@value':'a','@language':'en'}]),
  ('distinct datatype', [{'@value':'1','@type':XSD+'int'},{'@value':'1','@type':XSD+'integer'}]),
  ('decimal comparison key collision', [{'@value':'1','@type':XSD+'decimal'},{'@value':'[false,"1",0]','@type':XSD+'decimal'}]),
  ('decimal NaN case', [{'@value':'nan','@type':XSD+'decimal'},{'@value':'NaN','@type':XSD+'decimal'}]),
  ('decimal NaN sign', [{'@value':'-NaN','@type':XSD+'decimal'},{'@value':'NaN','@type':XSD+'decimal'}]),
  ('decimal infinity', [{'@value':'inf','@type':XSD+'decimal'},{'@value':'+Infinity','@type':XSD+'decimal'}]),
  ('normalized decimal', [{'@value':'01','@type':XSD+'decimal'},{'@value':'1','@type':XSD+'decimal'}]),
  ('decimal scale', [{'@value':'1.0','@type':XSD+'decimal'},{'@value':'1','@type':XSD+'decimal'}]),
  ('decimal exponent', [{'@value':'1e1','@type':XSD+'decimal'},{'@value':'10','@type':XSD+'decimal'}]),
  ('normalized double', [{'@value':'01.00','@type':XSD+'double'},{'@value':'1e0','@type':XSD+'double'}]),
  ('double signed zero', [{'@value':'-0','@type':XSD+'double'},{'@value':'0','@type':XSD+'double'}]),
  ('normalized string', [{'@value':'a\tb','@type':XSD+'normalizedString'},{'@value':'a b','@type':XSD+'normalizedString'}]),
  ('token spaces', [{'@value':' a  b ','@type':XSD+'token'},{'@value':'a b','@type':XSD+'token'}]),
  ('token internal unicode space', [{'@value':'a\u00a0b','@type':XSD+'token'},{'@value':'a b','@type':XSD+'token'}]),
 ]:
  CASES.append((f'collection {predicate} {name}', [{'@id':'_:cell', RDF+predicate:values}]))
CASES += [
 ('collection separate cells', [{'@id':'_:a',RDF+'first':'a'},{'@id':'_:b',RDF+'first':'b'}]),
 ('collection repeated cell', [{'@id':'_:a',RDF+'first':'a'},{'@id':'_:a',RDF+'first':'b'}]),
 ('collection both predicates', [{'@id':'_:a',RDF+'first':['a','b'],RDF+'rest':['c','d']}]),
 ('collection prior reference errors', [{'@id':'_:a',RDF+'first':[{'@id':'#missing-a'},{'@id':'#missing-b'}]}]),
]
cases=[]
for name,graph in CASES:
 document={'@context':CONTEXT,'@graph':graph}
 path=ROOT/'ro-crate-metadata.json'
 path.write_text(json.dumps(document))
 parser=JSONLDMetadataParser(ROOT)
 try:
  parser._id_reference_validation(path)
 except ExceptionGroup as error:
  if error.message != "Validation failed.": raise
 issues=[issue.to_dict() for issue in parser.issues]
 for issue in issues:
  issue['message']=issue['message'].replace(ROOT.as_uri()+'/', 'file:///crate/')
 cases.append({'name':name,'input':document,'expected':issues})
for name, graph in [('null graph', None)]:
 document={'@context':CONTEXT,'@graph':graph}
 path=ROOT/'ro-crate-metadata.json'
 path.write_text(json.dumps(document))
 parser=JSONLDMetadataParser(ROOT)
 try:
  parser._id_reference_validation(path)
 except ExceptionGroup as error:
  if error.message != "Validation failed.": raise
 issues=[issue.to_dict() for issue in parser.issues]
 cases.append({'name':name,'input':document,'expected':issues})
(HERE.parent/'expected/reference-cases.json').write_text(json.dumps(cases,indent=2)+'\n')
print(len(cases),'reference oracle cases written')
