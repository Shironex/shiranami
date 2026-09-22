import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import LibraryDoctorCard from './LibraryDoctorCard';

/**
 * settings · LibraryDoctorCard. The Library Doctor (F8): one button decodes
 * the whole library and reports decode-truth findings — truncation, damaged
 * frames, duration lies, clipping, silence. The report itself needs the
 * desktop bridge, so stories cover the idle chrome: title, call to action,
 * and the run affordance.
 */
const meta: Meta<typeof LibraryDoctorCard> = {
  title: 'settings/LibraryDoctorCard',
  component: LibraryDoctorCard,
  parameters: {
    // A real heading, a labelled button and plain text — axe clean.
    a11y: { test: 'error' },
  },
};

export default meta;

type Story = StoryObj<typeof LibraryDoctorCard>;

/** Idle — the call to action before any run. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Library health')).toBeInTheDocument();
    await expect(
      canvas.getByText('Decode every file and report damage, truncation and oddities')
    ).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: /Run check/ })).toBeInTheDocument();
  },
};
