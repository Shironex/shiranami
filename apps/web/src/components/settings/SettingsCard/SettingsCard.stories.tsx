import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect, fn } from 'storybook/test';
import { SlidersHorizontal } from 'lucide-react';

import SettingsCard, { SettingsToggleRow, SettingsSelectRow } from './SettingsCard';

/**
 * settings · SettingsCard. The shared chrome for a settings panel — an icon
 * tile, an `<h3>` title with optional subtitle, and a content slot. The file
 * also exports the row primitives (`SettingsToggleRow`, `SettingsSelectRow`)
 * that sections compose: a labelled Radix Switch and a label-bound Select, each
 * wired so its control inherits the row's accessible name. Presentational —
 * no store or IPC dependency.
 */
const meta: Meta<typeof SettingsCard> = {
  title: 'settings/SettingsCard',
  component: SettingsCard,
  parameters: {
    // Title is a real heading; the toggle/select rows wire aria-labelledby from
    // the row label onto the control — axe clean.
    a11y: { test: 'error' },
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

/** Card header + a toggle row and a label-bound select row, fully interactive. */
export const Default: Story = {
  render: () => {
    const onToggle = fn();
    return (
      <SettingsCard
        icon={SlidersHorizontal}
        title="Equalizer"
        subtitle="Shape playback with a 10-band graphic EQ."
      >
        <SettingsToggleRow label="Enable equalizer" checked onCheckedChange={onToggle} />
        <SettingsSelectRow
          label="Preset"
          value="flat"
          onValueChange={fn()}
          options={[
            { value: 'flat', label: 'Flat' },
            { value: 'bass', label: 'Bass boost' },
          ]}
          divider
        />
      </SettingsCard>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Heading + subtitle render.
    await expect(canvas.getByRole('heading', { name: 'Equalizer' })).toBeInTheDocument();
    await expect(canvas.getByText('Shape playback with a 10-band graphic EQ.')).toBeInTheDocument();

    // The toggle row exposes its switch by the row label and starts checked
    // (it's controlled, so the prop holds it on).
    const toggle = canvas.getByRole('switch', { name: 'Enable equalizer' });
    await expect(toggle).toBeChecked();

    // The select row exposes its trigger by the row label.
    await expect(canvas.getByRole('combobox', { name: 'Preset' })).toBeInTheDocument();
  },
};
