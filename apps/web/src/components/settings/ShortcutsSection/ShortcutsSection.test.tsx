import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_KEYMAP } from '@/lib/keymap';
import { useKeymapStore } from '@/stores/useKeymapStore';

import ShortcutsSection from './ShortcutsSection';

function reset(): void {
  localStorage.clear();
  useKeymapStore.getState().resetAllBindings();
}

beforeEach(reset);
afterEach(reset);

function pressKey(key: string, opts: Partial<KeyboardEventInit> = {}) {
  fireEvent.keyDown(window, { key, ...opts });
}

describe('ShortcutsSection', () => {
  it('renders both groups with the default chords', () => {
    render(<ShortcutsSection />);

    expect(screen.getByRole('heading', { name: 'Playback' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Panels & UI' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Change shortcut for Mute \/ Unmute \(currently M\)/ })
    ).toBeInTheDocument();
  });

  it('captures a pressed chord and rebinds the action', async () => {
    const user = userEvent.setup();
    render(<ShortcutsSection />);

    await user.click(screen.getByRole('button', { name: /Change shortcut for Mute \/ Unmute/ }));
    expect(screen.getByText('Press keys…')).toBeInTheDocument();

    pressKey('k');

    expect(useKeymapStore.getState().bindings.muteUnmute).toEqual({
      key: 'k',
      mod: false,
      shift: false,
    });
    expect(screen.queryByText('Press keys…')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Change shortcut for Mute \/ Unmute \(currently K\)/ })
    ).toBeInTheDocument();
  });

  it('rejects a chord already used by another action and keeps capturing', async () => {
    const user = userEvent.setup();
    render(<ShortcutsSection />);

    await user.click(screen.getByRole('button', { name: /Change shortcut for Mute \/ Unmute/ }));
    pressKey('n');

    expect(screen.getByRole('alert')).toHaveTextContent('Already used by “Next track”');
    expect(useKeymapStore.getState().bindings.muteUnmute).toEqual(DEFAULT_KEYMAP.muteUnmute);
    expect(screen.getByText('Press keys…')).toBeInTheDocument();
  });

  it('rejects reserved chords with the reserved warning', async () => {
    const user = userEvent.setup();
    render(<ShortcutsSection />);

    await user.click(screen.getByRole('button', { name: /Change shortcut for Mute \/ Unmute/ }));
    pressKey('1');

    expect(screen.getByRole('alert')).toHaveTextContent('Reserved for view navigation');
    expect(useKeymapStore.getState().bindings.muteUnmute).toEqual(DEFAULT_KEYMAP.muteUnmute);
  });

  it('cancels capture on Escape without changing the binding', async () => {
    const user = userEvent.setup();
    render(<ShortcutsSection />);

    await user.click(screen.getByRole('button', { name: /Change shortcut for Mute \/ Unmute/ }));
    pressKey('Escape');

    expect(screen.queryByText('Press keys…')).not.toBeInTheDocument();
    expect(useKeymapStore.getState().bindings.muteUnmute).toEqual(DEFAULT_KEYMAP.muteUnmute);
  });

  it('ignores bare modifier presses while capturing', async () => {
    const user = userEvent.setup();
    render(<ShortcutsSection />);

    await user.click(screen.getByRole('button', { name: /Change shortcut for Mute \/ Unmute/ }));
    pressKey('Shift', { shiftKey: true });

    expect(screen.getByText('Press keys…')).toBeInTheDocument();
    expect(useKeymapStore.getState().bindings.muteUnmute).toEqual(DEFAULT_KEYMAP.muteUnmute);
  });

  it('captures mod chords with the platform modifier', async () => {
    const user = userEvent.setup();
    render(<ShortcutsSection />);

    await user.click(screen.getByRole('button', { name: /Change shortcut for Toggle sidebar/ }));
    pressKey('j', { ctrlKey: true });

    expect(useKeymapStore.getState().bindings.toggleSidebar).toEqual({
      key: 'j',
      mod: true,
      shift: false,
    });
  });

  it('resets a single modified binding to its default', async () => {
    const user = userEvent.setup();
    useKeymapStore.getState().setBinding('muteUnmute', { key: 'k', mod: false, shift: false });
    render(<ShortcutsSection />);

    await user.click(screen.getByRole('button', { name: /Reset the Mute \/ Unmute shortcut/ }));

    expect(useKeymapStore.getState().bindings.muteUnmute).toEqual(DEFAULT_KEYMAP.muteUnmute);
  });

  it('reset all restores every default and is disabled when nothing is modified', async () => {
    const user = userEvent.setup();
    render(<ShortcutsSection />);

    const resetAll = screen.getByRole('button', { name: 'Reset all' });
    expect(resetAll).toBeDisabled();

    useKeymapStore.getState().setBinding('muteUnmute', { key: 'k', mod: false, shift: false });
    useKeymapStore.getState().setBinding('toggleQueue', { key: 'u', mod: true, shift: false });
    await waitFor(() => expect(resetAll).toBeEnabled());

    await user.click(resetAll);

    expect(useKeymapStore.getState().bindings).toEqual(DEFAULT_KEYMAP);
  });
});
