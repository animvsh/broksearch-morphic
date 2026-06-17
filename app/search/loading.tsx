export default function Loading() {
  const steps = ['Searching web', 'Reading sources', 'Writing answer']

  return (
    <main
      className="flex min-h-[calc(100dvh-4rem)] w-full flex-col items-center"
      aria-label="Preparing search answer"
    >
      <section className="w-full max-w-3xl px-4 pb-28 pt-8 sm:px-6">
        <div className="mb-5 flex justify-end">
          <div className="h-10 w-44 animate-pulse rounded-2xl border border-zinc-200 bg-white shadow-[0_14px_40px_-34px_rgba(15,23,42,0.35)]" />
        </div>

        <div
          className="rounded-2xl border border-zinc-200 bg-white/85 p-4 shadow-[0_18px_44px_-32px_rgba(15,23,42,0.18)]"
          data-testid="search-route-loading"
        >
          <div className="mb-3 flex items-center gap-2 text-xs font-medium text-zinc-600">
            <span className="size-2 animate-pulse rounded-full bg-zinc-950" />
            <span>Preparing your answer</span>
          </div>
          <ol className="grid gap-2 text-xs sm:grid-cols-3">
            {steps.map((step, index) => (
              <li
                key={step}
                className="flex items-center gap-2 rounded-xl border border-zinc-200/80 bg-zinc-50 px-3 py-2 text-zinc-700"
              >
                <span
                  className={[
                    'inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
                    index === 0
                      ? 'bg-zinc-950 text-white'
                      : 'bg-white text-zinc-500'
                  ].join(' ')}
                >
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-4 flex gap-2 overflow-hidden" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="flex h-10 w-32 shrink-0 animate-pulse items-center gap-2 rounded-full border border-zinc-200 bg-white px-3"
            >
              <span className="size-4 rounded-full bg-zinc-100" />
              <span className="h-2 w-16 rounded-full bg-zinc-100" />
            </div>
          ))}
        </div>

        <article className="mt-4 rounded-2xl border border-zinc-200 bg-white/95 p-5 shadow-[0_24px_60px_-44px_rgba(15,23,42,0.28)]">
          <div className="mb-4 flex items-center gap-2 text-xs text-zinc-500">
            <span className="size-3 rounded-full bg-zinc-100" />
            <span>Drafting answer from sources</span>
          </div>
          <div className="space-y-3">
            <div className="h-3 w-11/12 animate-pulse rounded-full bg-zinc-100" />
            <div className="h-3 w-full animate-pulse rounded-full bg-zinc-100" />
            <div className="h-3 w-9/12 animate-pulse rounded-full bg-zinc-100" />
            <div className="h-3 w-10/12 animate-pulse rounded-full bg-zinc-100" />
          </div>
        </article>
      </section>
    </main>
  )
}
