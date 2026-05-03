import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useLyricsAppearanceStore,
  LYRICS_PLAIN_OPACITY_DEFAULT,
  LYRICS_PLAIN_OPACITY_MAX,
  LYRICS_PLAIN_OPACITY_MIN,
  LYRICS_PLAIN_FONT_SIZE_DEFAULT,
  LYRICS_SYNCED_DIM_OPACITY_DEFAULT,
  LYRICS_SYNCED_DIM_OPACITY_MAX,
  LYRICS_SYNCED_DIM_OPACITY_MIN,
  LYRICS_SYNCED_FONT_SIZE_DEFAULT,
  nextLyricsFontSize,
} from './useLyricsAppearanceStore';

const STORE_KEY = 'shiranami.lyrics-appearance-store';

function readPersisted(): Record<string, unknown> {
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) return {};
  const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
  return parsed.state ?? {};
}

describe('useLyricsAppearanceStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useLyricsAppearanceStore.setState({
      lyricsPlainOpacity: LYRICS_PLAIN_OPACITY_DEFAULT,
      lyricsPlainFontSize: LYRICS_PLAIN_FONT_SIZE_DEFAULT,
      lyricsSyncedDimOpacity: LYRICS_SYNCED_DIM_OPACITY_DEFAULT,
      lyricsSyncedFontSize: LYRICS_SYNCED_FONT_SIZE_DEFAULT,
    });
  });

  it('clamps lyrics plain opacity above max and rounds to step', () => {
    useLyricsAppearanceStore.getState().setLyricsPlainOpacity(2);
    expect(useLyricsAppearanceStore.getState().lyricsPlainOpacity).toBe(LYRICS_PLAIN_OPACITY_MAX);
    expect(readPersisted().lyricsPlainOpacity).toBe(LYRICS_PLAIN_OPACITY_MAX);
  });

  it('clamps lyrics plain opacity below min', () => {
    useLyricsAppearanceStore.getState().setLyricsPlainOpacity(0);
    expect(useLyricsAppearanceStore.getState().lyricsPlainOpacity).toBe(LYRICS_PLAIN_OPACITY_MIN);
  });

  it('rounds lyrics plain opacity to nearest step', () => {
    useLyricsAppearanceStore.getState().setLyricsPlainOpacity(0.873);
    // step = 0.05, 0.873 -> rounds to 0.85
    expect(useLyricsAppearanceStore.getState().lyricsPlainOpacity).toBeCloseTo(0.85, 2);
  });

  it('coerces invalid lyrics plain font size to default on setter', () => {
    // @ts-expect-error — runtime guard test
    useLyricsAppearanceStore.getState().setLyricsPlainFontSize('huge');
    expect(useLyricsAppearanceStore.getState().lyricsPlainFontSize).toBe(
      LYRICS_PLAIN_FONT_SIZE_DEFAULT
    );
  });

  it('persists lyrics plain font size when valid', () => {
    useLyricsAppearanceStore.getState().setLyricsPlainFontSize('lg');
    expect(useLyricsAppearanceStore.getState().lyricsPlainFontSize).toBe('lg');
    expect(readPersisted().lyricsPlainFontSize).toBe('lg');
  });

  it('resets lyrics plain appearance to defaults', () => {
    useLyricsAppearanceStore.getState().setLyricsPlainOpacity(0.6);
    useLyricsAppearanceStore.getState().setLyricsPlainFontSize('xl');
    useLyricsAppearanceStore.getState().resetLyricsPlainAppearance();
    expect(useLyricsAppearanceStore.getState().lyricsPlainOpacity).toBe(
      LYRICS_PLAIN_OPACITY_DEFAULT
    );
    expect(useLyricsAppearanceStore.getState().lyricsPlainFontSize).toBe(
      LYRICS_PLAIN_FONT_SIZE_DEFAULT
    );
  });

  it('clamps lyrics synced dim opacity above max and rounds to step', () => {
    useLyricsAppearanceStore.getState().setLyricsSyncedDimOpacity(2);
    expect(useLyricsAppearanceStore.getState().lyricsSyncedDimOpacity).toBe(
      LYRICS_SYNCED_DIM_OPACITY_MAX
    );
    expect(readPersisted().lyricsSyncedDimOpacity).toBe(LYRICS_SYNCED_DIM_OPACITY_MAX);
  });

  it('clamps lyrics synced dim opacity below min (down to 0.2 not 0.5)', () => {
    useLyricsAppearanceStore.getState().setLyricsSyncedDimOpacity(0);
    // Synced floor is lower than plain floor — synced lines may be very dim.
    expect(useLyricsAppearanceStore.getState().lyricsSyncedDimOpacity).toBe(
      LYRICS_SYNCED_DIM_OPACITY_MIN
    );
    expect(LYRICS_SYNCED_DIM_OPACITY_MIN).toBe(0.2);
  });

  it('rounds lyrics synced dim opacity to nearest step', () => {
    useLyricsAppearanceStore.getState().setLyricsSyncedDimOpacity(0.873);
    // step = 0.05, 0.873 -> rounds to 0.85
    expect(useLyricsAppearanceStore.getState().lyricsSyncedDimOpacity).toBeCloseTo(0.85, 2);
  });

  it('coerces invalid lyrics synced font size to default on setter', () => {
    // @ts-expect-error — runtime guard test
    useLyricsAppearanceStore.getState().setLyricsSyncedFontSize('huge');
    expect(useLyricsAppearanceStore.getState().lyricsSyncedFontSize).toBe(
      LYRICS_SYNCED_FONT_SIZE_DEFAULT
    );
  });

  it('persists lyrics synced font size when valid', () => {
    useLyricsAppearanceStore.getState().setLyricsSyncedFontSize('lg');
    expect(useLyricsAppearanceStore.getState().lyricsSyncedFontSize).toBe('lg');
    expect(readPersisted().lyricsSyncedFontSize).toBe('lg');
  });

  it('resetLyricsAppearance restores all four lyrics prefs to defaults', () => {
    useLyricsAppearanceStore.getState().setLyricsPlainOpacity(0.6);
    useLyricsAppearanceStore.getState().setLyricsPlainFontSize('xl');
    useLyricsAppearanceStore.getState().setLyricsSyncedDimOpacity(0.9);
    useLyricsAppearanceStore.getState().setLyricsSyncedFontSize('sm');
    useLyricsAppearanceStore.getState().resetLyricsAppearance();
    expect(useLyricsAppearanceStore.getState().lyricsPlainOpacity).toBe(
      LYRICS_PLAIN_OPACITY_DEFAULT
    );
    expect(useLyricsAppearanceStore.getState().lyricsPlainFontSize).toBe(
      LYRICS_PLAIN_FONT_SIZE_DEFAULT
    );
    expect(useLyricsAppearanceStore.getState().lyricsSyncedDimOpacity).toBe(
      LYRICS_SYNCED_DIM_OPACITY_DEFAULT
    );
    expect(useLyricsAppearanceStore.getState().lyricsSyncedFontSize).toBe(
      LYRICS_SYNCED_FONT_SIZE_DEFAULT
    );
  });

  it('nextLyricsFontSize bumps one step and caps at xl', () => {
    expect(nextLyricsFontSize('sm')).toBe('base');
    expect(nextLyricsFontSize('base')).toBe('lg');
    expect(nextLyricsFontSize('lg')).toBe('xl');
    expect(nextLyricsFontSize('xl')).toBe('xl');
  });
});

// The pre-split combined `shiranami.app-store` bucket used to hold lyrics
// state alongside the rest of the app prefs. The new lyrics store imports
// that data into its own bucket once on first load so existing users
// don't lose their saved appearance settings.
describe('useLyricsAppearanceStore one-shot import from legacy app-store', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('sanitizes malformed lyrics plain prefs from the legacy bucket', async () => {
    localStorage.setItem(
      'shiranami.app-store',
      JSON.stringify({
        state: { lyricsPlainOpacity: 'broken', lyricsPlainFontSize: 'huge' },
        version: 1,
      })
    );

    const mod = await import('./useLyricsAppearanceStore');
    const state = mod.useLyricsAppearanceStore.getState();
    expect(state.lyricsPlainOpacity).toBe(mod.LYRICS_PLAIN_OPACITY_DEFAULT);
    expect(state.lyricsPlainFontSize).toBe(mod.LYRICS_PLAIN_FONT_SIZE_DEFAULT);
  });

  it('falls back to synced lyrics defaults when the legacy bucket only has plain prefs', async () => {
    localStorage.setItem(
      'shiranami.app-store',
      JSON.stringify({
        state: { lyricsPlainOpacity: 0.85, lyricsPlainFontSize: 'lg' },
        version: 1,
      })
    );

    const mod = await import('./useLyricsAppearanceStore');
    const state = mod.useLyricsAppearanceStore.getState();
    expect(state.lyricsPlainOpacity).toBe(0.85);
    expect(state.lyricsPlainFontSize).toBe('lg');
    expect(state.lyricsSyncedDimOpacity).toBe(mod.LYRICS_SYNCED_DIM_OPACITY_DEFAULT);
    expect(state.lyricsSyncedFontSize).toBe(mod.LYRICS_SYNCED_FONT_SIZE_DEFAULT);
  });

  it('sanitizes malformed lyrics synced prefs from the legacy bucket', async () => {
    localStorage.setItem(
      'shiranami.app-store',
      JSON.stringify({
        state: { lyricsSyncedDimOpacity: 'broken', lyricsSyncedFontSize: 'huge' },
        version: 1,
      })
    );

    const mod = await import('./useLyricsAppearanceStore');
    const state = mod.useLyricsAppearanceStore.getState();
    expect(state.lyricsSyncedDimOpacity).toBe(mod.LYRICS_SYNCED_DIM_OPACITY_DEFAULT);
    expect(state.lyricsSyncedFontSize).toBe(mod.LYRICS_SYNCED_FONT_SIZE_DEFAULT);
  });
});
