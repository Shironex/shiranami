import { createRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
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

const meta: Meta<typeof PlaylistDetailHeader> = {
  title: 'playlists/PlaylistDetailHeader',
  component: PlaylistDetailHeader,
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
    setEditName: () => {},
    nameInputRef: createRef<HTMLInputElement>(),
    showDeleteConfirm: false,
    setShowDeleteConfirm: () => {},
    onBack: () => {},
    onPlayAll: () => {},
    onDelete: () => {},
    onStartEdit: () => {},
    onSaveName: () => {},
    onNameKeyDown: () => {},
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

export const Default: Story = {};

export const Empty: Story = {
  args: {
    playlist: makePlaylist({ name: 'Fresh start' }),
    trackCount: 0,
    totalDuration: 0,
    hasTracks: false,
  },
};
