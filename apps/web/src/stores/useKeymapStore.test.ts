import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_KEYMAP, type KeyBinding } from '@/lib/keymap';
import { useKeymapStore } from './useKeymapStore';

const STORE_KEY = 'shiranami.keymap-store';

const MOD_J: KeyBinding = { key: 'j', mod: true, shift: false };

function readPersisted(): Record<string, unknown> {
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) return {};
  const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
  return parsed.state ?? {};
}

beforeEach(() => {
  localStorage.clear();
  useKeymapStore.getState().resetAllBindings();
});

describe('useKeymapStore', () => {
  it('resolves the legacy defaults with no overrides', () => {
    expect(useKeymapStore.getState().bindings).toEqual(DEFAULT_KEYMAP);
    expect(useKeymapStore.getState().overrides).toEqual({});
  });

  it('setBinding overrides one action and persists only the override', () => {
    useKeymapStore.getState().setBinding('muteUnmute', MOD_J);

    const state = useKeymapStore.getState();
    expect(state.bindings.muteUnmute).toEqual(MOD_J);
    expect(state.bindings.nextTrack).toEqual(DEFAULT_KEYMAP.nextTrack);
    expect(readPersisted()).toEqual({ overrides: { muteUnmute: MOD_J } });
  });

  it('setBinding back to the default drops the override', () => {
    useKeymapStore.getState().setBinding('muteUnmute', MOD_J);
    useKeymapStore.getState().setBinding('muteUnmute', DEFAULT_KEYMAP.muteUnmute);

    expect(useKeymapStore.getState().overrides).toEqual({});
    expect(readPersisted()).toEqual({ overrides: {} });
  });

  it('resetBinding restores a single default', () => {
    useKeymapStore.getState().setBinding('muteUnmute', MOD_J);
    useKeymapStore.getState().setBinding('nextTrack', { key: 'x', mod: false, shift: false });

    useKeymapStore.getState().resetBinding('muteUnmute');

    const state = useKeymapStore.getState();
    expect(state.bindings.muteUnmute).toEqual(DEFAULT_KEYMAP.muteUnmute);
    expect(state.bindings.nextTrack).toEqual({ key: 'x', mod: false, shift: false });
  });

  it('resetAllBindings restores every default', () => {
    useKeymapStore.getState().setBinding('muteUnmute', MOD_J);
    useKeymapStore.getState().setBinding('toggleQueue', { key: 'u', mod: true, shift: false });

    useKeymapStore.getState().resetAllBindings();

    expect(useKeymapStore.getState().bindings).toEqual(DEFAULT_KEYMAP);
    expect(readPersisted()).toEqual({ overrides: {} });
  });
});
