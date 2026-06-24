import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import { analyzeTrackNative } from '../workers/analysis-host';
import { analyzeTrack } from './analysis-service';

vi.mock('fs', () => ({ existsSync: vi.fn(() => true) }));
vi.mock('../workers/analysis-host', () => ({ analyzeTrackNative: vi.fn() }));

describe('analyzeTrack dispatch', () => {
  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
  });
  afterEach(() => vi.clearAllMocks());

  it('returns bpm + key when the native addon reports ok', async () => {
    vi.mocked(analyzeTrackNative).mockResolvedValue({ status: 'ok', bpm: 128.4, key: 'A minor' });
    expect(await analyzeTrack('/x.mp3')).toEqual({ bpm: 128.4, musicalKey: 'A minor' });
  });

  it('collapses a 0 bpm to null but keeps a detected key', async () => {
    vi.mocked(analyzeTrackNative).mockResolvedValue({ status: 'ok', bpm: 0, key: 'C major' });
    expect(await analyzeTrack('/x.mp3')).toEqual({ bpm: null, musicalKey: 'C major' });
  });

  it('collapses an empty key to null but keeps a detected bpm', async () => {
    vi.mocked(analyzeTrackNative).mockResolvedValue({ status: 'ok', bpm: 90, key: '' });
    expect(await analyzeTrack('/x.mp3')).toEqual({ bpm: 90, musicalKey: null });
  });

  it('returns null when ok but neither bpm nor key was detected', async () => {
    vi.mocked(analyzeTrackNative).mockResolvedValue({ status: 'ok', bpm: 0, key: '' });
    expect(await analyzeTrack('/x.mp3')).toBeNull();
  });

  it('returns null (nothing to persist) when the addon reports unanalyzable', async () => {
    vi.mocked(analyzeTrackNative).mockResolvedValue({ status: 'unanalyzable' });
    expect(await analyzeTrack('/x.m4a')).toBeNull();
  });

  it('returns null and never dispatches when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await analyzeTrack('/x.mp3', controller.signal)).toBeNull();
    expect(analyzeTrackNative).not.toHaveBeenCalled();
  });

  it('returns null and never dispatches when the file is missing', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(await analyzeTrack('/missing.mp3')).toBeNull();
    expect(analyzeTrackNative).not.toHaveBeenCalled();
  });

  it('drops the result when the signal aborts during native analysis', async () => {
    const controller = new AbortController();
    vi.mocked(analyzeTrackNative).mockImplementation(async () => {
      controller.abort();
      return { status: 'ok', bpm: 120, key: 'C major' };
    });
    expect(await analyzeTrack('/x.mp3', controller.signal)).toBeNull();
  });
});
