import { useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { screen, userEvent, expect, fn } from 'storybook/test';
import type { SearchResult } from '@shiranami/contracts';
import { useSelectionStore } from '@/stores/useSelectionStore';
import type { PlaylistTrack } from '@/stores/usePlaylistImportStore';

import ImportBulkActionBar from './ImportBulkActionBar';

function makeTrack(id: string, status: PlaylistTrack['status'] = 'pending'): PlaylistTrack {
  const searchResult: SearchResult = {
    id: `result-${id}`,
    title: `Track ${id}`,
    uploader: 'Lofi Girl',
    duration: 184,
    thumbnail: '',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    webpage_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  };
  return { id, searchResult, status, progress: 0 };
}

const TRACKS: PlaylistTrack[] = [makeTrack('a'), makeTrack('b'), makeTrack('c')];

/** Seed a selection so the bar renders, then clear it on unmount. */
function withSelection(ids: string[]) {
  return function Decorator(Story: () => React.ReactElement) {
    useEffect(() => {
      useSelectionStore.setState({ selectedTrackIds: new Set(ids), lastClickedIndex: null });
      return () => useSelectionStore.getState().clearSelection();
    }, []);
    return <Story />;
  };
}

/**
 * playlist-import · ImportBulkActionBar. The floating multi-select dock for the
 * import view: a selected-count label, a select-all / clear toggle, and
 * download + remove actions (both hidden while an import is running). Reads the
 * shared `useSelectionStore` and renders nothing with an empty selection. It
 * portals to `document.body` as a labelled `role="toolbar"`, so stories query it
 * via `screen`. Stories seed a selection and drive the actions.
 */
const meta: Meta<typeof ImportBulkActionBar> = {
  title: 'playlist-import/ImportBulkActionBar',
  component: ImportBulkActionBar,
  parameters: {
    // The dock is a labelled role="toolbar" and every action button carries an
    // aria-label (icons are decorative) — axe passes clean.
    a11y: { test: 'error' },
  },
  args: {
    tracks: TRACKS,
    isImporting: false,
    onDownloadSelected: fn(),
    onRemoveSelected: fn(),
  },
};

export default meta;

type Story = StoryObj<typeof ImportBulkActionBar>;

/** Two of three selected — download + remove actions; download fires its callback. */
export const Default: Story = {
  decorators: [withSelection(['a', 'b'])],
  play: async ({ args }) => {
    const toolbar = await screen.findByRole('toolbar', { name: 'Bulk actions' });
    await expect(toolbar).toHaveTextContent('2 selected');
    await expect(screen.getByRole('button', { name: 'Select All' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^Download/ }));
    await expect(args.onDownloadSelected).toHaveBeenCalled();
  },
};

/** All selected — the toggle reads as "Clear Selection". */
export const AllSelected: Story = {
  decorators: [withSelection(['a', 'b', 'c'])],
  play: async () => {
    await screen.findByRole('toolbar', { name: 'Bulk actions' });
    // With everything selected the select-all toggle relabels from "Select All"
    // to "Clear Selection" — so it now matches the trailing clear button, and
    // exactly two controls carry that name (1 → 2). Asserting both the absence of
    // "Select All" and the count of 2 pins the relabel down: the trailing clear
    // button alone (always present) can't satisfy either check.
    await expect(screen.queryByRole('button', { name: 'Select All' })).not.toBeInTheDocument();
    await expect(screen.getAllByRole('button', { name: 'Clear Selection' })).toHaveLength(2);
  },
};

/** Importing — download + remove are suppressed; only the toggle + clear remain. */
export const Importing: Story = {
  args: { isImporting: true },
  decorators: [withSelection(['a', 'b'])],
  play: async () => {
    await screen.findByRole('toolbar', { name: 'Bulk actions' });
    await expect(screen.queryByRole('button', { name: /^Download/ })).not.toBeInTheDocument();
    await expect(screen.queryByRole('button', { name: 'Remove selected' })).not.toBeInTheDocument();
  },
};
