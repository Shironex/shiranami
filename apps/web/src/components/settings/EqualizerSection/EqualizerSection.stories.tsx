import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect, waitFor } from 'storybook/test';
import { useEqStore } from '@/stores/useEqStore';
import { TooltipProvider } from '@/components/ui/tooltip';

import EqualizerSection from './EqualizerSection';

const FLAT = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const SMILE = [6, 4, 1, -2, -3, -2, 1, 3, 5, 6];

/**
 * settings · EqualizerSection. The 10-band graphic EQ panel: an enable switch,
 * a grid of genre preset tiles, the live response-curve preview, ten vertical
 * band sliders with a preamp slider, and a reset. Reads/writes `useEqStore`.
 * Stories seed the store and assert the chrome + a real preset/switch
 * interaction against the store.
 */
const meta: Meta<typeof EqualizerSection> = {
  title: 'settings/EqualizerSection',
  component: EqualizerSection,
  // a11y stays at the global 'todo' default: the ten per-band sliders are a
  // hand-rolled `SliderPrimitive.Root` that puts its `aria-label` on the Root,
  // not the Thumb — so each band's `role="slider"` is unnamed (axe
  // aria-input-field-name). The fix lives in EqualizerSection.tsx itself, which
  // is out of scope for this story-strengthening pass, so axe is left
  // non-blocking here. The preamp slider (shared ui/slider.tsx) is correctly
  // named on the thumb; only the band strip is affected.
  parameters: { a11y: { test: 'todo' } },
  decorators: [
    Story => (
      <TooltipProvider>
        <div className="max-w-[640px] p-4">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof EqualizerSection>;

/** Enabled on the Flat preset — switch on, presets selectable, curve present. */
export const Enabled: Story = {
  decorators: [
    Story => {
      useEqStore.setState({ enabled: true, preset: 'flat', gains: FLAT, preampDb: 0 });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Equalizer' })).toBeInTheDocument();

    // The master switch reflects the enabled store state.
    const enable = canvas.getByRole('switch');
    await expect(enable).toBeChecked();

    // The response-curve preview renders alongside the band strip.
    await expect(
      canvas.getByRole('img', { name: 'Equalizer frequency response curve' })
    ).toBeInTheDocument();

    // Picking a different preset updates the store.
    await userEvent.click(canvas.getByRole('button', { name: 'Rock' }));
    await waitFor(() => expect(useEqStore.getState().preset).toBe('rock'));
  },
};

/** A custom curve — the "Custom" indicator tile appears next to the presets. */
export const Custom: Story = {
  decorators: [
    Story => {
      useEqStore.setState({ enabled: true, preset: 'custom', gains: SMILE, preampDb: 2 });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Custom')).toBeInTheDocument();
  },
};

/** Disabled — the master switch is off and the band controls dim. */
export const Disabled: Story = {
  decorators: [
    Story => {
      useEqStore.setState({ enabled: false, preset: 'flat', gains: FLAT, preampDb: 0 });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('switch')).not.toBeChecked();
    // The band sliders are disabled while the EQ is off — Radix marks the thumb
    // (role="slider") with data-disabled and drops it from the tab order.
    const sliders = canvas.getAllByRole('slider');
    await expect(sliders[0]).toHaveAttribute('data-disabled');
    await expect(sliders[0]).not.toHaveAttribute('tabindex');
  },
};
