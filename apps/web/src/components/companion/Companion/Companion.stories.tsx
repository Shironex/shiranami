import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import Companion from './Companion';

/**
 * companion · Companion. The resident sprite — one shell, two species (Shio
 * the tide-cat, Hotaru the star jelly). States map the machine's loops:
 * listening sways at `--breath-float` with the crest/tendrils counter-phase
 * on `--breath-pulse`, grooving doubles the amplitude and hops, sleeping
 * breathes at a fixed 8s. Everything tinted rides the `--art-*` palette and
 * `--primary-rgb`, so the sprite wears whatever record is playing.
 */
const meta: Meta<typeof Companion> = {
  title: 'companion/Companion',
  component: Companion,
  args: {
    species: 'shio',
    stage: 2,
    mode: 'listening',
    motion: true,
    size: 96,
  },
  argTypes: {
    species: { control: 'radio', options: ['shio', 'hotaru'] },
    stage: { control: { type: 'range', min: 0, max: 4, step: 1 } },
    mode: {
      control: 'select',
      options: ['idle', 'listening', 'grooving', 'drowsy', 'sleeping', 'waking', 'hiding'],
    },
  },
  parameters: {
    // Pure aria-hidden decoration — axe must find nothing to flag.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="flex items-end justify-center bg-background p-12">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof Companion>;

/** The heart of the feature: breathing with the room. */
export const Listening: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const svg = canvasElement.querySelector('svg');
    await expect(svg).toHaveAttribute('aria-hidden', 'true');
    await expect(svg).toHaveAttribute('data-state', 'listening');
    // Decorative contract: nothing reaches the accessibility tree.
    await expect(canvas.queryByRole('img')).not.toBeInTheDocument();
  },
};

/** High tempo + loud track: doubled sway, a small hop, one bubble per hop. */
export const Grooving: Story = {
  args: { mode: 'grooving' },
};

/** Paused: flattened mound, eyes closed, fixed 8s breath — never the beat. */
export const Sleeping: Story = {
  args: { mode: 'sleeping' },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('svg')).toHaveAttribute('data-face', 'closed');
  },
};

/** Hotaru listening — same machine, mapped onto tendrils and glow-motes. */
export const HotaruListening: Story = {
  args: { species: 'hotaru' },
};

/** Both species across all five stages at perch scale. */
export const StageProgression: Story = {
  render: () => (
    <div className="flex flex-col gap-8 bg-background p-10">
      <div className="flex items-end gap-6">
        {([0, 1, 2, 3, 4] as const).map(stage => (
          <Companion
            key={stage}
            species="shio"
            stage={stage}
            mode="idle"
            motion={false}
            size={72}
          />
        ))}
      </div>
      <div className="flex items-end gap-6">
        {([0, 1, 2, 3, 4] as const).map(stage => (
          <Companion
            key={stage}
            species="hotaru"
            stage={stage}
            mode="idle"
            motion={false}
            size={72}
          />
        ))}
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('svg')).toHaveLength(10);
  },
};

/** Reduced motion / low-perf: the static first frame, never absence. */
export const StaticFirstFrame: Story = {
  args: { motion: false },
  play: async ({ canvasElement }) => {
    const rig = canvasElement.querySelector('.companion-rig');
    await expect(rig).not.toHaveClass('companion-sway');
  },
};
