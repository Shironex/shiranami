import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import DevProfiler from './DevProfiler';

/**
 * debug · DevProfiler. A dev-only wrapper that mounts a React `<Profiler>` around
 * its subtree to feed commit count + duration into the debug render-stats
 * collector; in production it returns `children` directly as a zero-cost
 * pass-through. The `<Profiler>` node is transparent in the DOM, so its children
 * render exactly as written and expose their own roles. Stories pass arbitrary
 * children to confirm the wrapper is see-through.
 */
const meta: Meta<typeof DevProfiler> = {
  title: 'debug/DevProfiler',
  component: DevProfiler,
  parameters: {
    // DevProfiler renders nothing of its own — only its children — so axe sees
    // exactly the wrapped markup, which is clean.
    a11y: { test: 'error' },
  },
  args: {
    id: 'demo',
  },
  decorators: [
    Story => (
      <div className="rounded-xl border border-border/40 p-6">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof DevProfiler>;

/** The wrapper is transparent — its child paragraph renders through unchanged. */
export const Default: Story = {
  args: {
    children: (
      <p className="text-sm text-muted-foreground">
        Profiled subtree — render cost is recorded in dev builds.
      </p>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText('Profiled subtree — render cost is recorded in dev builds.')
    ).toBeInTheDocument();
  },
};
