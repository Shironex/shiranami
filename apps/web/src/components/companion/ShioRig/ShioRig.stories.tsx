import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import ShioRig from './ShioRig';
import type { CompanionStage } from '@/lib/companionMachine';

/**
 * companion · ShioRig. Shio (潮), the tide-cat — the wave lives in its tail,
 * growing from a stub into a foam-tufted breaking crest across five stages.
 * The rig is an SVG fragment: layer visibility (whiskers II, blush III,
 * headphones IV, crescent halo V) is CSS keyed on the sprite root's
 * `data-stage`, so the decorator reproduces the Companion shell contract.
 */
const meta: Meta<typeof ShioRig> = {
  title: 'companion/ShioRig',
  component: ShioRig,
  parameters: {
    // The whole sprite is aria-hidden decoration; axe must find nothing.
    a11y: { test: 'error' },
  },
};

export default meta;

type Story = StoryObj<typeof ShioRig>;

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
          <ShioRig stage={stage} mode="idle" motion={false} />
        </g>
      </svg>
      <figcaption className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {['I · 0 h', 'II · 25 h', 'III · 100 h', 'IV · 300 h', 'V · 700 h'][stage]}
      </figcaption>
    </figure>
  );
}

/** All five stages side by side — growth is articulation, not mass. */
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
    // Decorative contract: nothing reaches the a11y tree.
    await expect(canvas.queryByRole('img')).not.toBeInTheDocument();
  },
};
