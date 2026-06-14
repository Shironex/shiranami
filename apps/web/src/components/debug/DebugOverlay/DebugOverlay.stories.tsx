import type { Meta, StoryObj } from '@storybook/react-vite';
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

const meta: Meta<typeof DebugOverlay> = {
  title: 'debug/DebugOverlay',
  component: DebugOverlay,
};

export default meta;

type Story = StoryObj<typeof DebugOverlay>;

export const Default: Story = {
  decorators: [
    Story => {
      seed(makeMain(), makeRenderer());
      return <Story />;
    },
  ],
};

export const AwaitingSamples: Story = {
  decorators: [
    Story => {
      seed(null, {
        fps: 0,
        frameP95: 0,
        jsHeap: null,
        timers: null,
        renderStats: [],
        storeHz: {},
      });
      return <Story />;
    },
  ],
};
