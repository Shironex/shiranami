import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect } from 'storybook/test';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DEFAULT_AMBIENT_LEVELS, useAmbientStore } from '@/stores/useAmbientStore';
import { useWeatherStore } from '@/stores/useWeatherStore';

import AmbienceSection from './AmbienceSection';

/**
 * settings · AmbienceSection. The ambience card: a real `<h3>` heading over the
 * inline AmbienceMixer (master switch, five named layer sliders, the two option
 * switches and a reset), followed by an info callout on how ambience follows
 * the music and the sleep timer, and one crediting the café recording. The
 * mixer reads `useAmbientStore`, which stories seed on entry.
 */
const meta: Meta<typeof AmbienceSection> = {
  title: 'settings/AmbienceSection',
  component: AmbienceSection,
  parameters: {
    // A real heading, switches bound to their labels, sliders that name their
    // thumbs, and callouts with decorative icons: axe clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <TooltipProvider>
        <div className="max-w-[680px] p-4">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof AmbienceSection>;

/** Fresh install: ambience off, rain waiting at half. Switching on keeps the mix. */
export const Default: Story = {
  decorators: [
    Story => {
      useAmbientStore.setState({
        enabled: false,
        levels: { ...DEFAULT_AMBIENT_LEVELS },
        keepWhenPaused: false,
        followWeather: false,
      });
      useWeatherStore.setState({ enabled: false });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Ambience' })).toBeInTheDocument();
    const master = canvas.getByRole('switch', { name: 'Play ambience' });
    await expect(master).not.toBeChecked();

    await userEvent.click(master);
    await expect(master).toBeChecked();
    await expect(canvas.getByRole('slider', { name: 'Rain volume' })).toHaveAttribute(
      'aria-valuenow',
      '0.5'
    );
  },
};

/** A full evening mix with the weather follow available. */
export const EveningMix: Story = {
  decorators: [
    Story => {
      useAmbientStore.setState({
        enabled: true,
        levels: { rain: 0.55, vinyl: 0.3, noise: 0.15, fire: 0.5, cafe: 0.2 },
        keepWhenPaused: true,
        followWeather: true,
      });
      useWeatherStore.setState({ enabled: true });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('switch', { name: 'Keep playing when music pauses' })
    ).toBeChecked();
    await expect(canvas.getByRole('switch', { name: 'Follow the weather' })).toBeChecked();
    await expect(canvas.getByText('55%')).toBeInTheDocument();
  },
};
