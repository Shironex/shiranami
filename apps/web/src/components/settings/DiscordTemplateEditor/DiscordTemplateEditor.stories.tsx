import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect, fn, waitFor } from 'storybook/test';
import { DEFAULT_DISCORD_TEMPLATES } from '@shiranami/shared';

import DiscordTemplateEditor from './DiscordTemplateEditor';

/**
 * settings · DiscordTemplateEditor. A controlled editor for one activity's
 * Discord status template: an "Activity type" select (bound to its label), two
 * text inputs ("Line 1 (description)" / "Line 2 (state)"), three named toggles
 * (Track timer / App logo / Shiranami button), a variable-hint panel, and a
 * "Restore defaults" button. All changes flow up through `onTemplateChange` /
 * `onReset` callbacks, asserted here with `fn()` spies.
 */
const meta: Meta<typeof DiscordTemplateEditor> = {
  title: 'settings/DiscordTemplateEditor',
  component: DiscordTemplateEditor,
  // Inputs are bound to <label htmlFor>, the select trigger is labelled, switches
  // carry aria-label, and the heading is real — axe clean.
  parameters: { a11y: { test: 'error' } },
  decorators: [
    Story => (
      <div className="max-w-[680px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof DiscordTemplateEditor>;

/** Default — inputs seed from the playing template; edits + reset fire callbacks. */
export const Default: Story = {
  args: {
    selectedActivity: 'playing',
    onActivityChange: fn(),
    currentTemplate: DEFAULT_DISCORD_TEMPLATES.playing,
    onTemplateChange: fn(),
    onReset: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('heading', { name: 'Status templates' })).toBeInTheDocument();

    // The Line 1 input is bound to its label and seeded from the playing template.
    const line1 = canvas.getByLabelText('Line 1 (description)');
    await expect(line1).toHaveValue('Listening to music');

    // Typing reports the change upward through onTemplateChange.
    await userEvent.type(line1, '!');
    await waitFor(() => expect(args.onTemplateChange).toHaveBeenCalled());

    // The activity-type combobox is labelled and present.
    await expect(canvas.getByRole('combobox', { name: 'Activity type' })).toBeInTheDocument();

    // "Restore defaults" invokes the reset callback.
    await userEvent.click(canvas.getByRole('button', { name: 'Restore defaults' }));
    await waitFor(() => expect(args.onReset).toHaveBeenCalled());
  },
};
