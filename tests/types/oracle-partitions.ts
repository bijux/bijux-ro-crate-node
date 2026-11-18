import {capturePartitions, corpusHash} from '../../scripts/reference/oracle-partitions.mjs'
import {assertInputBytes} from '../parity/inputs.mjs'

if (false) {
  const input = {name: 'case', files: {text: 'hello', bytes: [0, 255], buffer: new Uint8Array([1, 2])}}
  const receipt = {name: 'case', inputs_sha256: {text: 'digest'}, detail: true}
  assertInputBytes(input, receipt)
  void corpusHash([input])
  const result = capturePartitions({
    cases: [input], jobs: 1, reference: {commit: 'abc'},
    metadata: {python: '3', context_sha256: 'hash', versions: {dep: '1'}},
    run: () => ({commit: 'abc', python: '3', versions: {dep: '1'}, context_sha256: 'hash',
      imported_module: '/module', corpus_sha256: 'hash', cases: [receipt] as [typeof receipt], extra: 'preserved'}),
  })
  void result.then(capture => {
    const detail: boolean = capture.cases[0].detail
    const extra: string = capture.extra
    // @ts-expect-error Merging partitions produces an array, not the input tuple.
    const singleton: [typeof receipt] = capture.cases
    void singleton
    return [detail, extra]
  })
  // @ts-expect-error Input bytes must use a hashable representation.
  assertInputBytes({name: 'bad', files: {bad: {value: 1}}}, receipt)
}
