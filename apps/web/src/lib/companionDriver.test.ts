import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeCompanionInputs,
  ensureCompanionDriver,
  stopCompanionDriver,
  type ICompanionInputsSnapshot,
} from './companionDriver';
import { COMPANION_CAMEO_MS, COMPANION_SETTLE_MS, createCompanionState } from './companionMachine';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useInterfaceStore } from '@/stores/useInterfaceStore';
import { useCompanionRuntimeStore } from '@/stores/useCompanionRuntimeStore';
import { useSleepTimerStore } from '@/stores/useSleepTimerStore';
import { useRecapStore } from '@/stores/useRecapStore';
import type { Track } from '@/stores/types';

function snapshot(overrides: Partial<ICompanionInputsSnapshot> = {}): ICompanionInputsSnapshot {
  return {
    enabled: true,
    playing: false,
    trackId: null,
    bpm: null,
    loudnessLufs: null,
    lyricsPresentation: 'list',
    rightPanel: null,
    activeView: 'library',
    nowPlayingPanel: null,
    windDown: false,
    recapVisible: false,
    ...overrides,
  };
}

function track(id: string): Track {
  return {
    id,
    title: 'Track',
    artist: 'Artist',
    album: 'Album',
    duration: 180,
    filePath: `/music/${id}.mp3`,
    bpm: 84,
    loudnessLufs: -15,
  };
}

describe('computeCompanionInputs', () => {
  it('maps lyric focus only while a lyric surface is actually showing', () => {
    expect(computeCompanionInputs(snapshot({ lyricsPresentation: 'focus' })).lyricFocus).toBe(
      false
    );
    expect(
      computeCompanionInputs(snapshot({ lyricsPresentation: 'focus', rightPanel: 'lyrics' }))
        .lyricFocus
    ).toBe(true);
    expect(
      computeCompanionInputs(
        snapshot({
          lyricsPresentation: 'focus',
          activeView: 'now-playing',
          nowPlayingPanel: 'lyrics',
        })
      ).lyricFocus
    ).toBe(true);
    // The list presentation never hides the pet, panel open or not.
    expect(
      computeCompanionInputs(snapshot({ lyricsPresentation: 'list', rightPanel: 'lyrics' }))
        .lyricFocus
    ).toBe(false);
  });
});

describe('ensureCompanionDriver', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useCompanionRuntimeStore.setState({ machine: createCompanionState(), suspended: false });
    usePlaybackStore.setState({ currentTrack: null, isPlaying: false });
    useInterfaceStore.setState({ companion: true });
  });

  afterEach(() => {
    stopCompanionDriver();
    vi.useRealTimers();
    usePlaybackStore.setState({ currentTrack: null, isPlaying: false });
    useInterfaceStore.setState({ companion: true });
    useSleepTimerStore.setState({ windDown: false });
    useRecapStore.setState({ cardVisible: false });
  });

  it('follows playback into listening, drowsy, and (after the settle) sleep', () => {
    ensureCompanionDriver();

    usePlaybackStore.setState({ currentTrack: track('a'), isPlaying: true });
    expect(useCompanionRuntimeStore.getState().machine.mode).toBe('listening');

    usePlaybackStore.setState({ isPlaying: false });
    expect(useCompanionRuntimeStore.getState().machine.mode).toBe('drowsy');

    vi.advanceTimersByTime(COMPANION_SETTLE_MS);
    expect(useCompanionRuntimeStore.getState().machine.mode).toBe('sleeping');
  });

  it('ripples on a track change and clears the overlay after its window', () => {
    ensureCompanionDriver();
    usePlaybackStore.setState({ currentTrack: track('a'), isPlaying: true });
    usePlaybackStore.setState({ currentTrack: track('b') });

    expect(useCompanionRuntimeStore.getState().machine.overlay).toBe('ripple');
    vi.advanceTimersByTime(2000);
    expect(useCompanionRuntimeStore.getState().machine.overlay).toBeNull();
  });

  it('honors the master toggle immediately', () => {
    ensureCompanionDriver();
    usePlaybackStore.setState({ currentTrack: track('a'), isPlaying: true });
    useInterfaceStore.setState({ companion: false });
    expect(useCompanionRuntimeStore.getState().machine.mode).toBe('hidden');
  });

  it('yawns while the sleep-timer wind-down plays', () => {
    ensureCompanionDriver();
    usePlaybackStore.setState({ currentTrack: track('a'), isPlaying: true });
    useSleepTimerStore.setState({ windDown: true });
    expect(useCompanionRuntimeStore.getState().machine.mode).toBe('wind-down-yawn');

    useSleepTimerStore.setState({ windDown: false });
    expect(useCompanionRuntimeStore.getState().machine.mode).toBe('listening');
  });

  it('plays the recap cameo when the card appears, then returns to the loop', () => {
    ensureCompanionDriver();
    usePlaybackStore.setState({ currentTrack: track('a'), isPlaying: true });
    useRecapStore.getState().setCardVisible(true);
    expect(useCompanionRuntimeStore.getState().machine.mode).toBe('recap-cameo');

    vi.advanceTimersByTime(COMPANION_CAMEO_MS);
    expect(useCompanionRuntimeStore.getState().machine.mode).toBe('listening');
  });

  it('runs without a companion backend surface (local fallback: stage 0)', () => {
    // The shared setup's electronAPI mock has no `companion` namespace, so the
    // driver must come up cleanly with the ledger marked absent.
    ensureCompanionDriver();
    const runtime = useCompanionRuntimeStore.getState();
    expect(runtime.ledger.hasBackend).toBe(false);
    expect(runtime.machine.stage).toBe(0);
  });
});
