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
cases=[]
for name,graph in CASES:
 document={'@context':CONTEXT,'@graph':graph}
 path=ROOT/'ro-crate-metadata.json'
 path.write_text(json.dumps(document))
 parser=JSONLDMetadataParser(ROOT)
 parser._id_reference_validation(path)
 issues=[issue.to_dict() for issue in parser.issues]
 for issue in issues:
  issue['message']=issue['message'].replace(ROOT.as_uri()+'/', 'file:///crate/')
 cases.append({'name':name,'input':document,'expected':issues})
for name, graph in [('null graph', None)]:
 document={'@context':CONTEXT,'@graph':graph}
 path=ROOT/'ro-crate-metadata.json'
 path.write_text(json.dumps(document))
 parser=JSONLDMetadataParser(ROOT)
 parser._id_reference_validation(path)
 issues=[issue.to_dict() for issue in parser.issues]
 cases.append({'name':name,'input':document,'expected':issues})
(HERE.parent/'expected/reference-cases.json').write_text(json.dumps(cases,indent=2)+'\n')
print(len(cases),'reference oracle cases written')
