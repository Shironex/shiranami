import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect, fn } from 'storybook/test';
import { LayoutGrid, List } from 'lucide-react';

import ViewModeButton from './ViewModeButton';

/**
 * library · ViewModeButton. The icon-only toggle used in the library's view
 * switcher to flip between the track list and the album grid. It renders a
 * single `<button>` whose accessible name comes from `label` (also the tooltip)
 * and whose `aria-pressed` reflects the active state. Stories assert the pressed
 * state per variant and that a click invokes `onClick`.
 */
const meta: Meta<typeof ViewModeButton> = {
  title: 'library/ViewModeButton',
  component: ViewModeButton,
  parameters: {
    // Icon-only button carries an aria-label + title (the icon is decorative)
    // and exposes aria-pressed — axe passes clean.
    a11y: { test: 'error' },
  },
  args: {
    onClick: fn(),
    label: 'Tracks',
    icon: List,
  },
  decorators: [
    Story => (
      <div className="flex items-center rounded-xl border border-border/50 glass-subtle p-1 gap-0.5">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof ViewModeButton>;

/** Active mode — the button reads as pressed and still fires on click. */
export const Default: Story = {
  args: {
    active: true,
    icon: List,
    label: 'Tracks',
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', { name: 'Tracks', pressed: true });

    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalled();
  },
};

/** Inactive mode — the button reads as not pressed. */
export const Inactive: Story = {
  args: {
    active: false,
    icon: LayoutGrid,
    label: 'Albums',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('button', { name: 'Albums', pressed: false })
    ).toBeInTheDocument();
  },
};
