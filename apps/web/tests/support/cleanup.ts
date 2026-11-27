export async function closeAll(closers:Array<() => void | Promise<void> | undefined>):Promise<void> {
  const failures:unknown[] = []
  for (const close of closers) {
    try {await close()} catch (error) {failures.push(error)}
  }
  if (failures.length) throw new AggregateError(failures, 'Reference journey cleanup failed')
}
