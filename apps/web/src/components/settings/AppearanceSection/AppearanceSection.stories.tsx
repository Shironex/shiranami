import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect, waitFor } from 'storybook/test';
import { useThemeStore } from '@/stores/useThemeStore';
import { useThemeBgStore } from '@/stores/useThemeBgStore';
import { useAccentStore } from '@/stores/useAccentStore';
import { useUIStore } from '@/stores/useUIStore';

import AppearanceSection from './AppearanceSection';

/**
 * settings · AppearanceSection. The Appearance panel: a "Language & scale" card
 * (language chips + an interface-scale slider with preset chips), a "Theme" card
 * (theme tile grid + background opacity/blur/dim sliders when a photo theme is
 * active), and an "Accent color" card embedding AccentColorPicker + AccentPreview.
 * Scale and accent are seeded per story so chip/picker assertions start known.
 */
const meta: Meta<typeof AppearanceSection> = {
  title: 'settings/AppearanceSection',
  component: AppearanceSection,
  // a11y stays at the global 'todo' default: the interface-scale and
  // background opacity/blur/dim Sliders are rendered without an accessible name
  // (no aria-label passed at the call site in AppearanceSection.tsx), so axe's
  // aria-input-field-name rule fails on the slider thumbs. The shared
  // ui/slider.tsx forwards a name when given one, but adding names is a
  // component-file change out of this story's scope. The labelled siblings
  // (LyricsSection) are ratcheted to 'error' instead.
  decorators: [
    Story => (
      <div className="max-w-[680px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof AppearanceSection>;

/** Default — the three cards render and the 120% scale chip drives the store. */
export const Default: Story = {
  decorators: [
    Story => {
      useUIStore.setState({ uiScale: 100 });
      useThemeStore.setState({ theme: 'none' });
      useAccentStore.setState({ accentColor: null });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('heading', { name: 'Language & scale' })).toBeInTheDocument();
    await expect(canvas.getByRole('heading', { name: 'Theme' })).toBeInTheDocument();
    await expect(canvas.getByRole('heading', { name: 'Accent color' })).toBeInTheDocument();

    // Clicking the 120% preset chip pushes that scale into the UI store.
    await userEvent.click(canvas.getByRole('button', { name: '120%' }));
    await waitFor(() => expect(useUIStore.getState().uiScale).toBe(120));

    useUIStore.setState({ uiScale: 100 });
  },
};

/** Themed with accent — a photo theme reveals the background-adjustment sliders. */
export const ThemedWithAccent: Story = {
  decorators: [
    Story => {
      useUIStore.setState({ uiScale: 110 });
      useThemeStore.setState({ theme: 'lofi-night' });
      useThemeBgStore.setState({ bgOpacity: 0.85, bgBlur: 6, bgDim: 0.3 });
      useAccentStore.setState({ accentColor: '#22d3ee' });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The background-adjustment block (only present for photo themes) renders
    // its labels, and three sliders are exposed (opacity / blur / dim).
    await expect(canvas.getByText('Background adjustments')).toBeInTheDocument();
    await expect(canvas.getAllByRole('slider')).toHaveLength(4);
  },
};
