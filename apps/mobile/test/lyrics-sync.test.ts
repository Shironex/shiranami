import {
  KARAOKE_MAX_LINE_SECONDS,
  KARAOKE_MIN_LINE_SECONDS,
  LYRIC_FOLLOW_RESUME_MS,
  activeLyricIndex,
  followPaused,
  followScrollTarget,
  karaokeElapsed,
  karaokeLineDuration,
  karaokeNeedsResync,
  karaokeWordProgress,
  karaokeWords,
  lyricLineState,
} from '@/lib/lyrics-sync';

const lines = [
  { time: 10, text: 'Walked into the ER' },
  { time: 14, text: 'Doctor, fix my broken heart' },
  { time: 18.5, text: 'Lost without my baby' },
  { time: 40, text: 'Need to feel her daily' },
];

describe('active line', () => {
  it('is -1 before the first line and with no lines', () => {
    expect(activeLyricIndex(lines, 0)).toBe(-1);
    expect(activeLyricIndex(lines, 9.99)).toBe(-1);
    expect(activeLyricIndex(null, 20)).toBe(-1);
    expect(activeLyricIndex([], 20)).toBe(-1);
  });

  it('turns over exactly on each timestamp and holds until the next', () => {
    expect(activeLyricIndex(lines, 10)).toBe(0);
    expect(activeLyricIndex(lines, 13.99)).toBe(0);
    expect(activeLyricIndex(lines, 14)).toBe(1);
    expect(activeLyricIndex(lines, 30)).toBe(2);
    expect(activeLyricIndex(lines, 400)).toBe(3);
  });

  it('jumps straight to the right line after a seek either way', () => {
    expect(activeLyricIndex(lines, 41)).toBe(3);
    expect(activeLyricIndex(lines, 11)).toBe(0);
  });

  it('marks lines around the active one', () => {
    expect([0, 1, 2].map(i => lyricLineState(i, 1))).toEqual(['past', 'now', 'next']);
    expect(lyricLineState(0, -1)).toBe('next');
  });
});

describe('karaoke timing', () => {
  it('runs a line over the gap to the next one', () => {
    expect(karaokeLineDuration(lines, 0)).toBe(4);
    expect(karaokeLineDuration(lines, 1)).toBe(4.5);
  });

  it('caps a line followed by a long instrumental gap to a text estimate', () => {
    const duration = karaokeLineDuration(lines, 2);
    expect(duration).toBeLessThanOrEqual(KARAOKE_MAX_LINE_SECONDS);
    expect(duration).toBeGreaterThanOrEqual(KARAOKE_MIN_LINE_SECONDS);
    expect(duration).toBeCloseTo('Lost without my baby'.length * 0.12);
  });

  it('estimates the last line and never divides by zero on equal stamps', () => {
    expect(karaokeLineDuration(lines, 3)).toBeGreaterThan(0);
    expect(
      karaokeLineDuration(
        [
          { time: 5, text: 'a' },
          { time: 5, text: 'b' },
        ],
        0
      )
    ).toBe(0.1);
  });

  it('clamps how far playback is into a line', () => {
    expect(karaokeElapsed(9, 10, 4)).toBe(0);
    expect(karaokeElapsed(12.5, 10, 4)).toBe(2.5);
    expect(karaokeElapsed(30, 10, 4)).toBe(4);
  });

  it('splits words back to back by length', () => {
    const words = karaokeWords('ab  cd ef', 6);
    expect(words.map(w => w.text)).toEqual(['ab', 'cd', 'ef']);
    expect(words.map(w => w.start)).toEqual([0, 2, 4]);
    expect(words.every(w => w.duration === 2)).toBe(true);
  });

  it('fills each word in turn', () => {
    const [first, second] = karaokeWords('ab cd', 4);
    expect(karaokeWordProgress(first, 1)).toBe(0.5);
    expect(karaokeWordProgress(second, 1)).toBe(0);
    expect(karaokeWordProgress(second, 3)).toBe(0.5);
    expect(karaokeWordProgress(first, 9)).toBe(1);
  });
});

describe('karaoke resync', () => {
  it('keeps a fill that tracks the player', () => {
    expect(karaokeNeedsResync(2, 12.1, 10, 4)).toBe(false);
  });

  it('restarts after a seek inside the same line', () => {
    expect(karaokeNeedsResync(3, 10.5, 10, 4)).toBe(true);
    expect(karaokeNeedsResync(0.5, 13, 10, 4)).toBe(true);
  });

  it('restarts when repeat one takes the song back to the first line', () => {
    // Fill finished on the last line, playback is back before the first.
    expect(karaokeNeedsResync(4, 0, 10, 4)).toBe(true);
  });

  it('leaves a finished fill alone while playback is past the line', () => {
    expect(karaokeNeedsResync(4, 16, 10, 4)).toBe(false);
  });
});

describe('follow scrolling', () => {
  it('puts the middle of the line a third of the way down', () => {
    expect(followScrollTarget({ y: 600, height: 30 }, 300, 2000)).toBe(515);
  });

  it('never scrolls above the top or past the end', () => {
    expect(followScrollTarget({ y: 20, height: 30 }, 300, 2000)).toBe(0);
    expect(followScrollTarget({ y: 1950, height: 30 }, 300, 2000)).toBe(1700);
    expect(followScrollTarget({ y: 100, height: 30 }, 300, 200)).toBe(0);
  });

  it('waits a few seconds after a hand scroll before following again', () => {
    expect(followPaused(null, 5000)).toBe(false);
    expect(followPaused(1000, 1000 + LYRIC_FOLLOW_RESUME_MS - 1)).toBe(true);
    expect(followPaused(1000, 1000 + LYRIC_FOLLOW_RESUME_MS)).toBe(false);
  });
});
