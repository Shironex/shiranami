import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import { Search } from 'lucide-react';

import MascotIdleNote from './MascotIdleNote';

/**
 * shared · ViewEmptyState/MascotIdleNote. A single music note that drifts up
 * from the mascot's headphones every 13–20 seconds — a rare idle micro-moment
 * inside the empty state's mascot frame. It is a positioned overlay on a flat
 * PNG, so the decorator reproduces that frame: the note's `left-[38%] top-3`
 * placement only reads correctly against it.
 *
 * The component has no interactive surface — it is `aria-hidden` and
 * `pointer-events-none` — so there is nothing for a play function to drive; the
 * play below asserts it renders as inert decoration. Its only other state is
 * "unmounted", which the component self-selects from the OS-level
 * `prefers-reduced-motion` media query rather than from a prop, so it cannot be
 * expressed as a story; that branch is covered in `MascotIdleNote.test.tsx`.
 */
const meta: Meta<typeof MascotIdleNote> = {
  title: 'shared/ViewEmptyState/MascotIdleNote',
  component: MascotIdleNote,
  parameters: {
    // The note is an aria-hidden span wrapping a decorative SVG — it exposes no
    // role, name, or text, so axe finds nothing to flag.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="flex items-center justify-center bg-background p-16">
        <div className="relative">
          <div className="flex h-28 w-28 items-center justify-center rounded-[28px] border border-primary/10 bg-primary/8">
            <img
              src="./mascot.png"
              alt=""
              aria-hidden="true"
              className="h-[4.5rem] w-[4.5rem] object-contain opacity-70"
              draggable={false}
            />
          </div>
          <div className="absolute -bottom-2 -right-2 flex h-9 w-9 items-center justify-center rounded-full border border-border/40 bg-card">
            <Search className="h-4 w-4 text-primary" />
          </div>
          <Story />
        </div>
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof MascotIdleNote>;

/** The note overlaid on the mascot frame, drifting on its randomized cadence. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // The note mounts as an absolutely-placed, non-interactive overlay...
    const notes = canvasElement.querySelectorAll('span[aria-hidden="true"]');
    await expect(notes).toHaveLength(1);
    await expect(notes[0]).toHaveClass('pointer-events-none', 'absolute');
    await expect(notes[0].querySelector('svg')).toBeInTheDocument();

    // ...and contributes nothing to the accessibility tree.
    await expect(canvas.queryByRole('img')).not.toBeInTheDocument();
    await expect(notes[0].textContent).toBe('');
  },
};
