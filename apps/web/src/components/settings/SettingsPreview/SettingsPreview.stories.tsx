import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import SettingsPreview from './SettingsPreview';

/**
 * settings · SettingsPreview. A tiny layout primitive that frames a preview
 * surface: an uppercase caption above an arbitrary content slot. Used to label
 * the live previews in settings sections (sidebar mock, EQ curve, scale sample).
 * Purely presentational — caption + children in, framed block out.
 */
const meta: Meta<typeof SettingsPreview> = {
  title: 'settings/SettingsPreview',
  component: SettingsPreview,
  parameters: {
    // Caption is plain text; content is caller-supplied — axe clean for this
    // sample.
    a11y: { test: 'error' },
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

/** Caption above a sample content block. */
export const Default: Story = {
  args: {
    title: 'Preview',
    children: (
      <div className="rounded-xl border border-border/30 bg-surface/50 p-6 text-sm text-muted-foreground">
        Preview content
      </div>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Preview')).toBeInTheDocument();
    await expect(canvas.getByText('Preview content')).toBeInTheDocument();
  },
};
