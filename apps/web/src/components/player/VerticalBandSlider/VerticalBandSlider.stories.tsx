import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import { TooltipProvider } from '@/components/ui/tooltip';

import VerticalBandSlider from './VerticalBandSlider';

/**
 * player · VerticalBandSlider. One band of the graphic EQ — a vertical Radix
 * slider with a frequency label beneath and a tooltip showing the band name +
 * gain. It is fully controlled via props (`value`/`onChange`), so stories drive
 * it through args rather than a store. The slider's `aria-label` is placed on
 * the Radix Root rather than the Thumb (unlike the shared ui/slider), so the
 * `role="slider"` thumb element has no accessible name — see the a11y note.
 */
const meta: Meta<typeof VerticalBandSlider> = {
  title: 'player/VerticalBandSlider',
  component: VerticalBandSlider,
  // a11y stays at 'todo' (NOT ratcheted to 'error'): this component puts its
  // aria-label on the Radix Slider.Root, not the Thumb, so the role="slider"
  // thumb element ends up unnamed and axe's aria-input-field-name rule fails.
  // The fix belongs in this component's own markup (or by forwarding the label
  // to the Thumb like the shared ui/slider does) — out of scope for the
  // story-only pass, so the gap is documented here rather than papered over.
  args: {
    freq: 1000,
    value: 0,
    onChange: () => {},
    label: '1 kHz band',
    bandName: 'Presence',
    gainLabel: '0.0 dB',
  },
  decorators: [
    Story => (
      <TooltipProvider>
        <div className="w-16 p-4">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof VerticalBandSlider>;

/** Flat — the 1 kHz band at 0 dB; the frequency label prints beneath the slider. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // freq 1000 renders as the "1k" frequency label under the band.
    await expect(canvas.getByText('1k')).toBeInTheDocument();
    // The slider role is present (aria-label sits on the Root, not the thumb).
    await expect(canvas.getByRole('slider')).toBeInTheDocument();
  },
};

/** Boosted — the 16 kHz "Air" band pushed to +6 dB, with the kHz frequency label. */
export const Boosted: Story = {
  args: {
    freq: 16000,
    value: 6,
    label: '16 kHz band',
    bandName: 'Air',
    gainLabel: '+6.0 dB',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // freq 16000 collapses to the "16k" label.
    await expect(canvas.getByText('16k')).toBeInTheDocument();
  },
};

/** Disabled — the band is non-interactive (EQ off). */
export const Disabled: Story = {
  args: {
    disabled: true,
    gainLabel: '0.0 dB',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Radix reflects the disabled state on the slider via data-disabled.
    await expect(canvas.getByRole('slider')).toHaveAttribute('data-disabled');
  },
};
