import { createRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect, fn } from 'storybook/test';
import type { Playlist } from '@/types/electron';
import type { usePlaylistCover } from '@/hooks/usePlaylistCover';

import PlaylistDetailHeader from './PlaylistDetailHeader';

type PlaylistCover = ReturnType<typeof usePlaylistCover>;

function makeCover(): PlaylistCover {
  return {
    showCoverMenu: false,
    setShowCoverMenu: () => {},
    isUpdatingCover: false,
    coverMenuRef: createRef<HTMLDivElement>(),
    coverInputRef: createRef<HTMLInputElement>(),
    handleCoverFileSelected: async () => {},
    handlePickCustomCover: () => {},
    handleUseSuggestedCover: async () => {},
    handleClearCover: async () => {},
  };
}

function makePlaylist(overrides: Partial<Playlist> = {}): Playlist {
  return {
    id: 'pl-1',
    name: 'Late-night focus',
    description: 'Slow beats for deep work',
    coverArt: undefined,
    createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    ...overrides,
  };
}

/**
 * playlists · PlaylistDetailHeader. The header for a playlist detail page: a
 * back action, the cover thumbnail (opens the cover menu), the editable name,
 * the track-count / duration line, and play-all + delete actions. It's a pure
 * props component (no store/query). Stories assert the labelled controls, the
 * track-count line, the disabled play-all on an empty playlist, and that the
 * name + delete actions fire their callbacks. The share action only renders
 * under Electron, so it's absent in the browser.
 */
const meta: Meta<typeof PlaylistDetailHeader> = {
  title: 'playlists/PlaylistDetailHeader',
  component: PlaylistDetailHeader,
  parameters: {
    // Back / play-all / delete icon buttons carry aria-labels, the cover button
    // is named via its title, and the name is a text button — axe passes clean.
    a11y: { test: 'error' },
  },
  args: {
    playlist: makePlaylist(),
    selectedPlaylistId: 'pl-1',
    trackCount: 12,
    totalDuration: 2580,
    hasTracks: true,
    suggestedCoverArt: undefined,
    cover: makeCover(),
    isEditing: false,
    editName: '',
    setEditName: fn(),
    nameInputRef: createRef<HTMLInputElement>(),
    showDeleteConfirm: false,
    setShowDeleteConfirm: fn(),
    onBack: fn(),
    onPlayAll: fn(),
    onDelete: fn(),
    onStartEdit: fn(),
    onSaveName: fn(),
    onNameKeyDown: fn(),
  },
  decorators: [
    Story => (
      <div className="w-[40rem]">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof PlaylistDetailHeader>;

/** Populated playlist — labelled controls, track count, and callback wiring. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Back to playlists' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Edit playlist cover' })).toBeInTheDocument();
    await expect(canvas.getByText('12 tracks · 43:00')).toBeInTheDocument();

    const playAll = canvas.getByRole('button', { name: 'Play All' });
    await expect(playAll).toBeEnabled();

    // The name button (when not editing) starts an inline rename.
    await userEvent.click(canvas.getByRole('button', { name: 'Late-night focus' }));
    await expect(args.onStartEdit).toHaveBeenCalled();

    // The delete button opens the confirm popover via the setter.
    await userEvent.click(canvas.getByRole('button', { name: 'Delete playlist' }));
    await expect(args.setShowDeleteConfirm).toHaveBeenCalledWith(true);
  },
};

/** Empty playlist — zero tracks and a disabled play-all action. */
export const Empty: Story = {
  args: {
    playlist: makePlaylist({ name: 'Fresh start' }),
    trackCount: 0,
    totalDuration: 0,
    hasTracks: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Fresh start' })).toBeInTheDocument();
    await expect(canvas.getByText('0 tracks')).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Play All' })).toBeDisabled();
  },
};

/** The delete-confirm popover is shown — its confirm + cancel actions render. */
export const ConfirmingDelete: Story = {
  args: {
    showDeleteConfirm: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Delete this playlist?')).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  },
};
