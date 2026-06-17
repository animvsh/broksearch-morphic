export async function runWithConcurrencyLimit<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return []

  const limit = Math.max(1, Math.min(Math.floor(concurrency), items.length))
  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function runNext(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await worker(items[currentIndex], currentIndex)
    }
  }

  await Promise.all(Array.from({ length: limit }, () => runNext()))
  return results
}
