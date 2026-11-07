"""Record the pinned Python context/model parser on JSON-LD edge cases."""
import copy
import json
import re
import importlib.metadata
from pathlib import Path
from pyld import jsonld
for name, version in {'pydantic': '2.12.5', 'pydantic-core': '2.41.5', 'PyLD': '2.0.4', 'rdflib': '7.6.0'}.items():
    actual = importlib.metadata.version(name)
    if actual != version:
        raise RuntimeError(f'Expected poetry.lock {name}=={version}, found {actual}')

from bia_ro_crate.core.parser.jsonld_metadata_parser import JSONLDMetadataParser
from bia_ro_crate.models import ro_crate_models

HERE=Path(__file__).parent
ROOT=HERE.parents[2]
context_doc=json.loads((HERE.parent/'context.json').read_text())
jsonld.set_document_loader(lambda url, options=None: {'contextUrl':None,'documentUrl':url,'document':context_doc})
base=json.loads((HERE.parent/'fixtures/test_minimal_valid_ro_crate/ro-crate-metadata.json').read_text())
cases=[]
def record(name, document):
 parser=JSONLDMetadataParser('.')
 result={}
 try:
  context=parser._parse_context(document['@context'])
  entities=parser._parse_objects(document['@graph'],context)
  result['entities']={id:entity.model_dump(mode='json',by_alias=True) for id,entity in entities.items()}
  result['modelTypes']={id:type(entity).__name__ for id,entity in entities.items()}
 except Exception as error:
  if not parser._parse_issues:
   result['exception']=type(error).__name__
 result['issues']=[issue.to_dict() for issue in parser._parse_issues]
 cases.append({'name':name,'input':document,'expected':result})
record('standard compact context',base)
for name, update in [
 ('remapped term',{'accessionId':'http://example.org/accession'}),
 ('null term',{'accessionId':None}),
 ('same URI reverse',{'name':{'@reverse':'http://schema.org/name'}}),
 ('remapped prefix',{'bia':'http://example.org/bia/'}),
 ('term converted to prefix',{'accessionId':'http://example.org/'}),
 ('term mapped with explicit prefix false',{'name':{'@id':'http://example.org/','@prefix':False}}),
 ('unknown term',{'unrecognized':'http://example.org/unrecognized'}),
 ('keyword aliases',{'identifier':'@id','kind':'@type'}),
 ('term mapped to keyword',{'name':'@id'}),
]:
 document=copy.deepcopy(base)
 document['@context'].append(update)
 record(name,document)
for name,entity in [
 ('compact URI type',{'@id':'#p','@type':'bia:Publication'}),
 ('expanded URI type',{'@id':'#p','@type':'http://bia/Publication'}),
 ('unknown type',{'@id':'#p','@type':'SomethingElse'}),
 ('missing type',{'@id':'#p','name':'Person'}),
 ('missing ID',{'@type':'bia:Publication'}),
 ('blank node ID',{'@id':'_:blank','@type':'bia:Publication'}),
 ('extra properties',{'@id':'#p','@type':'bia:Publication','extra':{'@id':'#extra'}}),
 ('aliased ID',{'identifier':'#p','@type':'bia:Publication'}),
 ('aliased type',{'@id':'#p','kind':'bia:Publication'}),
 ('multiple model types',{'@id':'#p','@type':['bia:Publication','bia:Contributor']}),
 ('JSON-LD set value',{'@id':'#p','@type':'bia:Contributor','name':{'@value':'Some Name'}}),
]:
 document=copy.deepcopy(base)
 document['@context'].append({'identifier':'@id','kind':'@type'})
 document['@graph']=[entity]
 record(name,document)
record('vocab discarded for model expansion', {'@context': {'@vocab':'http://bia/'}, '@graph':[{'@id':'#p','@type':'Publication'}]})
record('base discarded for model error IDs', {'@context': {'@base':'https://example.org/base','bia':'http://bia/'}, '@graph':[{'@id':'#p','@type':'bia:Contributor'}]})
raw = ROOT/'artifacts/reference/metadata-probes-raw.json'
raw.parent.mkdir(parents=True, exist_ok=True)
raw.write_text(json.dumps(cases, indent=2)+'\n')
# Type members come from an RDF set. Retain raw capture above, then canonicalize
# only that demonstrated ordering difference for reproducible committed probes.
pattern = re.compile(r'(@type of object does not contain exactly 1 BIA classes\. @type contains: )(.*)(, matching \d+ BIA classes\.)', re.S)
for case in cases:
 for issue in case['expected']['issues']:
  match = pattern.fullmatch(issue['message'])
  if match:
   issue['message'] = match[1] + ', '.join(sorted(match[2].split(', '))) + match[3]
(HERE.parent/'expected/metadata-cases.json').write_text(json.dumps(cases,indent=2)+'\n')
print(len(cases),'metadata oracle cases written')
