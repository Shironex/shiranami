import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import type { MainMetricsSnapshot } from '@shiranami/contracts';
import { useDebugStore, type RendererMetrics } from '@/stores/useDebugStore';

import DebugOverlay from './DebugOverlay';

function makeMain(): MainMetricsSnapshot {
  return {
    ts: Date.now(),
    cpu: { percentCPUUsage: 8.4, idleWakeupsPerSecond: 120 },
    heap: { totalHeapSize: 81920, usedHeapSize: 53248, heapSizeLimit: 2097152 },
    procs: [
      { type: 'Browser', pid: 1001, cpu: 4.2, mem: 122880 },
      { type: 'GPU', pid: 1002, cpu: 31.7, mem: 65536 },
      { type: 'Renderer', pid: 1003, cpu: 12.1, mem: 204800 },
    ],
  };
}

function makeRenderer(): RendererMetrics {
  return {
    fps: 58,
    frameP95: 14.3,
    jsHeap: 48 * 1024 * 1024,
    timers: {
      activeRaf: 2,
      activeIntervals: 1,
      activeTimeouts: 0,
      rafOrigins: [
        { id: 1, origin: 'useAudioEngine.ts:422' },
        { id: 2, origin: 'VisualizerStrip.tsx:30' },
      ],
      intervalOrigins: [],
    },
    renderStats: [
      { id: 'player', commits: 42, totalDuration: 18.4, maxDuration: 2.1 },
      { id: 'library', commits: 9, totalDuration: 4.2, maxDuration: 1.0 },
    ],
    storeHz: { playback: 12, queue: 3 },
  };
}

/** Seed the debug store the overlay reads from. */
function seed(main: MainMetricsSnapshot | null, renderer: RendererMetrics): void {
  useDebugStore.setState({
    open: true,
    main,
    renderer,
    longTasks: [
      { ts: Date.now(), kind: 'longtask', duration: 132, name: '' },
      { ts: Date.now(), kind: 'event', duration: 64, name: 'pointermove' },
    ],
  });
}

/**
 * debug · DebugOverlay. The dev-only performance panel: a fixed translucent
 * `role="dialog"` named "Performance debug panel" with a Close button, listing
 * main-process per-process CPU/memory, renderer FPS/frame-time/JS-heap, React
 * commit attribution, the active timer registry, per-store update Hz, and a
 * long-task feed. Reads everything from `useDebugStore`; shows "waiting for
 * samples…" placeholders until the first snapshot lands. Stories seed the store.
 */
const meta: Meta<typeof DebugOverlay> = {
  title: 'debug/DebugOverlay',
  component: DebugOverlay,
  // This is a dev-only diagnostic overlay deliberately styled as low-opacity
  // white-on-near-black mono text (text-white/40–50 on bg-black/80) for an
  // unobtrusive HUD. axe flags that muted text on color-contrast; raising the
  // opacity to pass would change the intentional HUD aesthetic and the overlay
  // never ships to end users, so a11y is left at the global 'todo' default here
  // rather than ratcheted to 'error'. The dialog/button names are still asserted
  // in `play`.
};

export default meta;

type Story = StoryObj<typeof DebugOverlay>;

/** A full snapshot — every section populated with main + renderer metrics. */
export const Default: Story = {
  beforeEach: () => {
    seed(makeMain(), makeRenderer());
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The panel is a labelled dialog with a named close affordance.
    await expect(
      canvas.getByRole('dialog', { name: 'Performance debug panel' })
    ).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Close debug panel' })).toBeInTheDocument();
    // Seeded main-process rows render their per-process figures.
    await expect(canvas.getByText('GPU')).toBeInTheDocument();
    await expect(canvas.getByText('31.7')).toBeInTheDocument();
  },
};

/** No main-process sample yet — the placeholders stand in for live metrics. */
export const AwaitingSamples: Story = {
  beforeEach: () => {
    seed(null, {
      fps: 0,
      frameP95: 0,
      jsHeap: null,
      timers: null,
      renderStats: [],
      storeHz: {},
    });
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('dialog', { name: 'Performance debug panel' })
    ).toBeInTheDocument();
    await expect(canvas.getByText('waiting for samples…')).toBeInTheDocument();
  },
};
