import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KEYMAP,
  SHORTCUT_ACTION_IDS,
  bindingEquals,
  bindingMatchesEvent,
  bindingsCollide,
  chordFromEvent,
  findBindingConflict,
  findReservedChord,
  formatBinding,
  isBindableEvent,
  normalizeEventKey,
  sanitizeBinding,
  type KeyBinding,
} from './keymap';

function keyEvent(key: string, opts: Partial<KeyboardEventInit> = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, ...opts });
}

describe('normalizeEventKey', () => {
  it('lowercases single characters and names the space key', () => {
    expect(normalizeEventKey('M')).toBe('m');
    expect(normalizeEventKey('?')).toBe('?');
    expect(normalizeEventKey(' ')).toBe('Space');
    expect(normalizeEventKey('ArrowLeft')).toBe('ArrowLeft');
  });
});

describe('chordFromEvent', () => {
  it('folds Shift away for non-mod chords (legacy switch parity)', () => {
    const chord = chordFromEvent(keyEvent('M', { shiftKey: true }));
    expect(chord).toEqual({ key: 'm', mod: false, shift: false });
  });

  it('keeps Shift for mod chords', () => {
    const chord = chordFromEvent(keyEvent('M', { ctrlKey: true, shiftKey: true }));
    expect(chord).toEqual({ key: 'm', mod: true, shift: true });
  });

  it('treats metaKey and ctrlKey both as the primary modifier', () => {
    expect(chordFromEvent(keyEvent('b', { metaKey: true })).mod).toBe(true);
    expect(chordFromEvent(keyEvent('b', { ctrlKey: true })).mod).toBe(true);
  });
});

describe('isBindableEvent', () => {
  it('rejects bare modifier presses', () => {
    expect(isBindableEvent(keyEvent('Shift'))).toBe(false);
    expect(isBindableEvent(keyEvent('Meta'))).toBe(false);
    expect(isBindableEvent(keyEvent('k'))).toBe(true);
  });
});

describe('bindingMatchesEvent', () => {
  it('matches the default single-key bindings regardless of Shift', () => {
    const mute = DEFAULT_KEYMAP.muteUnmute;
    expect(bindingMatchesEvent(mute, 'muteUnmute', keyEvent('m'))).toBe(true);
    expect(bindingMatchesEvent(mute, 'muteUnmute', keyEvent('M', { shiftKey: true }))).toBe(true);
    expect(bindingMatchesEvent(mute, 'muteUnmute', keyEvent('m', { ctrlKey: true }))).toBe(false);
  });

  it('requires an exact Shift state for mod bindings', () => {
    const lyrics = DEFAULT_KEYMAP.toggleLyrics;
    expect(bindingMatchesEvent(lyrics, 'toggleLyrics', keyEvent('l', { ctrlKey: true }))).toBe(
      true
    );
    expect(
      bindingMatchesEvent(lyrics, 'toggleLyrics', keyEvent('L', { ctrlKey: true, shiftKey: true }))
    ).toBe(false);

    const compact = DEFAULT_KEYMAP.compactMode;
    expect(
      bindingMatchesEvent(compact, 'compactMode', keyEvent('M', { ctrlKey: true, shiftKey: true }))
    ).toBe(true);
    expect(bindingMatchesEvent(compact, 'compactMode', keyEvent('m', { ctrlKey: true }))).toBe(
      false
    );
  });

  it('wildcards Shift for the seek-step actions', () => {
    const seek = DEFAULT_KEYMAP.seekBack;
    expect(bindingMatchesEvent(seek, 'seekBack', keyEvent('ArrowLeft'))).toBe(true);
    expect(bindingMatchesEvent(seek, 'seekBack', keyEvent('ArrowLeft', { shiftKey: true }))).toBe(
      true
    );
  });

  it('stays Alt-transparent like the legacy handler', () => {
    const mute = DEFAULT_KEYMAP.muteUnmute;
    expect(bindingMatchesEvent(mute, 'muteUnmute', keyEvent('m', { altKey: true }))).toBe(true);
  });
});

describe('bindingsCollide', () => {
  const plainK: KeyBinding = { key: 'k', mod: false, shift: false };
  const modJ: KeyBinding = { key: 'j', mod: true, shift: false };
  const modShiftJ: KeyBinding = { key: 'j', mod: true, shift: true };

  it('collides on the same non-mod key regardless of Shift', () => {
    expect(bindingsCollide(plainK, 'muteUnmute', plainK, 'nextTrack')).toBe(true);
  });

  it('distinguishes mod chords by Shift', () => {
    expect(bindingsCollide(modJ, 'toggleQueue', modShiftJ, 'compactMode')).toBe(false);
  });

  it('treats a seek-step chord as claiming both Shift states', () => {
    expect(bindingsCollide(modJ, 'seekForward', modShiftJ, 'compactMode')).toBe(true);
  });

  it('does not collide across different modifiers', () => {
    expect(
      bindingsCollide(plainK, 'muteUnmute', { key: 'k', mod: true, shift: false }, 'toggleQueue')
    ).toBe(false);
  });
});

describe('findReservedChord', () => {
  it('reserves Escape, the digit row, Mod+K and Mod+A', () => {
    expect(findReservedChord({ key: 'Escape', mod: false, shift: false })).toBe('system');
    expect(findReservedChord({ key: '1', mod: false, shift: false })).toBe('navigation');
    expect(findReservedChord({ key: '9', mod: false, shift: false })).toBe('navigation');
    expect(findReservedChord({ key: 'k', mod: true, shift: false })).toBe('system');
    expect(findReservedChord({ key: 'a', mod: true, shift: false })).toBe('system');
  });

  it('leaves ordinary chords alone', () => {
    expect(findReservedChord({ key: 'k', mod: false, shift: false })).toBeNull();
    expect(findReservedChord({ key: '1', mod: true, shift: false })).toBeNull();
    expect(findReservedChord({ key: 'k', mod: true, shift: true })).toBeNull();
  });
});

describe('findBindingConflict', () => {
  it('flags a chord already used by another action', () => {
    const conflict = findBindingConflict(
      { key: 'n', mod: false, shift: false },
      'muteUnmute',
      DEFAULT_KEYMAP
    );
    expect(conflict).toEqual({ type: 'action', actionId: 'nextTrack' });
  });

  it('flags reserved chords before scanning actions', () => {
    const conflict = findBindingConflict(
      { key: 'Escape', mod: false, shift: false },
      'muteUnmute',
      DEFAULT_KEYMAP
    );
    expect(conflict).toEqual({ type: 'reserved', reservedKind: 'system' });
  });

  it('accepts a free chord and re-assigning an action its own chord', () => {
    expect(
      findBindingConflict({ key: 'k', mod: false, shift: false }, 'muteUnmute', DEFAULT_KEYMAP)
    ).toBeNull();
    expect(findBindingConflict(DEFAULT_KEYMAP.muteUnmute, 'muteUnmute', DEFAULT_KEYMAP)).toBeNull();
  });
});

describe('DEFAULT_KEYMAP', () => {
  it('has no internal collisions and no reserved chords', () => {
    for (const id of SHORTCUT_ACTION_IDS) {
      expect(findBindingConflict(DEFAULT_KEYMAP[id], id, DEFAULT_KEYMAP)).toBeNull();
    }
  });
});

describe('formatBinding', () => {
  it('renders chords with the established display convention', () => {
    // IS_MAC is false under vitest (no darwin platform bridge), so the
    // primary modifier renders as Ctrl here; macOS shows ⌘.
    expect(formatBinding(DEFAULT_KEYMAP.compactMode)).toEqual(['Ctrl', 'Shift', 'M']);
    expect(formatBinding(DEFAULT_KEYMAP.seekBack)).toEqual(['←']);
    expect(formatBinding(DEFAULT_KEYMAP.playPause)).toEqual(['Space']);
    expect(formatBinding(DEFAULT_KEYMAP.showHelp)).toEqual(['?']);
  });
});

describe('sanitizeBinding', () => {
  it('normalizes and enforces the shift-only-with-mod invariant', () => {
    expect(sanitizeBinding({ key: 'K', mod: false, shift: true })).toEqual({
      key: 'k',
      mod: false,
      shift: false,
    });
  });

  it('rejects malformed values', () => {
    expect(sanitizeBinding(null)).toBeNull();
    expect(sanitizeBinding('m')).toBeNull();
    expect(sanitizeBinding({ key: '', mod: false, shift: false })).toBeNull();
    expect(sanitizeBinding({ key: 'Shift', mod: false, shift: false })).toBeNull();
    expect(sanitizeBinding({ key: 'm', mod: 'yes', shift: false })).toBeNull();
  });
});

describe('bindingEquals', () => {
  it('compares all three chord fields', () => {
    expect(bindingEquals(DEFAULT_KEYMAP.muteUnmute, { key: 'm', mod: false, shift: false })).toBe(
      true
    );
    expect(bindingEquals(DEFAULT_KEYMAP.muteUnmute, DEFAULT_KEYMAP.compactMode)).toBe(false);
  });
});
