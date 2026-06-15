import type { Meta, StoryObj } from '@storybook/react-vite';

import EqCurvePreview from './EqCurvePreview';

const meta: Meta<typeof EqCurvePreview> = {
  title: 'settings/EqCurvePreview',
  component: EqCurvePreview,
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

export const Flat: Story = {
  args: { gains: FLAT, preampDb: 0 },
};

export const Shaped: Story = {
  args: { gains: SMILE, preampDb: 0 },
};

export const Disabled: Story = {
  args: { gains: SMILE, preampDb: 0, disabled: true },
};
