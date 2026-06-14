import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Playlist } from '@/types/electron';
import type { usePlaylistCover } from '@/hooks/usePlaylistCover';

import PlaylistDetailHeader from './PlaylistDetailHeader';
import type { IPlaylistDetailHeaderProps } from './PlaylistDetailHeader.types';

type PlaylistCover = ReturnType<typeof usePlaylistCover>;

function makeCover(): PlaylistCover {
  return {
    showCoverMenu: false,
    setShowCoverMenu: vi.fn(),
    isUpdatingCover: false,
    coverMenuRef: createRef<HTMLDivElement>(),
    coverInputRef: createRef<HTMLInputElement>(),
    handleCoverFileSelected: vi.fn(),
    handlePickCustomCover: vi.fn(),
    handleUseSuggestedCover: vi.fn(),
    handleClearCover: vi.fn(),
  };
}

function makePlaylist(overrides: Partial<Playlist> = {}): Playlist {
  return {
    id: 'pl-1',
    name: 'Late-night focus',
    description: undefined,
    coverArt: undefined,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function renderHeader(overrides: Partial<IPlaylistDetailHeaderProps> = {}) {
  const props: IPlaylistDetailHeaderProps = {
    playlist: makePlaylist(),
    selectedPlaylistId: 'pl-1',
    trackCount: 12,
    totalDuration: 2580,
    hasTracks: true,
    suggestedCoverArt: undefined,
    cover: makeCover(),
    isEditing: false,
    editName: '',
    setEditName: vi.fn(),
    nameInputRef: createRef<HTMLInputElement>(),
    showDeleteConfirm: false,
    setShowDeleteConfirm: vi.fn(),
    onBack: vi.fn(),
    onPlayAll: vi.fn(),
    onDelete: vi.fn(),
    onStartEdit: vi.fn(),
    onSaveName: vi.fn(),
    onNameKeyDown: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<PlaylistDetailHeader {...props} />) };
}

describe('PlaylistDetailHeader', () => {
  it('renders the playlist name and the track count + duration subtitle', () => {
    renderHeader({ playlist: makePlaylist({ name: 'Rainy day cafe' }), trackCount: 12 });

    expect(screen.getByText('Rainy day cafe')).toBeInTheDocument();
    expect(screen.getByText(/12 tracks/)).toBeInTheDocument();
  });

  it('calls onPlayAll when Play All is clicked', () => {
    const onPlayAll = vi.fn();
    renderHeader({ onPlayAll });

    fireEvent.click(screen.getByText('Play All'));

    expect(onPlayAll).toHaveBeenCalledTimes(1);
  });

  it('disables Play All when the playlist has no tracks', () => {
    renderHeader({ hasTracks: false });

    expect(screen.getByText('Play All').closest('button')).toBeDisabled();
  });

  it('opens the inline name editor on start-edit', () => {
    const onStartEdit = vi.fn();
    renderHeader({ onStartEdit });

    fireEvent.click(screen.getByTitle('Click to rename'));

    expect(onStartEdit).toHaveBeenCalledTimes(1);
  });
});
