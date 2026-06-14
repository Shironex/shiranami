import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LyricLine } from '@/hooks/queries/useLyrics';
import type { ILyricsBodyProps } from './LyricsBody.types';

import LyricsBody from './LyricsBody';

const SYNCED: LyricLine[] = [
  { time: 0, text: 'Synced first line' },
  { time: 5, text: 'Synced second line' },
];

function makeProps(overrides: Partial<ILyricsBodyProps> = {}): ILyricsBodyProps {
  return {
    synced: null,
    plain: null,
    activeLine: 0,
    isLoading: false,
    onLineClick: vi.fn(),
    loadingLabel: 'Finding lyrics',
    emptyLabel: 'No lyrics found',
    syncedDimOpacity: 0.4,
    plainOpacity: 0.85,
    syncedBaseClassName: 'base',
    syncedActiveClassName: 'active',
    syncedPastClassName: 'past',
    syncedIdleClassName: 'idle',
    plainTextClassName: 'plain-text',
    ...overrides,
  };
}

describe('LyricsBody', () => {
  it('shows the loading label while loading', () => {
    render(<LyricsBody {...makeProps({ isLoading: true })} />);

    expect(screen.getByText('Finding lyrics')).toBeInTheDocument();
  });

  it('renders the synced lyric lines when synced lyrics are present', () => {
    render(<LyricsBody {...makeProps({ synced: SYNCED })} />);

    expect(screen.getByRole('button', { name: 'Synced first line' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Synced second line' })).toBeInTheDocument();
  });

  it('renders the plain lyrics when there are no synced lines', () => {
    render(<LyricsBody {...makeProps({ plain: 'Just plain lyrics here' })} />);

    expect(screen.getByText('Just plain lyrics here')).toBeInTheDocument();
  });

  it('shows the empty label when neither synced nor plain lyrics exist', () => {
    render(<LyricsBody {...makeProps()} />);

    expect(screen.getByText('No lyrics found')).toBeInTheDocument();
  });
});
