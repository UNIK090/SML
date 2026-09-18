// Route-level loading UI.
// Shown while the dashboard chunk is fetched — a branded skeleton rather than a
// blank screen, so the app always looks like it is doing something deliberate.

export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="top-progress" />
      <div className="mx-auto flex min-h-screen max-w-[1500px]">
        <aside className="hidden w-72 shrink-0 border-r border-hairline bg-sidebar p-5 lg:block">
          <div className="mb-8 flex items-center gap-3">
            <div className="shimmer size-10 rounded-xl bg-secondary" />
            <div className="flex-1">
              <div className="shimmer mb-1.5 h-3.5 w-32 rounded bg-secondary" />
              <div className="shimmer h-3 w-20 rounded bg-secondary" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="shimmer h-14 rounded-xl bg-secondary" />
            ))}
          </div>
        </aside>
        <div className="flex-1">
          <div className="border-b border-hairline bg-card/70 px-6 py-4">
            <div className="shimmer h-4 w-28 rounded bg-secondary" />
          </div>
          <div className="px-6 py-7">
            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="card-shadow rounded-2xl border-hairline bg-card p-5">
                  <div className="shimmer mb-4 h-3.5 w-20 rounded bg-secondary" />
                  <div className="shimmer mb-2 h-7 w-28 rounded bg-secondary" />
                  <div className="shimmer h-3 w-24 rounded bg-secondary" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
