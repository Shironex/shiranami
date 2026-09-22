import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import CompanionPerch from './CompanionPerch';
import { stopCompanionDriver } from '@/lib/companionDriver';
import { createCompanionState } from '@/lib/companionMachine';
import { useCompanionRuntimeStore } from '@/stores/useCompanionRuntimeStore';
import { useInterfaceStore } from '@/stores/useInterfaceStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useViewStore } from '@/stores/useViewStore';
import { useLyricsAppearanceStore } from '@/stores/useLyricsAppearanceStore';
import type { Track } from '@/stores/types';

const track: Track = {
  id: 'a',
  title: 'Track',
  artist: 'Artist',
  album: 'Album',
  duration: 180,
  filePath: '/music/a.mp3',
  bpm: 80,
  loudnessLufs: -15,
};

/* Presence now reads the cached weather query, so the perch needs a client. */
function renderPerch() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CompanionPerch />
    </QueryClientProvider>
  );
}

describe('CompanionPerch', () => {
  beforeEach(() => {
    useCompanionRuntimeStore.setState({ machine: createCompanionState(), suspended: false });
    useInterfaceStore.setState({ companion: true });
    usePlaybackStore.setState({ currentTrack: track, isPlaying: true });
    useViewStore.setState({ rightPanel: null, activeView: 'library' });
    useLyricsAppearanceStore.setState({ lyricsPresentation: 'list' });
  });

  afterEach(() => {
    stopCompanionDriver();
    useCompanionRuntimeStore.setState({ machine: createCompanionState(), suspended: false });
    usePlaybackStore.setState({ currentTrack: null, isPlaying: false });
  });

  it('renders the sprite, hidden from assistive tech, pointer-inert outside the hitbox', () => {
    const { container } = renderPerch();
    const wrap = container.querySelector('[data-slot="companion-perch"]');
    expect(wrap).not.toBeNull();
    expect(wrap).toHaveAttribute('aria-hidden', 'true');
    expect(wrap).toHaveClass('pointer-events-none');
    // Only the body hitbox accepts the pointer.
    const hitbox = container.querySelector('[data-slot="companion-hitbox"]');
    expect(hitbox).toHaveClass('pointer-events-auto');
    // Listening: the sprite is mid-loop on the machine's real state.
    expect(container.querySelector('svg')).toHaveAttribute('data-state', 'listening');
  });

  it('unmounts entirely when the master toggle turns the companion off', () => {
    useInterfaceStore.setState({ companion: false });
    const { container } = renderPerch();
    expect(container.querySelector('[data-slot="companion-perch"]')).toBeNull();
  });

  it('slides behind the bar edge during lyric focus instead of unmounting', () => {
    useLyricsAppearanceStore.setState({ lyricsPresentation: 'focus' });
    useViewStore.setState({ rightPanel: 'lyrics' });
    const { container } = renderPerch();
    const wrap = container.querySelector('[data-slot="companion-perch"]');
    expect(wrap).not.toBeNull();
    expect(wrap).toHaveClass('opacity-0');
  });

  it('overlaps the bar top edge so the resident sits on the border', () => {
    const { container } = renderPerch();
    const wrap = container.querySelector('[data-slot="companion-perch"]') as HTMLElement;
    // The horizontal seat uses clamp() (dropped by jsdom's CSS parser), so
    // only the numeric parts are assertable here.
    expect(wrap.style.top).toBe('-46px');
    expect(wrap.style.width).toBe('56px');
  });
});
