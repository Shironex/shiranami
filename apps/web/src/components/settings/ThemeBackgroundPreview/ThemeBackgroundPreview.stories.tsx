import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import { useThemeStore } from '@/stores/useThemeStore';
import { useThemeBgStore } from '@/stores/useThemeBgStore';

import ThemeBackgroundPreview from './ThemeBackgroundPreview';

/**
 * settings · ThemeBackgroundPreview. A scaled-down sample of the live theme
 * background — the same image + scrim + dim stack the app paints, with the
 * background-adjust slider values applied as locally-scoped inline styles — so
 * users can judge opacity/blur/dim without the settings glass obscuring it. The
 * image, scrim, and dim layers are all `aria-hidden`; a faux glass "now playing"
 * card sits on top showing a sample track + artist. Renders nothing when the
 * active theme is `none`, so every story seeds a photo theme first.
 *
 * a11y stays at `'todo'`: this is a decorative preview whose foreground glass
 * card sits over arbitrary (often dark) photo backgrounds, so the faux track
 * text can't be guaranteed to clear axe's color-contrast threshold. Same
 * deferral precedent as splash/SplashScreen and debug/DebugOverlay.
 */
const meta: Meta<typeof ThemeBackgroundPreview> = {
  title: 'settings/ThemeBackgroundPreview',
  component: ThemeBackgroundPreview,
  decorators: [
    Story => (
      <div className="max-w-[420px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof ThemeBackgroundPreview>;

/** Lofi Night theme at full opacity, no blur/dim — the sample chrome reads over it. */
export const Default: Story = {
  decorators: [
    Story => {
      useThemeStore.setState({ theme: 'lofi-night' });
      useThemeBgStore.setState({ bgOpacity: 1, bgBlur: 0, bgDim: 0 });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Sample Track')).toBeInTheDocument();
    await expect(canvas.getByText('Now playing over your background')).toBeInTheDocument();
  },
};

/** Snow theme with the slider pushed to blurred + dimmed — still renders the chrome. */
export const BlurredAndDimmed: Story = {
  decorators: [
    Story => {
      useThemeStore.setState({ theme: 'snow' });
      useThemeBgStore.setState({ bgOpacity: 0.8, bgBlur: 8, bgDim: 0.4 });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Sample Track')).toBeInTheDocument();
  },
};
