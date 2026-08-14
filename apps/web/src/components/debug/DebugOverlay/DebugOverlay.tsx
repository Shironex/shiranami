// Dev-only CPU/Perf Debug Panel overlay. A fixed-position translucent panel
// summarizing backend per-process CPU/memory, renderer FPS/frame time/JS heap,
// React commit attribution, the active timer registry, per-store update Hz, and
// a long-task feed.
//
// All store reads live in `useDebugOverlay`; the shell only formats the
// snapshot into rows. Only mounted while `open` is true (see App.tsx), so when
// closed it adds zero cost. The main sampler is driven by
// `useDebugInstrumentation`.
//
// The backend section shows `procs` and nothing else, which is the whole of
// what `debug:metrics` now carries. v1 also had a "Main process" block with
// `process.getCPUUsage()` and V8 heap statistics; there is no V8 in the backend
// to report a heap for, and that block was dropped rather than filled with
// zeros — a synthesised `0 KB` reads as a measurement. Its useful half, the
// main process's own CPU and memory, is the `main` row of the table. See
// `lib/bridge/namespaces/debug.ts` for the recorded shape change.

import { cn } from '@/lib/utils';
import { useDebugOverlay } from './DebugOverlay.hooks';

function formatKb(kb: number): string {
  if (kb >= 1024 * 1024) return `${(kb / 1024 / 1024).toFixed(1)} GB`;
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${Math.round(kb)} KB`;
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return 'n/a';
  return formatKb(bytes / 1024);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-white/10 px-3 py-2 last:border-b-0">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">
        {title}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-white/50">{label}</span>
      <span className={cn('font-mono tabular-nums', warn ? 'text-warning' : 'text-white/90')}>
        {value}
      </span>
    </div>
  );
}

export default function DebugOverlay() {
  const { main, renderer, longTasks, close } = useDebugOverlay();

  const procRows = main?.procs.map(p => (
    <tr
      key={p.pid}
      className={cn(p.kind === 'main' && 'text-cyan-300', p.cpu >= 25 && 'text-warning')}
    >
      <td className="text-left">{p.kind}</td>
      <td className="text-right">{p.pid}</td>
      <td className="text-right">{p.cpu.toFixed(1)}</td>
      <td className="text-right">{formatKb(p.mem)}</td>
    </tr>
  ));

  const commitRows = renderer.renderStats.map(s => (
    <tr key={s.id} className={cn(s.commits >= 30 && 'text-warning')}>
      <td className="text-left">{s.id}</td>
      <td className="text-right">{s.commits}</td>
      <td className="text-right">{s.totalDuration.toFixed(1)}</td>
    </tr>
  ));

  const rafOriginItems = renderer.timers?.rafOrigins.map(o => (
    <li key={o.id} className="truncate">
      ↳ {o.origin}
    </li>
  ));
  const hasRafOrigins = Boolean(renderer.timers && renderer.timers.rafOrigins.length > 0);

  const storeHzItems = Object.entries(renderer.storeHz).map(([name, hz]) => (
    <Stat key={name} label={name} value={`${hz}`} warn={hz >= 10} />
  ));
  const hasStoreHz = storeHzItems.length > 0;

  const longTaskItems = longTasks.map((t, i) => (
    <li
      key={`${t.ts}-${i}`}
      className={cn(
        'flex justify-between gap-2',
        t.duration >= 100 ? 'text-destructive' : 'text-warning'
      )}
    >
      <span className="truncate">
        {t.kind}
        {t.name ? `: ${t.name}` : ''}
      </span>
      <span className="tabular-nums">{t.duration} ms</span>
    </li>
  ));

  const fpsWarn = renderer.fps > 0 && renderer.fps < 50;

  return (
    <div
      className="fixed right-3 top-3 z-[10000] flex max-h-[90vh] w-[340px] flex-col overflow-hidden rounded-lg border border-white/15 bg-black/80 text-[11px] leading-tight text-white shadow-2xl backdrop-blur-md"
      role="dialog"
      aria-label="Performance debug panel"
    >
      <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-3 py-1.5">
        <span className="font-semibold tracking-wide">Perf Debug</span>
        <button
          type="button"
          onClick={close}
          className="rounded px-1.5 text-white/50 hover:bg-white/10 hover:text-white"
          aria-label="Close debug panel"
        >
          esc
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <Section title="Processes (backend)">
          {main ? (
            <table className="w-full font-mono tabular-nums">
              <thead>
                <tr className="text-white/40">
                  <th className="text-left font-normal">kind</th>
                  <th className="text-right font-normal">pid</th>
                  <th className="text-right font-normal">cpu%</th>
                  <th className="text-right font-normal">mem</th>
                </tr>
              </thead>
              <tbody>{procRows}</tbody>
            </table>
          ) : (
            <div className="text-white/40">waiting for samples…</div>
          )}
        </Section>

        <Section title="Renderer">
          <Stat label="fps" value={`${renderer.fps}`} warn={fpsWarn} />
          <Stat
            label="frame p95"
            value={`${renderer.frameP95.toFixed(1)} ms`}
            warn={renderer.frameP95 > 20}
          />
          <Stat label="js heap" value={formatBytes(renderer.jsHeap)} />
        </Section>

        <Section title="React commits">
          {renderer.renderStats.length > 0 ? (
            <table className="w-full font-mono tabular-nums">
              <thead>
                <tr className="text-white/40">
                  <th className="text-left font-normal">id</th>
                  <th className="text-right font-normal">commits</th>
                  <th className="text-right font-normal">ms</th>
                </tr>
              </thead>
              <tbody>{commitRows}</tbody>
            </table>
          ) : (
            <div className="text-white/40">no commits in window</div>
          )}
        </Section>

        <Section title="Timers">
          {renderer.timers ? (
            <>
              <Stat label="active rAF" value={`${renderer.timers.activeRaf}`} />
              <Stat label="active intervals" value={`${renderer.timers.activeIntervals}`} />
              <Stat label="active timeouts" value={`${renderer.timers.activeTimeouts}`} />
              {hasRafOrigins && (
                <ul className="mt-1 space-y-0.5 font-mono text-[10px] text-white/50">
                  {rafOriginItems}
                </ul>
              )}
            </>
          ) : (
            <div className="text-white/40">registry not installed</div>
          )}
        </Section>

        <Section title="Store updates (Hz)">
          {hasStoreHz ? (
            <div className="space-y-0.5">{storeHzItems}</div>
          ) : (
            <div className="text-white/40">no tracked updates</div>
          )}
        </Section>

        <Section title="Long tasks / slow events">
          {longTasks.length > 0 ? (
            <ul className="space-y-0.5 font-mono text-[10px]">{longTaskItems}</ul>
          ) : (
            <div className="text-white/40">none over 50 ms</div>
          )}
        </Section>
      </div>
    </div>
  );
}
