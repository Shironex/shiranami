import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect, fn } from 'storybook/test';

import SearchStateCard from './SearchStateCard';

/** Stand-in for the slotted action's handler, asserted by the WithAction play. */
const onInstall = fn();

/**
 * search · SearchStateCard. The pass-through the search feature uses over the
 * shared `StatusCard` — a centered mascot panel with a title, a description and
 * an optional slot for actions, plus a spinner badge while `loading`. It exists
 * for SearchView's and DependencyInstallCard's call sites; new status surfaces
 * should reach for `StatusCard` directly. Stories cover the loading state, the
 * plain state, and the actions slot.
 */
const meta: Meta<typeof SearchStateCard> = {
  title: 'search/SearchStateCard',
  component: SearchStateCard,
  parameters: {
    // The mascot is decorative (alt="" + aria-hidden) and the slotted action is
    // a real labelled <button> — axe passes clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="flex h-[32rem] flex-col">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SearchStateCard>;

/** Resolved state — title and description, no badge. */
export const Default: Story = {
  args: {
    title: 'Search tools missing',
    description: 'yt-dlp is required before this view can search YouTube.',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Search tools missing')).toBeInTheDocument();
    await expect(
      canvas.getByText('yt-dlp is required before this view can search YouTube.')
    ).toBeInTheDocument();
  },
};

/** The state SearchView opens on — a spinner badge over the mascot. */
export const Loading: Story = {
  args: {
    title: 'Preparing search',
    description: 'Checking yt-dlp and ffmpeg so this view can open cleanly.',
    loading: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Preparing search')).toBeInTheDocument();
    await expect(canvasElement.querySelector('.animate-spin')).not.toBeNull();
  },
};

/** With an action slotted in — the child renders beneath the description. */
export const WithAction: Story = {
  args: {
    title: 'Search tools missing',
    description: 'Install yt-dlp and ffmpeg to search YouTube.',
    children: (
      <button type="button" onClick={onInstall}>
        Install Missing Tools
      </button>
    ),
  },
  argTypes: {
    children: { control: false },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const install = canvas.getByRole('button', { name: 'Install Missing Tools' });
    await expect(install).toBeInTheDocument();

    await userEvent.click(install);
    await expect(onInstall).toHaveBeenCalled();
  },
};
