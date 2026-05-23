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

      <div className="h-44 animate-pulse rounded-[24px] border border-border/25 glass-panel" />
    </div>
  );
}
