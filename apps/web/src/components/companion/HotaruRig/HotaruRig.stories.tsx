import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import HotaruRig from './HotaruRig';
import type { CompanionStage } from '@/lib/companionMachine';

/**
 * companion · HotaruRig. Hotaru (蛍), the star jelly — a moon jelly that
 * fills with accent-lit glow-motes, one more per stage, a tiny night sky
 * inside the bell, until the crescent perches on top at stage V. The rig is
 * an SVG fragment; the decorator reproduces the Companion shell contract
 * (`data-stage` on the sprite root drives layer visibility).
 */
const meta: Meta<typeof HotaruRig> = {
  title: 'companion/HotaruRig',
  component: HotaruRig,
  parameters: {
    a11y: { test: 'error' },
  },
};

export default meta;

type Story = StoryObj<typeof HotaruRig>;

function StageFigure({ stage }: { readonly stage: CompanionStage }) {
  return (
    <figure className="flex flex-col items-center gap-2">
      <svg
        className="companion-svg"
        viewBox="0 0 120 112"
        width={96}
        height={90}
        data-stage={stage}
        data-state="idle"
        data-face={stage === 0 ? 'open' : 'half'}
        aria-hidden="true"
        focusable="false"
      >
        <ellipse className="companion-pool companion-s2" cx="60" cy="96" rx="25" ry="4.4" />
        <g className="companion-rig">
          <HotaruRig stage={stage} mode="idle" motion={false} />
        </g>
      </svg>
      <figcaption className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {['I · 0 h', 'II · 25 h', 'III · 100 h', 'IV · 300 h', 'V · 700 h'][stage]}
      </figcaption>
    </figure>
  );
}

/** All five stages side by side — one more mote of light per stage. */
export const StageProgression: Story = {
  render: () => (
    <div className="flex items-end gap-8 bg-background p-10">
      {([0, 1, 2, 3, 4] as const).map(stage => (
        <StageFigure key={stage} stage={stage} />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelectorAll('svg')).toHaveLength(5);
    await expect(canvas.queryByRole('img')).not.toBeInTheDocument();
  },
};
