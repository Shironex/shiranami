import type { Meta, StoryObj } from '@storybook/react-vite';
import { DIALOG_EVENTS } from '@/lib/dialogEvents';
import KeyboardShortcutsHelp from './KeyboardShortcutsHelp';

/**
 * shared · KeyboardShortcutsHelp. The `?`-triggered keyboard reference dialog:
 * a two-column grid of Playback / Navigation / Panels & UI categories, each row
 * pairing an action label with its `Kbd` chips. Opens on the global
 * `open-shortcut-help` window event (mod keys resolve per platform; numeric nav
 * entries derive from NAV_VIEWS). Mounts closed — fire the event to open it.
 */
const meta: Meta<typeof KeyboardShortcutsHelp> = {
  title: 'shared/KeyboardShortcutsHelp',
  component: KeyboardShortcutsHelp,
};

export default meta;

type Story = StoryObj<typeof KeyboardShortcutsHelp>;

/** Mounts closed; the decorator dispatches the open event so the dialog shows. */
export const Open: Story = {
  decorators: [
    Story => {
      // Dispatch on the next frame so the dialog's window listener is mounted.
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event(DIALOG_EVENTS.openShortcutHelp));
      });
      return <Story />;
    },
  ],
};
