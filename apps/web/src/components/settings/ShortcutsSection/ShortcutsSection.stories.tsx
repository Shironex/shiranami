import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect, waitFor } from 'storybook/test';
import { useKeymapStore } from '@/stores/useKeymapStore';
import { DEFAULT_KEYMAP } from '@/lib/keymap';

import ShortcutsSection from './ShortcutsSection';

/**
 * settings · ShortcutsSection. Two cards ("Playback" and "Panels & UI") listing
 * every remappable shortcut from `useKeymapStore`. Clicking a chord button
 * enters capture mode (the next keydown becomes the new binding), conflicting
 * or reserved chords are rejected with an inline warning, each modified row
 * grows a reset button, and a "Reset all" row restores `DEFAULT_KEYMAP`.
 * State is reset per story.
 */
const meta: Meta<typeof ShortcutsSection> = {
  title: 'settings/ShortcutsSection',
  component: ShortcutsSection,
  // Every chord + reset button carries a localized aria-label, the warning is
  // a role="alert", and the card titles are real headings — axe clean.
  parameters: { a11y: { test: 'error' } },
  decorators: [
    Story => {
      useKeymapStore.getState().resetAllBindings();
      return (
        <div className="max-w-[680px] space-y-4 p-4">
          <Story />
        </div>
      );
    },
  ],
};

export default meta;

type Story = StoryObj<typeof ShortcutsSection>;

/** Default — both groups render and a full capture flow rebinds Mute / Unmute. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('heading', { name: 'Playback' })).toBeInTheDocument();
    await expect(canvas.getByRole('heading', { name: 'Panels & UI' })).toBeInTheDocument();

    // Click the Mute / Unmute chord → capture mode.
    await userEvent.click(
      canvas.getByRole('button', { name: /Change shortcut for Mute \/ Unmute/ })
    );
    await expect(canvas.getByText('Press keys…')).toBeInTheDocument();

    // A chord already used by another action is rejected with a warning…
    await userEvent.keyboard('n');
    await expect(canvas.getByRole('alert')).toHaveTextContent('Already used by');

    // …a free chord is accepted and the row re-renders with the new keys.
    await userEvent.keyboard('k');
    await waitFor(() =>
      expect(useKeymapStore.getState().bindings.muteUnmute).toEqual({
        key: 'k',
        mod: false,
        shift: false,
      })
    );

    // The modified row grew a per-binding reset; using it restores the default.
    await userEvent.click(
      canvas.getByRole('button', { name: /Reset the Mute \/ Unmute shortcut/ })
    );
    await waitFor(() =>
      expect(useKeymapStore.getState().bindings.muteUnmute).toEqual(DEFAULT_KEYMAP.muteUnmute)
    );
  },
};

/** A customized keymap — modified rows show reset buttons and "Reset all" is live. */
export const Modified: Story = {
  decorators: [
    Story => {
      useKeymapStore.getState().resetAllBindings();
      useKeymapStore.getState().setBinding('muteUnmute', { key: 'k', mod: false, shift: false });
      useKeymapStore.getState().setBinding('toggleQueue', { key: 'u', mod: true, shift: false });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const resetAll = canvas.getByRole('button', { name: 'Reset all' });
    await expect(resetAll).toBeEnabled();

    await userEvent.click(resetAll);
    await waitFor(() => expect(useKeymapStore.getState().bindings).toEqual(DEFAULT_KEYMAP));
  },
};
