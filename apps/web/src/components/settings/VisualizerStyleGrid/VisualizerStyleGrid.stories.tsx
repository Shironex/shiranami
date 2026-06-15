import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect, fn, waitFor } from 'storybook/test';
import type { VisualizerStyle } from '@/stores/useUIStore';

import VisualizerStyleGrid from './VisualizerStyleGrid';

/**
 * settings · VisualizerStyleGrid. The shared visualizer-style picker used by
 * both Settings · Visualizer and the onboarding wizard. Renders one toggle
 * `<button>` per registered style, each carrying `aria-pressed` for the active
 * selection and a text label (+ description, hidden in compact mode) as its
 * accessible name. Selecting a tile fires `onSelect` with that style's id.
 * Stories drive it through a controlled wrapper so the pressed state moves.
 */
const meta: Meta<typeof VisualizerStyleGrid> = {
  title: 'settings/VisualizerStyleGrid',
  component: VisualizerStyleGrid,
  parameters: {
    // Every tile is a real <button> with a text accessible name and aria-pressed;
    // focus-visible rings are present — axe passes clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="max-w-[480px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof VisualizerStyleGrid>;

function Interactive(args: {
  columns?: 2 | 3;
  compact?: boolean;
  onSelect?: (style: VisualizerStyle) => void;
}) {
  const [value, setValue] = useState<VisualizerStyle>('bars');
  const { onSelect, ...rest } = args;
  return (
    <VisualizerStyleGrid
      value={value}
      onSelect={style => {
        onSelect?.(style);
        setValue(style);
      }}
      {...rest}
    />
  );
}

/** Active tile is pressed; clicking another moves the selection and fires onSelect. */
export const Default: Story = {
  args: { onSelect: fn() },
  render: args => <Interactive onSelect={args.onSelect} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    const bars = canvas.getByRole('button', { name: /Bars/ });
    await expect(bars).toHaveAttribute('aria-pressed', 'true');

    const waveform = canvas.getByRole('button', { name: /Waveform/ });
    await expect(waveform).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(waveform);
    await expect(args.onSelect).toHaveBeenCalledWith('waveform');
    // The controlled wrapper moves the pressed state to the picked tile.
    await waitFor(() => expect(waveform).toHaveAttribute('aria-pressed', 'true'));
  },
};

/** Three-column layout still presents one named, pressable button per style. */
export const ThreeColumns: Story = {
  render: () => <Interactive columns={3} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: /Bars/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  },
};

/** Compact mode drops per-style descriptions but keeps the named buttons. */
export const Compact: Story = {
  render: () => <Interactive columns={3} compact />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Description text is hidden in compact mode.
    await expect(canvas.queryByText('Soft frequency bars')).not.toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Bars' })).toBeInTheDocument();
  },
};
