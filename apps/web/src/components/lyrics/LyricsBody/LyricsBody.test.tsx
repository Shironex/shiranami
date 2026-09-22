import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    isError: false,
    onLineClick: vi.fn(),
    onRetry: vi.fn(),
    loadingLabel: 'Finding lyrics',
    emptyLabel: 'No lyrics found',
    errorLabel: 'Lyrics failed to load',
    retryLabel: 'Retry',
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

  it('shows the error branch with a retry action when the fetch failed', async () => {
    const onRetry = vi.fn();
    render(<LyricsBody {...makeProps({ isError: true, onRetry })} />);

    expect(screen.getByText('Lyrics failed to load')).toBeInTheDocument();
    expect(screen.queryByText('No lyrics found')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('keeps showing lyrics we already have even when a refetch failed', () => {
    render(<LyricsBody {...makeProps({ isError: true, synced: SYNCED })} />);

    expect(screen.getByRole('button', { name: 'Synced first line' })).toBeInTheDocument();
    expect(screen.queryByText('Lyrics failed to load')).not.toBeInTheDocument();
  });
});
