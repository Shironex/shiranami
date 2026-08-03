import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect } from 'storybook/test';
import { useSanctuaryStore } from '@/stores/useSanctuaryStore';

import SanctuarySection from './SanctuarySection';

/**
 * settings · SanctuarySection. Sanctuary Mode's card: the center-stage picker
 * (cover / clock), the opt-in screensaver auto-entry toggle, and the stillness
 * slider that appears once auto-entry is on. Reads `useSanctuaryStore`.
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
