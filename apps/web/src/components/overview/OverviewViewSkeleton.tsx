/** Loading placeholder mirroring the Overview layout (hero, stats, two-column row, rail). */
export function OverviewViewSkeleton() {
  return (
    <div className="flex w-full flex-col gap-6 px-6 pb-10 pt-6" aria-hidden="true">
      <div className="h-44 animate-pulse rounded-[24px] border border-border/25 glass-panel" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-2xl border border-border/25 glass-subtle"
          />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <div className="h-80 animate-pulse rounded-[24px] border border-border/25 glass-panel" />
        <div className="flex flex-col gap-6">
          <div className="h-48 animate-pulse rounded-[24px] border border-border/25 glass-panel" />
          <div className="h-28 animate-pulse rounded-[24px] border border-border/25 glass-panel" />
        </div>
      </div>

      {/* Recommendations shelf skeleton — heading bar + 2× two-col rows per section */}
      <div className="flex flex-col gap-4 rounded-[24px] border border-border/25 glass-panel p-4">
        {/* Header: icon placeholder + title + refresh button */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="size-4 animate-pulse rounded-full bg-foreground/10" />
            <div className="h-5 w-36 animate-pulse rounded-lg bg-foreground/10" />
          </div>
          <div className="h-4 w-16 animate-pulse rounded-md bg-foreground/8" />
        </div>
        {/* Library section */}
        <div className="flex flex-col gap-2">
          <div className="h-3 w-28 animate-pulse rounded bg-foreground/8" />
          <div className="grid gap-2 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-14 animate-pulse rounded-2xl border border-border/15 glass-subtle"
              />
            ))}
          </div>
        </div>
        {/* Discover section */}
        <div className="flex flex-col gap-2">
          <div className="h-3 w-32 animate-pulse rounded bg-foreground/8" />
          <div className="grid gap-2 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-14 animate-pulse rounded-2xl border border-border/15 glass-subtle"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
