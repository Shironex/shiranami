import { describe, expect, it } from 'vitest';
import { isUnderFolder, selectFolders, tracksInFolders } from './folderScope';

const folders = [
  { id: 'a', path: '/music/lofi' },
  { id: 'b', path: 'C:\\Music' },
];

describe('selectFolders', () => {
  it('keeps every folder without a scope', () => {
    expect(selectFolders(folders)).toEqual(folders);
  });

  it('keeps only the named folders and ignores unknown ids', () => {
    expect(selectFolders(folders, ['b', 'gone'])).toEqual([folders[1]]);
  });

  it('an empty scope selects nothing', () => {
    expect(selectFolders(folders, [])).toEqual([]);
  });
});

describe('isUnderFolder', () => {
  it('matches files under the folder on either separator', () => {
    expect(isUnderFolder('/music/lofi/a.mp3', '/music/lofi')).toBe(true);
    expect(isUnderFolder('/music/lofi/album/a.mp3', '/music/lofi')).toBe(true);
    expect(isUnderFolder('C:\\Music\\a.mp3', 'C:\\Music')).toBe(true);
  });

  it('does not match a sibling that shares the prefix', () => {
    expect(isUnderFolder('/music/lofi-archive/a.mp3', '/music/lofi')).toBe(false);
  });

  it('handles a root that already ends in a separator', () => {
    expect(isUnderFolder('D:\\a.mp3', 'D:\\')).toBe(true);
  });
});

describe('tracksInFolders', () => {
  const tracks = [
    { id: '1', filePath: '/music/lofi/a.mp3' },
    { id: '2', filePath: '/elsewhere/b.mp3' },
    { id: '3', filePath: 'C:\\Music\\c.mp3' },
  ];

  it('keeps every track without a scope', () => {
    expect(tracksInFolders(tracks)).toEqual(tracks);
  });

  it('keeps only tracks under the scoped folders', () => {
    expect(tracksInFolders(tracks, [folders[0]]).map(t => t.id)).toEqual(['1']);
  });
});
