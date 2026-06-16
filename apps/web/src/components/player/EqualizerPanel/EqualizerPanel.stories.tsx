import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, screen, userEvent, expect } from 'storybook/test';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useEqStore } from '@/stores/useEqStore';

import EqualizerPanel from './EqualizerPanel';

function seedEq(enabled: boolean): void {
  useEqStore.setState({
    enabled,
    preset: enabled ? 'rock' : 'flat',
    gains: enabled ? [3, 2, 1, 0, -1, 0, 1, 2, 3, 4] : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    preampDb: 0,
    activeCustomId: null,
  });
}

/**
 * player · EqualizerPanel. The 10-band graphic EQ. By default it renders as an
 * icon-only popover trigger ("Equalizer") in the player bar; with `inline` it
 * renders the controls directly (used by the settings section). The surface
 * holds an enable switch, a preset Select, the band strip (ten VerticalBand
 * sliders), and a preamp slider, all reading `useEqStore`. The popover content
 * portals to `document.body`, so stories query it via `screen`.
 *
 * a11y note: both variants ultimately expose the band sliders, which place their
 * aria-label on the Radix Root (not the Thumb) — so those `role="slider"`
 * elements are unnamed and axe's aria-input-field-name rule fails. The inline
 * variant renders them immediately; the popover variant reveals them once its
 * `play` opens the popover. Both are therefore deferred to `'todo'` until the
 * band slider forwards its label to the Thumb (the shared ui/slider already does
 * this) — a fix in VerticalBandSlider's own markup, out of scope for this pass.
 */
const meta: Meta<typeof EqualizerPanel> = {
  title: 'player/EqualizerPanel',
  component: EqualizerPanel,
  decorators: [
    Story => (
      <TooltipProvider>
        <div className="p-8">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof EqualizerPanel>;

/** Enabled trigger — the labelled EQ button opens its control popover on click. */
export const TriggerEnabled: Story = {
  // a11y stays at the global 'todo' default (NOT ratcheted): this story's `play`
  // opens the popover, which mounts the ten band sliders. VerticalBandSlider puts
  // its aria-label on the Radix Root rather than the Thumb, so each role="slider"
  // thumb is unnamed and axe's aria-input-field-name rule fails. Same blocker as
  // InlineSection — out of scope for this story-only pass.
  decorators: [
    Story => {
      seedEq(true);
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: 'Equalizer' });
    await userEvent.click(trigger);

    // Popover content portals to body — the enable switch + preset select appear.
    await expect(await screen.findByRole('switch')).toBeInTheDocument();
    await expect(screen.getByRole('combobox')).toBeInTheDocument();
    // The preamp uses the shared ui/slider, so its name lands on the thumb.
    await expect(screen.getByRole('slider', { name: 'Preamp' })).toBeInTheDocument();
  },
};

/** Inline section — the EQ controls rendered directly, as in the settings panel. */
export const InlineSection: Story = {
  // a11y stays at the global 'todo' default (NOT ratcheted): the inline variant
  // renders the band-slider strip, and VerticalBandSlider puts its aria-label on
  // the Radix Root rather than the Thumb — so each role="slider" thumb is unnamed
  // and axe's aria-input-field-name rule fails. The fix lives in the band slider's
  // own markup, which is out of scope for this story-only pass.
  args: { inline: true, layout: 'section' },
  decorators: [
    Story => {
      seedEq(true);
      return (
        <div className="w-[420px]">
          <Story />
        </div>
      );
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The enable switch + preset combobox render inline (no popover to open).
    await expect(canvas.getByRole('switch')).toBeInTheDocument();
    await expect(canvas.getByRole('combobox')).toBeInTheDocument();
    // Ten band sliders plus the preamp slider make eleven role="slider" elements.
    await expect(canvas.getAllByRole('slider')).toHaveLength(11);
  },
};
