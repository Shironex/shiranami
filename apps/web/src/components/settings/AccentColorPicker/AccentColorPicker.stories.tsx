import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect, waitFor } from 'storybook/test';
import { useAccentStore, ACCENT_PRESETS } from '@/stores/useAccentStore';

import AccentColorPicker from './AccentColorPicker';

/**
 * settings · AccentColorPicker. A `role="radiogroup"` named "Accent color" whose
 * radios are: "Auto (theme accent)", one swatch per preset (named "Use {name}
 * accent"), and a "Custom color" tile that opens the native color input. Exactly
 * one radio is `aria-checked` at a time; selecting drives `useAccentStore`. The
 * native `<input type="color">` is `aria-hidden`, so it never appears in the
 * accessibility tree.
 */
const meta: Meta<typeof AccentColorPicker> = {
  title: 'settings/AccentColorPicker',
  component: AccentColorPicker,
  // radiogroup + radios all carry accessible names; the color input is
  // aria-hidden — axe clean.
  parameters: { a11y: { test: 'error' } },
  decorators: [
    Story => (
      <div className="max-w-[420px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof AccentColorPicker>;

/** Auto is the default selection; clicking a preset swatch updates the store. */
export const Default: Story = {
  decorators: [
    Story => {
      useAccentStore.setState({ accentColor: null });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const group = canvas.getByRole('radiogroup', { name: 'Accent color' });

    // Auto starts active; the first preset (Violet) starts inactive.
    const auto = within(group).getByRole('radio', { name: 'Auto (theme accent)' });
    const violet = within(group).getByRole('radio', { name: 'Use Violet accent' });
    await expect(auto).toHaveAttribute('aria-checked', 'true');
    await expect(violet).toHaveAttribute('aria-checked', 'false');

    // Selecting the Violet swatch writes its hex to the store.
    await userEvent.click(violet);
    await waitFor(() => expect(useAccentStore.getState().accentColor).toBe(ACCENT_PRESETS[0].hex));

    // Reset for the next story.
    useAccentStore.setState({ accentColor: null });
  },
};

/** Preset selected — the first preset swatch reads as the active radio. */
export const PresetSelected: Story = {
  decorators: [
    Story => {
      useAccentStore.setState({ accentColor: ACCENT_PRESETS[0].hex });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('radio', { name: 'Use Violet accent' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await expect(canvas.getByRole('radio', { name: 'Auto (theme accent)' })).toHaveAttribute(
      'aria-checked',
      'false'
    );
  },
};

/** Custom color — a non-preset hex marks the "Custom color" tile as active. */
export const CustomColor: Story = {
  decorators: [
    Story => {
      useAccentStore.setState({ accentColor: '#22d3ee' });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('radio', { name: 'Custom color' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  },
};
