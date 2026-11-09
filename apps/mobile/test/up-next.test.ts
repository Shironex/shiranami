import { upNextEntries, upNextSummary } from '@/lib/up-next';
import type { Track } from '@/stores/usePlayerStore';

const t = (id: string, duration = 120): Track => ({
  id,
  title: id,
  artist: 'A',
  album: 'B',
  duration,
  filePath: `file:///${id}.mp3`,
});

describe('up next', () => {
  it('lists the songs after the playing one with their queue slots', () => {
    const queue = [t('a'), t('b'), t('c'), t('d')];
    expect(upNextEntries(queue, 1).map(e => [e.track.id, e.index])).toEqual([
      ['c', 2],
      ['d', 3],
    ]);
    expect(upNextEntries(queue, 3)).toEqual([]);
    expect(upNextEntries(queue, -1).map(e => e.index)).toEqual([0, 1, 2, 3]);
  });

  it('sums the count and length', () => {
    expect(upNextSummary(upNextEntries([t('a'), t('b', 600), t('c', 1440)], 0))).toBe(
      '2 songs, 34 min'
    );
    expect(upNextSummary(upNextEntries([t('a'), t('b', 0)], 0))).toBe('1 song');
  });
});
