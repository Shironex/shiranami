import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAccentStore, ACCENT_DEFAULT, ACCENT_PRESETS, applyAccent } from './useAccentStore';

const STORE_KEY = 'shiranami.accent-store';

function readPersisted(): Record<string, unknown> {
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) return {};
  const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
  return parsed.state ?? {};
}

function rootStyle() {
  return document.documentElement.style;
}

describe('useAccentStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useAccentStore.setState({ accentColor: ACCENT_DEFAULT });
    applyAccent(null);
  });

  it('ships a null default that leaves the theme accent untouched', () => {
    expect(ACCENT_DEFAULT).toBeNull();
    expect(rootStyle().getPropertyValue('--primary')).toBe('');
  });

  it('sets the accent vars on the document root and persists', () => {
    useAccentStore.getState().setAccentColor('#60b8e0');
    expect(rootStyle().getPropertyValue('--primary')).toBe('#60b8e0');
    expect(rootStyle().getPropertyValue('--primary-rgb')).toBe('96, 184, 224');
    expect(rootStyle().getPropertyValue('--ring')).toBe('#60b8e0');
    expect(readPersisted().accentColor).toBe('#60b8e0');
  });

  it('lowercases the stored hex', () => {
    useAccentStore.getState().setAccentColor('#F09E60');
    expect(useAccentStore.getState().accentColor).toBe('#f09e60');
  });

  it('coerces malformed input to the default (no override)', () => {
    useAccentStore.getState().setAccentColor('#60b8e0');
    useAccentStore.getState().setAccentColor('not-a-color');
    expect(useAccentStore.getState().accentColor).toBeNull();
    expect(rootStyle().getPropertyValue('--primary')).toBe('');
  });

  it('picks a dark foreground for light accents and a light one for dark accents', () => {
    useAccentStore.getState().setAccentColor('#fcd34d'); // light gold
    expect(rootStyle().getPropertyValue('--primary-foreground')).toBe('oklch(0.1 0.02 280)');
    useAccentStore.getState().setAccentColor('#5b21b6'); // deep violet
    expect(rootStyle().getPropertyValue('--primary-foreground')).toBe('oklch(0.97 0.01 280)');
  });

  it('resetAccent clears the override vars entirely', () => {
    useAccentStore.getState().setAccentColor('#ef7bae');
    useAccentStore.getState().resetAccent();
    expect(useAccentStore.getState().accentColor).toBeNull();
    expect(rootStyle().getPropertyValue('--primary')).toBe('');
    expect(rootStyle().getPropertyValue('--primary-rgb')).toBe('');
    expect(rootStyle().getPropertyValue('--primary-foreground')).toBe('');
    expect(rootStyle().getPropertyValue('--ring')).toBe('');
  });

  it('exposes only valid #rrggbb presets', () => {
    for (const preset of ACCENT_PRESETS) {
      expect(preset.hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('useAccentStore rehydration sanitizing', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('drops a malformed persisted accent on load', async () => {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ state: { accentColor: 'javascript:alert(1)' }, version: 1 })
    );
    const mod = await import('./useAccentStore');
    expect(mod.useAccentStore.getState().accentColor).toBeNull();
  });

  it('applies a valid persisted accent to the DOM on load', async () => {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ state: { accentColor: '#6ee7b7' }, version: 1 })
    );
    const mod = await import('./useAccentStore');
    expect(mod.useAccentStore.getState().accentColor).toBe('#6ee7b7');
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe('#6ee7b7');
  });
});
