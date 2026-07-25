import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyPersistedTheme } from './theme-init';

const THEME_STORE_KEY = 'shiranami.theme';

function persist(theme: unknown): void {
  localStorage.setItem(THEME_STORE_KEY, JSON.stringify({ state: { theme }, version: 1 }));
}

describe('applyPersistedTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('applies a persisted non-default theme to <html>', () => {
    persist('snow');
    applyPersistedTheme();
    expect(document.documentElement.dataset.theme).toBe('snow');
  });

  it('leaves the attribute off for the default theme', () => {
    persist('none');
    applyPersistedTheme();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('leaves the attribute off when nothing is persisted', () => {
    applyPersistedTheme();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('ignores a corrupt bucket', () => {
    localStorage.setItem(THEME_STORE_KEY, '{not json');
    applyPersistedTheme();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('ignores a non-string theme', () => {
    persist(42);
    applyPersistedTheme();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('survives storage access throwing', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage denied');
    });
    expect(() => applyPersistedTheme()).not.toThrow();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    getItem.mockRestore();
  });

  it('applies the theme as an import side effect, before any caller runs', async () => {
    persist('wisteria');
    vi.resetModules();
    await import('./theme-init');
    expect(document.documentElement.dataset.theme).toBe('wisteria');
  });
});
