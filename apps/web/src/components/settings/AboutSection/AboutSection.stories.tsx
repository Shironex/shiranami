import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { within, userEvent, expect, fn, waitFor } from 'storybook/test';
import { useOnboardingStore } from '@/stores/useOnboardingStore';

import AboutSection from './AboutSection';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

/**
 * settings · AboutSection. The About panel's stack of `SettingsCard`s — a hero
 * with the wordmark + version chip and GitHub/Changelog links, an authored
 * "story" card, an Electron-only "Application logs" card, and a "Replay
 * onboarding" card whose button resets onboarding via the store.
 *
 * The "Application logs" card is gated on `IS_ELECTRON`, which `@/lib/platform`
 * captures as a module-load constant. In the Storybook browser run that constant
 * resolves to `false` (platform.ts is imported before the preview's electronAPI
 * mock is installed), so the logs card is unreachable here and the story asserts
 * only the three always-present cards.
 */
const meta: Meta<typeof AboutSection> = {
  title: 'settings/AboutSection',
  component: AboutSection,
  // Headings are real <h3>s, links carry visible text + icons, and the mascot
  // <img> has an alt — axe clean.
  parameters: { a11y: { test: 'error' } },
  decorators: [
    Story => (
      <QueryClientProvider client={queryClient}>
        <div className="max-w-[680px] p-4">
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof AboutSection>;

/** Default — every card renders and "Replay setup" drives the onboarding reset. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // The three always-present section headings render. The "Application logs"
    // card is Electron-gated (IS_ELECTRON is a false module-constant in the
    // Storybook browser run, see meta), so it is intentionally not asserted here.
    await expect(canvas.getByRole('heading', { name: 'Shiranami' })).toBeInTheDocument();
    await expect(canvas.getByRole('heading', { name: 'The story' })).toBeInTheDocument();
    await expect(canvas.getByRole('heading', { name: 'Replay onboarding' })).toBeInTheDocument();
    await expect(
      canvas.queryByRole('heading', { name: 'Application logs' })
    ).not.toBeInTheDocument();

    // Outbound links expose their destinations by accessible name.
    await expect(canvas.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/Shironex/shiranami'
    );

    // Clicking "Replay setup" calls the store's resetOnboarding. Seed a spy so
    // the assertion is on a known setter, then restore it afterwards.
    const resetOnboarding = fn();
    const previous = useOnboardingStore.getState().resetOnboarding;
    useOnboardingStore.setState({ resetOnboarding });
    try {
      await userEvent.click(canvas.getByRole('button', { name: 'Replay setup' }));
      await waitFor(() => expect(resetOnboarding).toHaveBeenCalled());
    } finally {
      useOnboardingStore.setState({ resetOnboarding: previous });
    }
  },
};
