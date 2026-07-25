import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import SplashMeta from './SplashMeta';

/**
 * splash · SplashMeta. The top-right meta corner of the boot splash: the real
 * app version stamped next to the 白波 logotype, above a locale-formatted clock
 * that ticks each minute. Static — no animation, no interaction. The whole
 * corner is `aria-hidden` (a per-minute clock would be announcement noise), so
 * the stories cover its two real states: version resolved, and version still in
 * flight.
 */
const meta: Meta<typeof SplashMeta> = {
  title: 'splash/SplashMeta',
  component: SplashMeta,
  parameters: {
    // The corner is aria-hidden decoration — axe finds no roles, names, or text
    // to evaluate, so the check is ratcheted to blocking.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="relative h-[16rem] w-full overflow-hidden bg-background">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof meta>;

/** Version resolved — `v{version} · 白波` over the live clock. */
export const Default: Story = {
  args: { version: '0.24.0', clock: '03:14' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Queried through the DOM rather than the a11y tree: the corner is
    // aria-hidden, so testing-library's role/text queries see nothing.
    await expect(canvasElement.textContent).toContain('v0.24.0 · 白波');
    await expect(canvasElement.textContent).toContain('03:14');
    await expect(canvas.queryByRole('status')).not.toBeInTheDocument();
  },
};

/** Version pending — the bare logotype, never a dangling `v`. */
export const VersionPending: Story = {
  args: { version: '', clock: '03:14' },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.textContent).toContain('白波');
    await expect(canvasElement.textContent).not.toContain('v');
  },
};
