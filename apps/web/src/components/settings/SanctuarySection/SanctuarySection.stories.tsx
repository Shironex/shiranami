import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect } from 'storybook/test';
import { useSanctuaryStore } from '@/stores/useSanctuaryStore';

import SanctuarySection from './SanctuarySection';

/**
 * settings · SanctuarySection. Sanctuary Mode's card: the center-stage picker
 * (cover / clock / vinyl), per-stage track details, follow-the-day, stage
 * rotation, the clock's face / hour format / seconds, and the opt-in
 * screensaver auto-entry with its stillness slider. Reads `useSanctuaryStore`.
 */
const meta: Meta<typeof SanctuarySection> = {
  title: 'settings/SanctuarySection',
  component: SanctuarySection,
  parameters: {
    a11y: { test: 'error' },
  },
  decorators: [
    Story => {
      useSanctuaryStore.setState({
        sanctuaryVariant: 'cover',
        sanctuaryClockFace: 'minimal',
        sanctuaryClockFormat: 'system',
        sanctuaryClockSeconds: false,
        sanctuaryRotation: 'off',
        sanctuaryRotationMinutes: 5,
        sanctuaryTrackInfo: { cover: true, clock: true, vinyl: true },
        sanctuaryTimeOfDay: false,
        sanctuaryAutoEnter: false,
        sanctuaryAutoEnterMinutes: 5,
      });
      return (
        <div className="max-w-xl p-4">
          <Story />
        </div>
      );
    },
  ],
};

export default meta;

type Story = StoryObj<typeof SanctuarySection>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Sanctuary Mode')).toBeInTheDocument();
    // The stillness slider is hidden until auto-entry is opted into.
    await expect(canvas.queryByText('Stillness before entering')).not.toBeInTheDocument();
    // So is the rotation window until timer rotation is picked.
    await expect(canvas.queryByText('Minutes between turns')).not.toBeInTheDocument();
  },
};

/** Opting into auto-entry reveals the stillness window slider. */
export const AutoEnter: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('switch', { name: /Enter on its own/ }));
    await expect(canvas.getByText('Stillness before entering')).toBeInTheDocument();
    await expect(useSanctuaryStore.getState().sanctuaryAutoEnter).toBe(true);
  },
};

/** Follow-the-day hands the stage to the hour: picker and rotation lock. */
export const FollowTheDay: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('switch', { name: /Follow the day/ }));
    await expect(canvas.getByRole('button', { name: 'Cover' })).toBeDisabled();
    await expect(canvas.getByRole('combobox', { name: /Rotate the stage/ })).toBeDisabled();
  },
};

/** Timer rotation reveals its minutes-between-turns slider. */
export const TimerRotation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Set after render: the decorator resets the store as the story mounts.
    useSanctuaryStore.getState().setSanctuaryRotation('minutes');
    await expect(await canvas.findByText('Minutes between turns')).toBeInTheDocument();
  },
};
