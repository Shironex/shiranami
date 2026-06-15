import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import type { LyricLine } from '@/hooks/queries/useLyrics';

import LyricsBody from './LyricsBody';

const SYNCED: LyricLine[] = [
  { time: 0, text: 'Warm light on the windowsill' },
  { time: 4, text: 'The kettle starting to sing' },
  { time: 8, text: 'A slow and easy morning' },
  { time: 12, text: 'Before the day begins' },
];

const baseArgs = {
  activeLine: 1,
  isLoading: false,
  onLineClick: () => {},
  loadingLabel: 'Finding lyrics...',
  emptyLabel: 'No lyrics found',
  syncedDimOpacity: 0.4,
  plainOpacity: 0.85,
  syncedSpacingClassName: 'space-y-4',
  syncedBaseClassName: 'block w-full text-left leading-relaxed font-medium text-base px-1',
  syncedActiveClassName: 'text-foreground font-semibold',
  syncedPastClassName: 'text-foreground/50',
  syncedIdleClassName: 'text-foreground/30',
  plainTextClassName: 'text-foreground whitespace-pre-wrap font-sans font-medium',
};

/**
 * lyrics · LyricsBody. The shared 4-branch lyrics render (loading → synced →
 * plain → empty) behind NowPlayingView and LyricsPanel, parameterized by each
 * surface's size-class maps, spacing, and container classes. Synced lyrics
 * render as a list of seekable line buttons; plain lyrics as a `<pre>`; the
 * loading and empty branches show a labelled spinner / music glyph. Stories
 * drive each branch via args.
 */
const meta: Meta<typeof LyricsBody> = {
  title: 'lyrics/LyricsBody',
  component: LyricsBody,
  parameters: {
    // Synced lines are real <button>s named by their text, the loading spinner
    // and empty-state glyph are aria-hidden, and the plain branch is plain
    // text — axe passes clean.
    a11y: { test: 'error' },
  },
  args: {
    ...baseArgs,
    synced: SYNCED,
    plain: null,
  },
  decorators: [
    Story => (
      <div className="flex h-[24rem] w-[28rem] flex-col p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof LyricsBody>;

/** Synced lyrics — one seekable line button per timed line. */
export const Synced: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('button', { name: 'Warm light on the windowsill' })
    ).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Before the day begins' })).toBeInTheDocument();
  },
};

/** Plain (untimed) lyrics — the raw text block, no per-line buttons. */
export const Plain: Story = {
  args: {
    synced: null,
    plain: 'Line one of the plain lyrics\nLine two\nLine three',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Line one of the plain lyrics/)).toBeInTheDocument();
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
  },
};

/** Loading — the centered spinner with its localized "finding" label. */
export const Loading: Story = {
  args: {
    synced: null,
    plain: null,
    isLoading: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Finding lyrics...')).toBeInTheDocument();
  },
};

/** Empty — the fallback music glyph + "no lyrics" label. */
export const Empty: Story = {
  args: {
    synced: null,
    plain: null,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('No lyrics found')).toBeInTheDocument();
  },
};
