import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import SearchView from './SearchView';

/**
 * search · SearchView. The YouTube search surface: a search field with live
 * suggestions, the results list of `SearchResultRow`s, and the dependency
 * gate (checking → install-tools → ready). The view checks yt-dlp/ffmpeg on
 * mount, but that check is Electron-gated — in the Storybook browser run
 * (`IS_ELECTRON === false`) the on-mount effect is a no-op, so the view stays in
 * its initial "checking" state and renders the "Preparing search" status card.
 * Stories assert that stable chrome; the search field and results list are
 * exercised by `SearchResultRow` and the jsdom unit tests (which mock the
 * dependency hook).
 */
const meta: Meta<typeof SearchView> = {
  title: 'search/SearchView',
  component: SearchView,
  parameters: {
    // The status card's mascot is decorative (alt="") and its title/description
    // are plain text — axe passes clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="flex h-[40rem] flex-col">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SearchView>;

/** Checking — the dependency-preparation card the browser run lands on. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Preparing search')).toBeInTheDocument();
    await expect(canvas.getByText(/Checking yt-dlp and ffmpeg/)).toBeInTheDocument();
  },
};
