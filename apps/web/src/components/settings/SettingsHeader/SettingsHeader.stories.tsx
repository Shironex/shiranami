import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import { SlidersHorizontal } from 'lucide-react';

import SettingsHeader from './SettingsHeader';

/**
 * settings · SettingsHeader. The section header at the top of a settings panel —
 * a thin wrapper over the shared `PageHeader` (section variant) that renders the
 * section icon tile plus an `<h2>` title and an optional uppercase subtitle. The
 * icon is decorative (`aria-hidden`), so the title carries the section's
 * accessible heading. Presentational — props in, header out.
 */
const meta: Meta<typeof SettingsHeader> = {
  title: 'settings/SettingsHeader',
  component: SettingsHeader,
  parameters: {
    // Title is a real <h2>; the icon is aria-hidden + focusable="false" — axe clean.
    a11y: { test: 'error' },
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

/** Icon + heading + subtitle. */
export const Default: Story = {
  args: {
    icon: SlidersHorizontal,
    title: 'Equalizer',
    subtitle: 'Shape playback with a 10-band graphic EQ.',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { level: 2, name: 'Equalizer' })).toBeInTheDocument();
    await expect(canvas.getByText('Shape playback with a 10-band graphic EQ.')).toBeInTheDocument();
  },
};
