import type { Meta, StoryObj } from '@storybook/react-vite';
import { useThemeStore } from '@/stores/useThemeStore';
import ThemeBackground from './ThemeBackground';

/**
 * shared · ThemeBackground. The full-bleed, z-0 theme image + WCAG scrim painted
 * beneath the shell. Seeded with a non-"none" theme so the layer renders (the
 * default "none" theme deliberately renders nothing).
 */
const meta: Meta<typeof ThemeBackground> = {
  title: 'shared/ThemeBackground',
  component: ThemeBackground,
  decorators: [
    Story => {
      useThemeStore.setState({ theme: 'lofi-night' });
      return (
        <div className="relative w-full h-64">
          <Story />
        </div>
      );
    },
  ],
};

export default meta;

type Story = StoryObj<typeof ThemeBackground>;

export const Default: Story = {};
