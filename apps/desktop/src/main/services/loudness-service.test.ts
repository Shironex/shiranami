import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { measureLoudnessNative } from '../workers/loudness-host';
import { isFFmpegInstalled } from '../downloads/ffmpeg-manager';
import { measureLoudness, parseIntegratedLufs } from './loudness-service';

vi.mock('fs', () => ({ existsSync: vi.fn(() => true) }));
vi.mock('child_process', () => ({ execFile: vi.fn() }));
vi.mock('../workers/loudness-host', () => ({ measureLoudnessNative: vi.fn() }));
vi.mock('../downloads/ffmpeg-manager', () => ({
  isFFmpegInstalled: vi.fn(() => true),
  getFFmpegPath: vi.fn(() => 'ffmpeg'),
}));

/** Drive the mocked execFile callback as if ffmpeg printed a loudnorm JSON block
 *  with the given integrated loudness to stderr (where loudnorm writes it). */
function ffmpegReturns(inputI: string): void {
  vi.mocked(execFile).mockImplementation(((..._args: unknown[]) => {
    const cb = _args[_args.length - 1] as (e: unknown, o: string, s: string) => void;
    cb(null, '', `{ "input_i" : "${inputI}" }`);
    return {} as ReturnType<typeof execFile>;
  }) as typeof execFile);
}

describe('measureLoudness dispatch', () => {
  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(isFFmpegInstalled).mockReturnValue(true);
  });
  afterEach(() => vi.clearAllMocks());

  it('returns the native LUFS without touching ffmpeg when status is ok', async () => {
    vi.mocked(measureLoudnessNative).mockResolvedValue({ status: 'ok', lufs: -14.2 });
    expect(await measureLoudness('/x.mp3')).toBeCloseTo(-14.2);
    expect(execFile).not.toHaveBeenCalled();
  });

  it('returns null (skip) on a silent native result without touching ffmpeg', async () => {
    vi.mocked(measureLoudnessNative).mockResolvedValue({ status: 'silent' });
    expect(await measureLoudness('/x.mp3')).toBeNull();
    expect(execFile).not.toHaveBeenCalled();
  });

  it('falls back to ffmpeg when the native addon reports undecodable', async () => {
    vi.mocked(measureLoudnessNative).mockResolvedValue({ status: 'undecodable' });
    ffmpegReturns('-23.5');
    expect(await measureLoudness('/x.m4a')).toBeCloseTo(-23.5);
    expect(execFile).toHaveBeenCalledOnce();
  });

  it('returns null when undecodable and ffmpeg is not installed', async () => {
    vi.mocked(measureLoudnessNative).mockResolvedValue({ status: 'undecodable' });
    vi.mocked(isFFmpegInstalled).mockReturnValue(false);
    expect(await measureLoudness('/x.m4a')).toBeNull();
    expect(execFile).not.toHaveBeenCalled();
  });

  it('returns null and never dispatches when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await measureLoudness('/x.mp3', controller.signal)).toBeNull();
    expect(measureLoudnessNative).not.toHaveBeenCalled();
  });

  it('returns null and never dispatches when the file is missing', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(await measureLoudness('/missing.mp3')).toBeNull();
    expect(measureLoudnessNative).not.toHaveBeenCalled();
  });
});

describe('parseIntegratedLufs', () => {
  it('extracts the integrated loudness from a loudnorm JSON block in stderr', () => {
    const stderr = [
      '[Parsed_loudnorm_0 @ 0x123] ',
      '{',
      '\t"input_i" : "-18.42",',
      '\t"input_tp" : "-3.20",',
      '\t"input_lra" : "7.10",',
      '\t"input_thresh" : "-28.50",',
      '\t"output_i" : "-24.00"',
      '}',
    ].join('\n');
    expect(parseIntegratedLufs(stderr)).toBeCloseTo(-18.42);
  });

  it('returns null for non-finite (silent track) loudness', () => {
    const stderr = '{ "input_i" : "-inf", "input_tp" : "-120.0" }';
    expect(parseIntegratedLufs(stderr)).toBeNull();
  });

  it('returns null when no JSON block is present', () => {
    expect(parseIntegratedLufs('ffmpeg version 6.0 ... no json here')).toBeNull();
  });

  it('returns null when input_i is missing', () => {
    expect(parseIntegratedLufs('{ "input_tp" : "-3.2" }')).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    expect(parseIntegratedLufs('{ "input_i" : ')).toBeNull();
  });
});
