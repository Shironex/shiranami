import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import EqCurvePreview from './EqCurvePreview';

/**
 * settings · EqCurvePreview. The live frequency-response curve for the
 * equalizer — a hand-rolled SVG line through the 10 band gains (plus preamp) so
 * presets read as distinct shapes, not just different slider heights. The SVG
 * carries `role="img"` with a localized aria-label, and the bass→treble
 * frequency axis ticks (31 … 16k) render below it. Pure SVG, no charting
 * dependency. Driven by the `gains` / `preampDb` props.
 */
const meta: Meta<typeof EqCurvePreview> = {
  title: 'settings/EqCurvePreview',
  component: EqCurvePreview,
  parameters: {
    // The curve is a single role="img" with an accessible name; tick labels are
    // plain text — axe clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="max-w-[360px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof EqCurvePreview>;

const FLAT = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const SMILE = [6, 4, 1, -2, -3, -2, 1, 3, 5, 6];

/** A flat curve — the labelled SVG and its full frequency axis still render. */
export const Flat: Story = {
  args: { gains: FLAT, preampDb: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('img', { name: 'Equalizer frequency response curve' })
    ).toBeInTheDocument();
    // The bass and treble ends of the frequency axis are labelled.
    await expect(canvas.getByText('31')).toBeInTheDocument();
    await expect(canvas.getByText('16k')).toBeInTheDocument();
  },
};

/** A shaped ("smile") curve — same accessible chrome, different line shape. */
export const Shaped: Story = {
  args: { gains: SMILE, preampDb: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('img', { name: 'Equalizer frequency response curve' })
    ).toBeInTheDocument();
  },
};

/** Disabled — the curve dims but stays present and accessible. */
export const Disabled: Story = {
  args: { gains: SMILE, preampDb: 0, disabled: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('img', { name: 'Equalizer frequency response curve' })
    ).toBeInTheDocument();
  },
};
