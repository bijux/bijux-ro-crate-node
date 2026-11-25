import assert from 'node:assert/strict'
import {test} from 'node:test'
import {evaluateVocabularyEvidence} from '../../src/index.js'

const human = {source:'OLS', identifier:'NCBITaxon:9606', label:'Homo sapiens', synonyms:['human'], obsolete:false, retrievedAt:'2026-11-25T00:00:00Z'} as const

test('exact evidence distinguishes mismatch, synonyms and obsolete values', () => {
  assert.equal(evaluateVocabularyEvidence({identifier:'NCBITaxon:9606', label:'Drosophila melanogaster'}, {status:'found', term:human}).status, 'mismatch')
  assert.equal(evaluateVocabularyEvidence({identifier:'NCBITaxon:9606', label:'human'}, {status:'found', term:human}, {allowSynonyms:true}).status, 'verified')
  assert.equal(evaluateVocabularyEvidence({identifier:'NCBITaxon:9606', label:'human'}, {status:'found', term:human}).status, 'mismatch')
  assert.equal(evaluateVocabularyEvidence({identifier:'NCBITaxon:9606', label:'Homo sapiens'}, {status:'found', term:{...human, obsolete:true}}).status, 'obsolete')
})

test('unknown, unavailable, descriptive and mismatched identifiers stay distinct', () => {
  assert.equal(evaluateVocabularyEvidence({identifier:'FBbi:99999999', label:'unknown'}, {status:'not-found'}).status, 'not-found')
  assert.equal(evaluateVocabularyEvidence({identifier:'FBbi:99999999', label:'unknown'}, {status:'unavailable'}).status, 'unavailable')
  assert.equal(evaluateVocabularyEvidence({identifier:'', label:'descriptive'}, {status:'unavailable'}).status, 'descriptive')
  assert.equal(evaluateVocabularyEvidence({identifier:'NCBITaxon:7227', label:'Homo sapiens'}, {status:'found', term:human}).status, 'mismatch')
})
