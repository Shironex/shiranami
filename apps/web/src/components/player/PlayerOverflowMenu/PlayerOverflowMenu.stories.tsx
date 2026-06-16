import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, screen, userEvent, expect } from 'storybook/test';
import { useInterfaceStore } from '@/stores/useInterfaceStore';
import { useUIStore } from '@/stores/useUIStore';
import { TooltipProvider } from '@/components/ui/tooltip';

import PlayerOverflowMenu from './PlayerOverflowMenu';

/** Seed the element-visibility + visualizer stores the menu reads. */
function seedMenu(visualizerOn: boolean): void {
  useInterfaceStore.setState({
    playerSleepTimer: true,
    playerEqualizer: true,
    playerCompactButton: true,
    playerVisualizerButton: true,
  });
  useUIStore.setState({ showVisualizer: visualizerOn });
}

/**
 * player · PlayerOverflowMenu. The narrow-width "More" popover that collapses the
 * secondary player controls — sleep timer, equalizer, compact mode, and the
 * visualizer toggle — behind a single icon button. It mirrors the PlayerBar
 * element-visibility toggles (`useInterfaceStore`) so a hidden control stays
 * hidden here too, and reflects the visualizer state from `useUIStore`. The
 * popover content portals to `document.body`, so stories query it via `screen`.
 * Stories seed the stores, open the popover, and assert the collapsed controls
 * by role + name.
 */
const meta: Meta<typeof PlayerOverflowMenu> = {
  title: 'player/PlayerOverflowMenu',
  component: PlayerOverflowMenu,
  parameters: {
    // The trigger plus every nested control is icon-only with an aria-label, and
    // the nested sleep-timer/EQ popovers stay closed — axe passes for the menu.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <TooltipProvider>
        <div className="flex h-40 items-center justify-center">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof PlayerOverflowMenu>;

/** Default — opening "More" surfaces the collapsed secondary controls. */
export const Default: Story = {
  decorators: [
    Story => {
      seedMenu(false);
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'More' }));

    // Popover content portals to body — query the collapsed controls via screen.
    await expect(await screen.findByRole('button', { name: 'Sleep timer' })).toBeInTheDocument();
    await expect(screen.getByRole('button', { name: 'Equalizer' })).toBeInTheDocument();
    await expect(screen.getByRole('button', { name: 'Compact mode' })).toBeInTheDocument();
    await expect(screen.getByRole('button', { name: 'Toggle visualizer' })).toBeInTheDocument();
  },
};

/** VisualizerActive — the trigger shows an active dot; the toggle is still present. */
export const VisualizerActive: Story = {
  decorators: [
    Story => {
      seedMenu(true);
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'More' }));
    // With the visualizer on, the toggle still resolves by its stable name.
    await expect(
      await screen.findByRole('button', { name: 'Toggle visualizer' })
    ).toBeInTheDocument();
  },
};
