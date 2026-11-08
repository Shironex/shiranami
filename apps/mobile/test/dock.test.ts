import { DOCK_MIN_GAP, dockBottom, dockPlayerMode, dockSliderX, dockTabWidth } from '@/lib/dock';
import type { Track } from '@/stores/usePlayerStore';

const song: Track = {
  id: 't1',
  title: 'Snowfall',
  artist: 'Idealism',
  album: 'Hiraeth',
  duration: 144,
  filePath: 'file:///snowfall.mp3',
};

describe('dock', () => {
  it('shows the player row only while something plays, without progress for radio', () => {
    expect(dockPlayerMode(null)).toBe('none');
    expect(dockPlayerMode(song)).toBe('track');
    expect(dockPlayerMode({ ...song, isLive: true })).toBe('live');
  });

  it('floats just above the gesture bar, and keeps a gap when there is no inset', () => {
    expect(dockBottom(0)).toBe(DOCK_MIN_GAP);
    expect(dockBottom(24)).toBe(26);
    expect(dockBottom(48)).toBe(50);
  });

  it('splits the row into equal tab cells inside the padding', () => {
    expect(dockTabWidth(392, 3)).toBeCloseTo((392 - 12) / 3);
    expect(dockTabWidth(392, 4)).toBe(95);
    expect(dockTabWidth(0, 3)).toBe(0);
    expect(dockTabWidth(392, 0)).toBe(0);
  });

  it('moves the squircle one cell per tab and keeps it inside the row', () => {
    const cell = dockTabWidth(392, 3);
    expect(dockSliderX(0, 392, 3)).toBe(0);
    expect(dockSliderX(2, 392, 3)).toBeCloseTo(cell * 2);
    expect(dockSliderX(5, 392, 3)).toBeCloseTo(cell * 2);
    expect(dockSliderX(-1, 392, 3)).toBe(0);
  });
});
