/** Pandas floors the width quotient before selecting its low-memory chunk. */
export function lowMemoryChunkSize(width) {
  const limit = Math.floor(2 ** 20 / width)
  let rows = 1
  while (rows * 2 < limit) rows *= 2
  return rows
}
