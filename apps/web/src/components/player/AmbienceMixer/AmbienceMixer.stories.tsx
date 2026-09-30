import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, screen, userEvent, expect } from 'storybook/test';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DEFAULT_AMBIENT_LEVELS, useAmbientStore } from '@/stores/useAmbientStore';
import { useWeatherStore } from '@/stores/useWeatherStore';

import AmbienceMixer from './AmbienceMixer';

/** Seed the mixer state the trigger and controls reflect. */
function seedAmbience(enabled: boolean, weather = false): void {
  useAmbientStore.setState({
    enabled,
    levels: enabled
      ? { rain: 0.6, vinyl: 0.3, noise: 0, fire: 0.45, cafe: 0 }
      : { ...DEFAULT_AMBIENT_LEVELS },
    keepWhenPaused: false,
    followWeather: false,
  });
  useWeatherStore.setState({ enabled: weather });
}

/**
 * player · AmbienceMixer. The cozy-sound mixer: a master switch, one volume
 * slider per layer (rain, vinyl crackle, warm noise, fireplace, café) and the
 * "keep playing when paused" / "follow the weather" options, all reading
 * `useAmbientStore`. By default it renders as an icon-only popover trigger
 * ("Ambience") in the player bar; with `inline` it renders the controls
 * directly (used by the settings section). The popover content portals to
 * `document.body`, so stories query it via `screen`.
 */
const meta: Meta<typeof AmbienceMixer> = {
  title: 'player/AmbienceMixer',
  component: AmbienceMixer,
  parameters: {
    // Every control is named: the trigger carries an aria-label, the switches
    // are bound to their <label>s, and each slider names its thumb.
    a11y: { test: 'error' },
  },
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

type Story = StoryObj<typeof AmbienceMixer>;

/** Playing mix: the trigger opens the popover with every layer slider named. */
export const Popover: Story = {
  decorators: [
    Story => {
      seedAmbience(true);
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Ambience' }));

    await expect(await screen.findByRole('switch', { name: 'Play ambience' })).toBeChecked();
    for (const name of ['Rain', 'Vinyl crackle', 'Warm noise', 'Fireplace', 'Café']) {
      await expect(screen.getByRole('slider', { name: `${name} volume` })).toBeInTheDocument();
    }
    await expect(screen.getByText('60%')).toBeInTheDocument();
  },
};

/** Keyboard: a focused layer slider moves one step per arrow key. */
export const KeyboardLevels: Story = {
  args: { inline: true },
  decorators: [
    Story => {
      seedAmbience(true);
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const fire = canvas.getByRole('slider', { name: 'Fireplace volume' });
    fire.focus();
    await userEvent.keyboard('{ArrowRight}');

    await expect(fire).toHaveAttribute('aria-valuenow', '0.46');
    await expect(canvas.getByText('46%')).toBeInTheDocument();
  },
};

/** Off, with weather off: following the weather is unavailable and says why. */
export const InlineOff: Story = {
  args: { inline: true },
  decorators: [
    Story => {
      seedAmbience(false);
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('switch', { name: 'Play ambience' })).not.toBeChecked();
    await expect(canvas.getByRole('switch', { name: 'Follow the weather' })).toBeDisabled();
    await expect(canvas.getByText('Needs weather, which is off in Settings')).toBeInTheDocument();
  },
};

/** Weather on: the follow option becomes available. */
export const InlineWithWeather: Story = {
  args: { inline: true },
  decorators: [
    Story => {
      seedAmbience(true, true);
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const follow = canvas.getByRole('switch', { name: 'Follow the weather' });
    await expect(follow).toBeEnabled();
    await userEvent.click(follow);
    await expect(follow).toBeChecked();
  },
};
