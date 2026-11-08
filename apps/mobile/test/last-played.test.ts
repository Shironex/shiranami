import type { SQLiteDatabase } from 'expo-sqlite';
import { loadLastPlayed, saveLastStation, saveLastTrack } from '@/lib/last-played';

function fakeDb(rows: { key: string; value: string }[] = []) {
  return {
    getAllAsync: jest.fn(() => Promise.resolve(rows)),
    runAsync: jest.fn(() => Promise.resolve()),
  } as unknown as SQLiteDatabase & {
    getAllAsync: jest.Mock;
    runAsync: jest.Mock;
  };
}

describe('last played', () => {
  it('reads nothing from an empty settings table', async () => {
    expect(await loadLastPlayed(fakeDb())).toEqual({ track: null, station: null });
  });

  it('reads the track and position', async () => {
    const db = fakeDb([
      { key: 'lastTrackId', value: 't1' },
      { key: 'lastTrackPosition', value: '61' },
    ]);
    expect((await loadLastPlayed(db)).track).toEqual({ id: 't1', position: 61 });
  });

  it('treats a bad position as the start', async () => {
    const db = fakeDb([
      { key: 'lastTrackId', value: 't1' },
      { key: 'lastTrackPosition', value: 'nope' },
    ]);
    expect((await loadLastPlayed(db)).track).toEqual({ id: 't1', position: 0 });
  });

  it('ignores a damaged station value', async () => {
    const db = fakeDb([{ key: 'lastStation', value: '{oops' }]);
    expect((await loadLastPlayed(db)).station).toBeNull();
  });

  it('round trips a station through JSON', async () => {
    const station = { id: 's', name: 'N', urlResolved: 'http://x' } as never;
    const db = fakeDb();
    await saveLastStation(db, station);
    const [, params] = db.runAsync.mock.calls[0] as [string, string[]];
    const reread = fakeDb([{ key: 'lastStation', value: params[1] }]);
    expect((await loadLastPlayed(reread)).station).toEqual(station);
  });

  it('saves the position as whole seconds', async () => {
    const db = fakeDb();
    await saveLastTrack(db, { id: 't1', position: 12.9 });
    expect(db.runAsync).toHaveBeenCalledWith(expect.any(String), ['lastTrackPosition', '12']);
  });
});
