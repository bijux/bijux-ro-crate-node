"""Check the complete request fence and restore the only corrected class method."""
import copy
import json
from pathlib import Path
import unittest
from unittest.mock import patch
from bia_ro_crate.core.parser.jsonld_metadata_parser import JSONLDMetadataParser
from bia_ro_crate.models.linked_data.ld_context.SimpleJSONLDContext import SimpleJSONLDContext
import corrected
request = json.loads((Path(__file__).parent / 'inputs.json').read_bytes())

def run_case(case):
    return case

class ModelTypePrefixTests(unittest.TestCase):
    def test_scope(self):
        corrected.registered_request(request)
        for mutate in [lambda x:x['cases'].pop(),lambda x:x['cases'].reverse(),
            lambda x:x['cases'][0].update(name='unknown'),
            lambda x:x['cases'][0]['files'].update(extra='extra'),
            lambda x:x['cases'][0]['files'].update({'ro-crate-metadata.json':x['cases'][0]['files']['ro-crate-metadata.json']+' '}),
            lambda x:x['cases'][0].update(contexts={'https://example.org/other':{'@context':{}}})]:
            value=copy.deepcopy(request);mutate(value)
            with self.assertRaises(AssertionError):corrected.registered_request(value)

    def test_restoration_and_wrong_role(self):
        original=JSONLDMetadataParser._parse_context
        expand=JSONLDMetadataParser._expand_entity
        serialize=SimpleJSONLDContext.to_dict
        before=globals()['run_case']
        with self.assertRaisesRegex(RuntimeError,'bounded failure'):
            with corrected.model_type_prefixes({'run_case':before},request):
                self.assertIs(JSONLDMetadataParser._expand_entity,expand)
                self.assertIs(SimpleJSONLDContext.to_dict,serialize)
                with self.assertRaisesRegex(AssertionError,'Wrong model-context'):
                    JSONLDMetadataParser._parse_context(None,{})
                raise RuntimeError('bounded failure')
        self.assertIs(JSONLDMetadataParser._parse_context,original)
        self.assertIs(JSONLDMetadataParser._expand_entity,expand)
        self.assertIs(SimpleJSONLDContext.to_dict,serialize)
        self.assertIs(globals()['run_case'],before)

    def test_missing_calls_and_source_pin(self):
        original=JSONLDMetadataParser._parse_context
        before=globals()['run_case']
        with self.assertRaises(AssertionError):
            with corrected.model_type_prefixes({'run_case':before},request):pass
        self.assertIs(JSONLDMetadataParser._parse_context,original)
        with patch.object(corrected,'source_identity',return_value={}):
            with self.assertRaisesRegex(AssertionError,'Pinned model-context'):
                with corrected.model_type_prefixes({'run_case':before},request):pass

if __name__=='__main__':unittest.main()
