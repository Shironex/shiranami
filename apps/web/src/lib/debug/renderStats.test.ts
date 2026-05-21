import { beforeEach, describe, expect, it } from 'vitest';
import { recordRender, sampleRenderStats, resetRenderStats } from './renderStats';

describe('renderStats', () => {
  beforeEach(() => {
    resetRenderStats();
  });

  it('aggregates commits and durations per id', () => {
    recordRender('player', 2);
    recordRender('player', 4);
    recordRender('visualizer', 1);

    const stats = sampleRenderStats();
    const player = stats.find(s => s.id === 'player');
    const visualizer = stats.find(s => s.id === 'visualizer');

    expect(player).toEqual({ id: 'player', commits: 2, totalDuration: 6, maxDuration: 4 });
    expect(visualizer).toEqual({ id: 'visualizer', commits: 1, totalDuration: 1, maxDuration: 1 });
  });

  it('sorts by commit count descending', () => {
    recordRender('a', 1);
    recordRender('b', 1);
    recordRender('b', 1);
    recordRender('c', 1);
    recordRender('c', 1);
    recordRender('c', 1);

    const ids = sampleRenderStats().map(s => s.id);
    expect(ids).toEqual(['c', 'b', 'a']);
  });

  it('resets the window after sampling', () => {
    recordRender('player', 5);
    sampleRenderStats();
    expect(sampleRenderStats()).toEqual([]);
  });

  it('tracks the largest single commit as maxDuration', () => {
    recordRender('x', 3);
    recordRender('x', 9);
    recordRender('x', 1);
    expect(sampleRenderStats()[0].maxDuration).toBe(9);
  });
});
