import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import type { Track } from '@/stores/types';
import { useLibraryStore } from '@/stores/useLibraryStore';

import LibraryAnalysisCard from './LibraryAnalysisCard';

let nextId = 0;
function makeTrack(overrides: Partial<Track> = {}): Track {
  nextId += 1;
  return {
    id: `t${nextId}`,
    title: `Track ${nextId}`,
    artist: 'Idealism',
    album: 'Midnight Tapes',
    duration: 215,
    filePath: `/music/${nextId}.mp3`,
    isFavorite: false,
    bpm: null,
    musicalKey: null,
    ...overrides,
  };
}

/**
 * settings · LibraryAnalysisCard. The one-pass analysis engine's card: a
 * coverage line ("X of Y tracks carry tempo and key estimates") and one
 * button that decodes the pending tracks once, persisting tempo and key.
 * Doubles as the affordance that lets tempo breathing engage: an unanalysed
 * library never breathes. Reads `useLibraryStore` and the analysis IPC.
 */
const meta: Meta<typeof LibraryAnalysisCard> = {
  title: 'settings/LibraryAnalysisCard',
  component: LibraryAnalysisCard,
  parameters: {
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="max-w-xl p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof LibraryAnalysisCard>;

/** A half-analysed library: coverage line plus an enabled run button. */
export const Default: Story = {
  decorators: [
    Story => {
      useLibraryStore.setState({
        library: [makeTrack({ bpm: 80, musicalKey: 'C major' }), makeTrack()],
        libraryLoaded: true,
      });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText('1 of 2 tracks carry tempo and key estimates')
    ).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: /Analyze library/ })).toBeEnabled();
  },
};

/** Every track analysed: the check state, run disabled. */
export const AllAnalyzed: Story = {
  decorators: [
    Story => {
      useLibraryStore.setState({
        library: [
          makeTrack({ bpm: 74, musicalKey: 'F major' }),
          makeTrack({ bpm: 82, musicalKey: 'A minor' }),
        ],
        libraryLoaded: true,
      });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText('Every track carries its tempo and key estimates')
    ).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: /Analyze library/ })).toBeDisabled();
  },
};
