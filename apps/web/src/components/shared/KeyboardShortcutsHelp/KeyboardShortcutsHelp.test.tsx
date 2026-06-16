import { render, screen, act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DIALOG_EVENTS } from '@/lib/dialogEvents';
import KeyboardShortcutsHelp from './KeyboardShortcutsHelp';

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
});
