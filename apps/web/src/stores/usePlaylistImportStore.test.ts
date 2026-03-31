import { beforeEach, describe, expect, it } from 'vitest';
import { usePlaylistImportStore } from './usePlaylistImportStore';
import type { SearchResult } from '@/types/electron';

function makeSearchResult(id: string, overrides?: Partial<SearchResult>): SearchResult {
  return {
    id,
    title: `Title ${id}`,
    uploader: `Uploader ${id}`,
    duration: 180,
    thumbnail: `https://img.example.com/${id}.jpg`,
    url: `https://example.com/${id}`,
    webpage_url: `https://example.com/watch/${id}`,
    ...overrides,
  };
}

function resetStore() {
  usePlaylistImportStore.getState().reset();
}

describe('usePlaylistImportStore', () => {
  beforeEach(() => {
    resetStore();
  });

  // --- setTracks ---
  describe('setTracks', () => {
    it('creates PlaylistTrack objects with composite IDs', () => {
      const results = [makeSearchResult('v1'), makeSearchResult('v2')];
      usePlaylistImportStore.getState().setTracks(results);
      const tracks = usePlaylistImportStore.getState().tracks;

      expect(tracks).toHaveLength(2);
      expect(tracks[0].id).toBe('0:https://example.com/watch/v1');
      expect(tracks[1].id).toBe('1:https://example.com/watch/v2');
      expect(tracks[0].status).toBe('pending');
      expect(tracks[0].progress).toBe(0);
      expect(tracks[0].searchResult).toEqual(results[0]);
    });

    it('clears extracting state', () => {
      usePlaylistImportStore.setState({ isExtracting: true, extractProgress: { current: 1, total: 5, trackName: 'x' } });
      usePlaylistImportStore.getState().setTracks([makeSearchResult('a')]);
      expect(usePlaylistImportStore.getState().isExtracting).toBe(false);
      expect(usePlaylistImportStore.getState().extractProgress).toBeNull();
    });
  });

  // --- updateTrackStatus ---
  describe('updateTrackStatus', () => {
    it('updates matching track status and progress', () => {
      usePlaylistImportStore.getState().setTracks([makeSearchResult('v1')]);
      const id = usePlaylistImportStore.getState().tracks[0].id;

      usePlaylistImportStore.getState().updateTrackStatus(id, 'downloading', 50);
      const track = usePlaylistImportStore.getState().tracks[0];
      expect(track.status).toBe('downloading');
      expect(track.progress).toBe(50);
    });

    it('updates error field', () => {
      usePlaylistImportStore.getState().setTracks([makeSearchResult('v1')]);
      const id = usePlaylistImportStore.getState().tracks[0].id;

      usePlaylistImportStore.getState().updateTrackStatus(id, 'error', undefined, 'network failure');
      const track = usePlaylistImportStore.getState().tracks[0];
      expect(track.status).toBe('error');
      expect(track.error).toBe('network failure');
    });

    it('does not change unrelated tracks', () => {
      usePlaylistImportStore.getState().setTracks([makeSearchResult('v1'), makeSearchResult('v2')]);
      const id = usePlaylistImportStore.getState().tracks[0].id;
      usePlaylistImportStore.getState().updateTrackStatus(id, 'done', 100);
      expect(usePlaylistImportStore.getState().tracks[1].status).toBe('pending');
    });
  });

  // --- removeTrack ---
  describe('removeTrack', () => {
    it('removes a single track by id', () => {
      usePlaylistImportStore.getState().setTracks([makeSearchResult('v1'), makeSearchResult('v2')]);
      const id = usePlaylistImportStore.getState().tracks[0].id;
      usePlaylistImportStore.getState().removeTrack(id);
      expect(usePlaylistImportStore.getState().tracks).toHaveLength(1);
      expect(usePlaylistImportStore.getState().tracks[0].searchResult.id).toBe('v2');
    });
  });

  // --- removeTracks ---
  describe('removeTracks', () => {
    it('removes multiple tracks by id set', () => {
      usePlaylistImportStore.getState().setTracks([
        makeSearchResult('v1'),
        makeSearchResult('v2'),
        makeSearchResult('v3'),
      ]);
      const ids = new Set([
        usePlaylistImportStore.getState().tracks[0].id,
        usePlaylistImportStore.getState().tracks[2].id,
      ]);
      usePlaylistImportStore.getState().removeTracks(ids);
      const remaining = usePlaylistImportStore.getState().tracks;
      expect(remaining).toHaveLength(1);
      expect(remaining[0].searchResult.id).toBe('v2');
    });
  });

  // --- state transitions ---
  describe('state transitions', () => {
    it('startImporting sets isImporting and clears isCancelled', () => {
      usePlaylistImportStore.setState({ isCancelled: true });
      usePlaylistImportStore.getState().startImporting();
      const s = usePlaylistImportStore.getState();
      expect(s.isImporting).toBe(true);
      expect(s.isCancelled).toBe(false);
      expect(s.importingTrackIds).toBeNull();
    });

    it('startImporting accepts optional trackIds', () => {
      const ids = new Set(['a', 'b']);
      usePlaylistImportStore.getState().startImporting(ids);
      expect(usePlaylistImportStore.getState().importingTrackIds).toEqual(ids);
    });

    it('cancelImport sets isCancelled and clears isImporting', () => {
      usePlaylistImportStore.getState().startImporting();
      usePlaylistImportStore.getState().cancelImport();
      const s = usePlaylistImportStore.getState();
      expect(s.isCancelled).toBe(true);
      expect(s.isImporting).toBe(false);
    });

    it('reset restores initial state', () => {
      usePlaylistImportStore.getState().setTracks([makeSearchResult('v1')]);
      usePlaylistImportStore.getState().startImporting();
      usePlaylistImportStore.getState().reset();
      const s = usePlaylistImportStore.getState();
      expect(s.url).toBe('');
      expect(s.tracks).toEqual([]);
      expect(s.isImporting).toBe(false);
      expect(s.isCancelled).toBe(false);
      expect(s.isExtracting).toBe(false);
      expect(s.extractProgress).toBeNull();
      expect(s.importingTrackIds).toBeNull();
    });
  });
});
