import type { ReactElement } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { within, expect } from 'storybook/test';
import { systemPrefsKeys, type SystemPrefs } from '@/hooks/queries/useSystemPrefs';

import SystemSection from './SystemSection';

/**
 * settings · SystemSection. Startup/tray behavior card: a real `<h3>` heading
 * ("System behavior") over three Radix switches — Launch at startup, Minimize
 * to tray, Close to tray — each labelled via `aria-labelledby`. The toggles
 * read their checked state from the seeded `system-prefs` query cache.
 *
 * Each switch is `disabled` when `!IS_ELECTRON || !prefs`. In the Storybook
 * browser run `IS_ELECTRON` resolves to `false` — `@/lib/platform` captures it as
 * a module-constant before the preview installs the electronAPI mock — so the
 * switches still render their seeded checked state but stay disabled, and a click
 * cannot flip them (the write mutation is itself IS_ELECTRON-gated). Stories seed
 * the query cache directly so the switches start deterministic.
 */
const meta: Meta<typeof SystemSection> = {
  title: 'settings/SystemSection',
  component: SystemSection,
  parameters: {
    // Real heading, three switches each named via aria-labelledby, and an info
    // callout with a decorative lucide icon — axe passes clean.
    a11y: { test: 'error' },
  },
};

export default meta;

type Story = StoryObj<typeof SystemSection>;

/** Seed the `system-prefs` cache so the toggles render with a known state. */
function withSeededPrefs(prefs: SystemPrefs) {
  return function Decorator(Story: () => ReactElement) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData<SystemPrefs>(systemPrefsKeys.all, prefs);
    return (
      <QueryClientProvider client={client}>
        <div className="max-w-[640px] p-4">
          <Story />
        </div>
      </QueryClientProvider>
    );
  };
}

/** Launch-at-startup on, the other two off — the switches mirror the cache. */
export const Default: Story = {
  decorators: [
    withSeededPrefs({ launchAtStartup: true, minimizeToTray: false, closeToTray: false }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('heading', { name: 'System behavior' })).toBeInTheDocument();

    const [launch, minimize, close] = canvas.getAllByRole('switch');
    await expect(launch).toBeChecked();
    await expect(minimize).not.toBeChecked();
    await expect(close).not.toBeChecked();
  },
};

/**
 * Outside Electron the switches are disabled. With `IS_ELECTRON` false (see meta)
 * the toggle is `disabled` and cannot be flipped — it keeps its seeded state — so
 * this story asserts that gated, non-interactive contract rather than an
 * optimistic flip that only happens under a live electron-store write.
 */
export const MinimizeToTrayDisabled: Story = {
  decorators: [
    withSeededPrefs({ launchAtStartup: false, minimizeToTray: false, closeToTray: false }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const minimize = canvas.getByRole('switch', { name: 'Minimize to tray' });
    // Seeded as off, and disabled because IS_ELECTRON is false here.
    await expect(minimize).not.toBeChecked();
    await expect(minimize).toBeDisabled();
  },
};
