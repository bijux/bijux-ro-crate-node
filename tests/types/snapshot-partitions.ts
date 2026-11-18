import {aggregateSnapshotPartitions} from '../parity/snapshot-partitions.mjs'

type Report = Parameters<typeof aggregateSnapshotPartitions>[1][number]
declare const reports: Array<Report & {extra: 42; actual_executed_case_names: ['original']}>
declare const binding: Parameters<typeof aggregateSnapshotPartitions>[2]
if (false) {
  const aggregate = aggregateSnapshotPartitions([{name: 'case'}], reports, binding)
  const extra: 42 = aggregate.extra
  const total: number = aggregate.total
  // @ts-expect-error Aggregation creates a fresh case-name array.
  const original: ['original'] = aggregate.actual_executed_case_names
  // @ts-expect-error Aggregation computes numeric totals.
  const invalid: string = aggregate.total
  void [extra, total, original, invalid]
}
