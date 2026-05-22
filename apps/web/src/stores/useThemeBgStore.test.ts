import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useThemeBgStore,
  THEME_BG_OPACITY_DEFAULT,
  THEME_BG_OPACITY_MIN,
  THEME_BG_OPACITY_MAX,
  THEME_BG_BLUR_DEFAULT,
  THEME_BG_BLUR_MIN,
  THEME_BG_BLUR_MAX,
  THEME_BG_DIM_DEFAULT,
  THEME_BG_DIM_MIN,
  THEME_BG_DIM_MAX,
} from './useThemeBgStore';

const STORE_KEY = 'shiranami.theme-bg-store';

function readPersisted(): Record<string, unknown> {
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) return {};
  const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
  return parsed.state ?? {};
}

describe('useThemeBgStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useThemeBgStore.setState({
      bgOpacity: THEME_BG_OPACITY_DEFAULT,
      bgBlur: THEME_BG_BLUR_DEFAULT,
      bgDim: THEME_BG_DIM_DEFAULT,
    });
  });

  it('ships defaults that leave the built-in background visually unchanged', () => {
    // opacity=1, blur=0px, dim=0 means the new vars are no-ops: the background
    // looks identical to before the customization feature shipped.
    expect(THEME_BG_OPACITY_DEFAULT).toBe(1);
    expect(THEME_BG_BLUR_DEFAULT).toBe(0);
    expect(THEME_BG_DIM_DEFAULT).toBe(0);
  });

  it('clamps opacity above max and persists', () => {
    useThemeBgStore.getState().setBgOpacity(2);
    expect(useThemeBgStore.getState().bgOpacity).toBe(THEME_BG_OPACITY_MAX);
    expect(readPersisted().bgOpacity).toBe(THEME_BG_OPACITY_MAX);
  });

  it('clamps opacity below min', () => {
    useThemeBgStore.getState().setBgOpacity(-1);
    expect(useThemeBgStore.getState().bgOpacity).toBe(THEME_BG_OPACITY_MIN);
  });

  it('coerces non-finite opacity to the default', () => {
    // @ts-expect-error — runtime guard test
    useThemeBgStore.getState().setBgOpacity('broken');
    expect(useThemeBgStore.getState().bgOpacity).toBe(THEME_BG_OPACITY_DEFAULT);
  });

  it('clamps blur above max and persists', () => {
    useThemeBgStore.getState().setBgBlur(99);
    expect(useThemeBgStore.getState().bgBlur).toBe(THEME_BG_BLUR_MAX);
    expect(readPersisted().bgBlur).toBe(THEME_BG_BLUR_MAX);
  });

  it('clamps blur below min', () => {
    useThemeBgStore.getState().setBgBlur(-5);
    expect(useThemeBgStore.getState().bgBlur).toBe(THEME_BG_BLUR_MIN);
  });

  it('clamps dim to both ends of its range and persists', () => {
    useThemeBgStore.getState().setBgDim(5);
    expect(useThemeBgStore.getState().bgDim).toBe(THEME_BG_DIM_MAX);
    expect(readPersisted().bgDim).toBe(THEME_BG_DIM_MAX);
    useThemeBgStore.getState().setBgDim(-1);
    expect(useThemeBgStore.getState().bgDim).toBe(THEME_BG_DIM_MIN);
  });

  it('writes the CSS custom properties on the document root', () => {
    useThemeBgStore.getState().setBgOpacity(0.5);
    useThemeBgStore.getState().setBgBlur(8);
    useThemeBgStore.getState().setBgDim(0.3);
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--theme-bg-opacity')).toBe('0.5');
    expect(root.style.getPropertyValue('--theme-bg-blur')).toBe('8px');
    expect(root.style.getPropertyValue('--theme-bg-dim')).toBe('0.3');
  });

  it('resetBg restores all three values to defaults', () => {
    useThemeBgStore.getState().setBgOpacity(0.4);
    useThemeBgStore.getState().setBgBlur(12);
    useThemeBgStore.getState().setBgDim(0.7);
    useThemeBgStore.getState().resetBg();
    expect(useThemeBgStore.getState().bgOpacity).toBe(THEME_BG_OPACITY_DEFAULT);
    expect(useThemeBgStore.getState().bgBlur).toBe(THEME_BG_BLUR_DEFAULT);
    expect(useThemeBgStore.getState().bgDim).toBe(THEME_BG_DIM_DEFAULT);
  });
});

describe('useThemeBgStore rehydration sanitizing', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('clamps malformed persisted values on load', async () => {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ state: { bgOpacity: 5, bgBlur: 'broken', bgDim: -3 }, version: 1 })
    );

    const mod = await import('./useThemeBgStore');
    const state = mod.useThemeBgStore.getState();
    expect(state.bgOpacity).toBe(mod.THEME_BG_OPACITY_MAX); // 5 -> clamped to 1
    expect(state.bgBlur).toBe(mod.THEME_BG_BLUR_DEFAULT); // 'broken' -> default
    expect(state.bgDim).toBe(mod.THEME_BG_DIM_MIN); // -3 -> clamped to 0
  });
});
