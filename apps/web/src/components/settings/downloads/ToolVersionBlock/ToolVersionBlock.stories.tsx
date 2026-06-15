import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import ToolVersionBlock from './ToolVersionBlock';

/**
 * settings/downloads · ToolVersionBlock. A two-row version readout for a
 * download tool: an "Installed version" row always renders, and a "Latest
 * release" row appears only when a latest version is known. Purely
 * presentational and prop-driven (`installedVersion`, `latestVersion`). Stories
 * assert which rows render for each input.
 */
const meta: Meta<typeof ToolVersionBlock> = {
  title: 'settings/downloads/ToolVersionBlock',
  component: ToolVersionBlock,
  parameters: {
    // Two labelled text rows, no interactive or media content — axe clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="w-[28rem] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof ToolVersionBlock>;

/** Both versions known: installed and latest-release rows render. */
export const Default: Story = {
  args: {
    installedVersion: 'v2024.03.10',
    latestVersion: 'v2024.04.01',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Installed version')).toBeInTheDocument();
    await expect(canvas.getByText('v2024.03.10')).toBeInTheDocument();
    await expect(canvas.getByText('Latest release')).toBeInTheDocument();
    await expect(canvas.getByText('v2024.04.01')).toBeInTheDocument();
  },
};

/** Latest unknown: only the installed-version row renders. */
export const NoLatest: Story = {
  args: {
    installedVersion: 'v2024.03.10',
    latestVersion: null,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Installed version')).toBeInTheDocument();
    await expect(canvas.getByText('v2024.03.10')).toBeInTheDocument();
    await expect(canvas.queryByText('Latest release')).not.toBeInTheDocument();
  },
};
