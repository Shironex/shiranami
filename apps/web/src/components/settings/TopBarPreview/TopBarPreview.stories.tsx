import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import TopBarPreview from './TopBarPreview';

/**
 * settings · TopBarPreview. A scaled mock of the app's top bar shown in the
 * Interface settings section. The page title, add button and window dots are
 * fixed skeleton chrome; the EN/PL language chip group is the only element the
 * `enabled` prop drives — it stays mounted and collapses via `max-width` +
 * `opacity` so the toggle animates instead of popping. The surface is exposed
 * as a labelled `role="img"`.
 */
const meta: Meta<typeof TopBarPreview> = {
  title: 'settings/TopBarPreview',
  component: TopBarPreview,
  parameters: {
    // One labelled role="img" over decorative skeleton bars; the chips are
    // plain text — axe clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="max-w-[420px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof TopBarPreview>;

/** Switcher on — the chip group is expanded next to the window dots. */
export const SwitcherVisible: Story = {
  args: { enabled: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('img', { name: 'Top bar preview' })).toBeInTheDocument();
    await expect(canvas.getByText('EN').parentElement).toHaveClass('max-w-16', 'opacity-100');
  },
};

/** Switcher off — the chips stay mounted but fold to zero width. */
export const SwitcherHidden: Story = {
  args: { enabled: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('PL')).toBeInTheDocument();
    await expect(canvas.getByText('EN').parentElement).toHaveClass('max-w-0', 'opacity-0');
  },
};
