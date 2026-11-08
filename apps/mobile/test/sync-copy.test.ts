import {
  formatBytes,
  lastSyncLine,
  pairingNotice,
  progressLine,
  progressRatio,
  songsLine,
  syncErrorLine,
  timeAgo,
} from '@/lib/sync-copy';
import type { SyncProgress } from '@/lib/sync-run';

const NOW = Date.parse('2026-11-08T12:00:00Z');

function progress(extra: Partial<SyncProgress>): SyncProgress {
  return {
    stage: 'library',
    favorites: 214,
    playlists: 6,
    songsDone: 812,
    songsTotal: 1940,
    songsLinked: 12,
    bytesLeft: 3.2e9,
    coversDone: 0,
    coversTotal: 0,
    ...extra,
  };
}

describe('sync copy', () => {
  it('says when the last sync was', () => {
    expect(timeAgo(null, NOW)).toBeNull();
    expect(timeAgo('2026-11-08T11:59:40Z', NOW)).toBe('just now');
    expect(lastSyncLine('2026-11-08T11:58:00Z', NOW)).toBe('Up to date · 2 min ago');
    expect(timeAgo('2026-11-08T09:00:00Z', NOW)).toBe('3 h ago');
    expect(timeAgo('2026-11-07T11:00:00Z', NOW)).toBe('1 day ago');
    expect(lastSyncLine(null, NOW)).toBe('Not synced yet');
  });

  it('describes a running pull', () => {
    expect(songsLine(progress({}))).toBe('812 of 1,940 songs · 3.2 GB left');
    expect(songsLine(progress({ songsTotal: 0, songsDone: 0 }))).toBe(
      '12 already on this phone, nothing to copy'
    );
    expect(progressLine(null)).toBe('Connecting');
    expect(progressLine(progress({ stage: 'playlists' }))).toBe('Bringing over playlists');
    expect(progressLine(progress({ stage: 'covers', coversDone: 3, coversTotal: 9 }))).toBe(
      'Covers 3 of 9'
    );
    expect(progressRatio(progress({ songsDone: 0 }))).toBe(0);
    expect(progressRatio(progress({ stage: 'done' }))).toBe(1);
    expect(formatBytes(640e6)).toBe('640 MB');
  });

  it('names the desktop in the pairing and sync messages', () => {
    expect(pairingNotice('denied', 'Studio PC').body).toContain('Studio PC');
    expect(pairingNotice('expired', 'Studio PC').title).toBe('This code has expired');
    expect(pairingNotice('unreachable', 'Studio PC').title).toBe("Can't reach Studio PC");
    expect(syncErrorLine('unpaired', 'Studio PC')).toContain('pair again');
  });
});
