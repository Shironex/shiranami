import { render, screen, act } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { DIALOG_EVENTS } from '@/lib/dialogEvents';
import { useKeymapStore } from '@/stores/useKeymapStore';
import KeyboardShortcutsHelp from './KeyboardShortcutsHelp';

beforeEach(() => {
  useKeymapStore.getState().resetAllBindings();
});

describe('KeyboardShortcutsHelp', () => {
  it('mounts closed — the dialog title is not rendered until the open event fires', () => {
    render(<KeyboardShortcutsHelp />);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens on the open-shortcut-help window event and renders the category grid', () => {
    render(<KeyboardShortcutsHelp />);

    act(() => {
      window.dispatchEvent(new Event(DIALOG_EVENTS.openShortcutHelp));
    });

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    // Category section headings render their translated titles.
    expect(screen.getByRole('heading', { name: /playback/i })).toBeInTheDocument();
  });

  it('renders the live binding from the keymap store, not the default', () => {
    useKeymapStore.getState().setBinding('muteUnmute', { key: 'k', mod: false, shift: false });
    render(<KeyboardShortcutsHelp />);

    act(() => {
      window.dispatchEvent(new Event(DIALOG_EVENTS.openShortcutHelp));
    });

    const row = screen.getByText('Mute / Unmute').closest('div');
    expect(row).not.toBeNull();
    const chips = Array.from(row?.querySelectorAll('kbd') ?? []).map(kbd => kbd.textContent);
    expect(chips).toEqual(['K']);
  });
});
