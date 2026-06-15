import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect, waitFor } from 'storybook/test';
import { TooltipProvider } from '@/components/ui/tooltip';

import SettingsView from './SettingsView';

/**
 * settings · SettingsView. The composed Settings page: a section header `<h2>`
 * for the active section, a `<nav aria-label="Settings sections">` of grouped
 * nav buttons (Library / Playback / Appearance / System), and the active
 * section's panel rendered to the right. Opens on the "Music Folders" section.
 * Selecting a nav item swaps the active panel and updates the header. Stories
 * assert the nav landmark + heading and that switching sections works — not
 * every control inside each panel (those have their own stories).
 */
const meta: Meta<typeof SettingsView> = {
  title: 'settings/SettingsView',
  component: SettingsView,
  parameters: {
    layout: 'fullscreen',
    // The nav is a labelled landmark, the active section title is a real <h2>,
    // and nav items are real buttons with aria-current — axe clean. The active
    // panel on open is Music Folders (no unnamed sliders), so the page itself
    // stays axe-clean on first paint.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <TooltipProvider>
        <div className="flex h-screen w-full flex-col">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof meta>;

/** Opens on Music Folders; selecting another nav item swaps the active section. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // The section navigation is a labelled landmark with grouped buttons.
    const nav = canvas.getByRole('navigation', { name: 'Settings sections' });
    await expect(within(nav).getByRole('button', { name: 'Music Folders' })).toBeInTheDocument();
    await expect(within(nav).getByRole('button', { name: 'Playback' })).toBeInTheDocument();

    // Opens on the Music Folders section — its header is the active <h2>, and
    // that nav item is marked current.
    await expect(
      canvas.getByRole('heading', { level: 2, name: 'Music Folders' })
    ).toBeInTheDocument();
    await expect(within(nav).getByRole('button', { name: 'Music Folders' })).toHaveAttribute(
      'aria-current',
      'page'
    );

    // Selecting the Playback section swaps the active panel + header.
    await userEvent.click(within(nav).getByRole('button', { name: 'Playback' }));
    await waitFor(() =>
      expect(canvas.getByRole('heading', { level: 2, name: 'Playback' })).toBeInTheDocument()
    );
    await expect(within(nav).getByRole('button', { name: 'Playback' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  },
};
