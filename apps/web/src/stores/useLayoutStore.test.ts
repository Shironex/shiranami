import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useLayoutStore,
  SIDE_PANEL_SIDE_DEFAULT,
  VISUALIZER_POSITION_DEFAULT,
} from './useLayoutStore';

const STORE_KEY = 'shiranami.layout-store';

function readPersisted(): Record<string, unknown> {
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) return {};
  const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
  return parsed.state ?? {};
}

describe('useLayoutStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useLayoutStore.setState({
      sidePanelSide: SIDE_PANEL_SIDE_DEFAULT,
      visualizerPosition: VISUALIZER_POSITION_DEFAULT,
    });
  });

  it('defaults to the current layout (panel right, visualizer bottom)', () => {
    expect(useLayoutStore.getState().sidePanelSide).toBe('right');
    expect(useLayoutStore.getState().visualizerPosition).toBe('bottom');
  });

  it('setSidePanelSide moves the panel and persists', () => {
    useLayoutStore.getState().setSidePanelSide('left');
    expect(useLayoutStore.getState().sidePanelSide).toBe('left');
    expect(readPersisted().sidePanelSide).toBe('left');
  });

  it('setVisualizerPosition moves the strip and persists', () => {
    useLayoutStore.getState().setVisualizerPosition('top');
    expect(useLayoutStore.getState().visualizerPosition).toBe('top');
    expect(readPersisted().visualizerPosition).toBe('top');
  });

  it('setters coerce garbage input to the defaults', () => {
    useLayoutStore.getState().setSidePanelSide('left');
    useLayoutStore.getState().setSidePanelSide('diagonal' as never);
    expect(useLayoutStore.getState().sidePanelSide).toBe('right');

    useLayoutStore.getState().setVisualizerPosition('top');
    useLayoutStore.getState().setVisualizerPosition('sideways' as never);
    expect(useLayoutStore.getState().visualizerPosition).toBe('bottom');
  });

  it('resetLayout restores both defaults', () => {
    useLayoutStore.getState().setSidePanelSide('left');
    useLayoutStore.getState().setVisualizerPosition('top');
    useLayoutStore.getState().resetLayout();
    expect(useLayoutStore.getState().sidePanelSide).toBe('right');
    expect(useLayoutStore.getState().visualizerPosition).toBe('bottom');
  });
});

describe('useLayoutStore rehydration sanitizing', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('drops garbage persisted values on load', async () => {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ state: { sidePanelSide: 'diagonal', visualizerPosition: 42 }, version: 1 })
    );
    const mod = await import('./useLayoutStore');
    expect(mod.useLayoutStore.getState().sidePanelSide).toBe('right');
    expect(mod.useLayoutStore.getState().visualizerPosition).toBe('bottom');
  });

  it('keeps valid persisted values on load', async () => {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ state: { sidePanelSide: 'left', visualizerPosition: 'top' }, version: 1 })
    );
    const mod = await import('./useLayoutStore');
    expect(mod.useLayoutStore.getState().sidePanelSide).toBe('left');
    expect(mod.useLayoutStore.getState().visualizerPosition).toBe('top');
  });

  it('survives a non-object persisted state', async () => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ state: 'corrupted', version: 1 }));
    const mod = await import('./useLayoutStore');
    expect(mod.useLayoutStore.getState().sidePanelSide).toBe('right');
    expect(mod.useLayoutStore.getState().visualizerPosition).toBe('bottom');
  });
});
