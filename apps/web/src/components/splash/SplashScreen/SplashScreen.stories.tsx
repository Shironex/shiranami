import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { within, expect } from 'storybook/test';

import SplashScreen from './SplashScreen';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

/**
 * splash · SplashScreen. The composed boot splash — "Cafe Window / Rain on Glass
 * at night". Stacks every decorative layer (night scene, lamp, wordmark
 * reflection, droplets, rAF rain, glass, steam, cup) behind the meta corner and
 * the bottom-left brand block. The brand block carries the only accessible
 * content: the "Shiranami" `<h1>` wordmark and a `role="status"` region that
 * holds either the rotating loader message or, in the error variant, the error
 * text plus a "Try again" retry. Renders nothing once dismissed. In the browser
 * run `IS_ELECTRON` is false, so the drag region and rounded-top chrome are off.
 */
const meta: Meta<typeof SplashScreen> = {
  title: 'splash/SplashScreen',
  component: SplashScreen,
  // a11y is left at the global 'todo' default (not ratcheted to 'error'): the
  // brand block's wordmark + status region fade in on a timer, so at axe-time
  // their opacity is mid-transition and color-contrast is non-deterministic.
  // The decorative sub-layers (SplashScene/Droplets/Glass) are ratcheted to
  // 'error' in their own stories; their accessible content is asserted in `play`.
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <QueryClientProvider client={queryClient}>
        <Story />
      </QueryClientProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SplashScreen>;

/** Loading — the brand wordmark + live status region mount over the scene. */
export const Loading: Story = {
  args: {
    isLoading: true,
    isError: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The wordmark + polite status region are always mounted (they sit outside
    // the timer-gated loader block), but use async queries so the assertions are
    // resilient regardless of mount/animation timing.
    // The wordmark renders "Shira" + an <em>nami</em>, so match the leading text.
    await expect(await canvas.findByText('Shira')).toBeInTheDocument();
    await expect(await canvas.findByRole('status')).toBeInTheDocument();
  },
};

/** Error — the failure message and a retry control replace the loader. */
export const Error: Story = {
  args: {
    isLoading: false,
    isError: true,
    error: 'Could not read your music library.',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Could not read your music library.')).toBeInTheDocument();
    // The status block fades in on a timer, so query the retry by its text and
    // confirm it's a real button rather than relying on its (initially hidden) role.
    const retry = canvas.getByText('Try again');
    await expect(retry.closest('button')).not.toBeNull();
  },
};
