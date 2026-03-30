import { describe, it, expect } from 'vitest';
import { isAudioFile } from './metadata-service';

describe('isAudioFile', () => {
  it.each([
    '.mp3', '.flac', '.wav', '.ogg', '.aac', '.m4a', '.opus', '.wma', '.weba', '.webm',
  ])('returns true for %s', (ext) => {
    expect(isAudioFile(`track${ext}`)).toBe(true);
  });

  it('is case insensitive', () => {
    expect(isAudioFile('track.MP3')).toBe(true);
    expect(isAudioFile('track.Flac')).toBe(true);
    expect(isAudioFile('track.WAV')).toBe(true);
  });

  it('returns false for unsupported extensions', () => {
    expect(isAudioFile('file.txt')).toBe(false);
    expect(isAudioFile('image.png')).toBe(false);
    expect(isAudioFile('video.mp4')).toBe(false);
  });

  it('returns false for files with no extension', () => {
    expect(isAudioFile('noextension')).toBe(false);
  });
});
