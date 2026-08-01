/**
 * The Phase 15 obligations, each against the behaviour v1's renderer sees.
 *
 * `db:backup` and `share:import` are the two channels where the shim does more
 * than forward, so they are the two that can regress silently. The `wire`
 * helpers are here too: `asContract` is an assertion the type system cannot
 * check, so its premise — that the payload really does satisfy the contract —
 * is pinned against representative payloads instead.
 *
 * No `expect(...).rejects`: the matcher is broken in this project.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const dialogSaveFile = vi.fn();
const dialogOpenFile = vi.fn();
const dbBackupExport = vi.fn();
const dbBackupImport = vi.fn();
const shareImport = vi.fn();

vi.mock('@shiranami/contracts/bindings', () => ({
  commands: {
    dialogSaveFile: (...args: unknown[]) => dialogSaveFile(...args) as unknown,
    dialogOpenFile: (...args: unknown[]) => dialogOpenFile(...args) as unknown,
    dbBackupExport: (...args: unknown[]) => dbBackupExport(...args) as unknown,
    dbBackupImport: (...args: unknown[]) => dbBackupImport(...args) as unknown,
    shareImport: (...args: unknown[]) => shareImport(...args) as unknown,
  },
  events: {},
}));

const { dbBackupApi } = await import('./namespaces/db-backup');
const { orUndefined } = await import('./wire');

/** Catch and return a rejection, failing loudly when there was not one. */
async function rejectionOf(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to reject, but it resolved');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('db:backup:export — the save panel moved to the shim', () => {
  it('offers v1’s suggested name, title and SQLite filter', async () => {
    dialogSaveFile.mockResolvedValue('/backups/library.db');
    dbBackupExport.mockResolvedValue({ success: true, path: '/backups/library.db' });

    await dbBackupApi.export();

    const [options] = dialogSaveFile.mock.calls[0] as [Record<string, unknown>];
    expect(options.title).toBe('Export Library Database');
    expect(options.fileName).toMatch(/^shiranami-library-\d{4}-\d{2}-\d{2}\.db$/);
    expect(options.filters).toEqual([{ name: 'SQLite Database', extensions: ['db'] }]);
  });

  it('passes the chosen path to the command that used to open the panel itself', async () => {
    dialogSaveFile.mockResolvedValue('/backups/library.db');
    dbBackupExport.mockResolvedValue({ success: true, path: '/backups/library.db' });

    const result = await dbBackupApi.export();

    expect(dbBackupExport).toHaveBeenCalledWith('/backups/library.db');
    expect(result).toEqual({ success: true, path: '/backups/library.db' });
  });

  it('reports a cancel with no error, so the renderer shows no toast', async () => {
    // The distinction the settings UI reads: `success: false` with an `error`
    // is a failure toast, without one it is "the user changed their mind".
    dialogSaveFile.mockResolvedValue(null);

    const result = await dbBackupApi.export();

    expect(result).toEqual({ success: false });
    expect('error' in result).toBe(false);
    expect(dbBackupExport).not.toHaveBeenCalled();
  });

  it('turns a rejection into the { success: false, error } v1 returned', async () => {
    // v1 wrapped the operation in try/catch and never rejected for an
    // operational failure; the renderer's own catch shows a message-less toast,
    // so propagating would lose the reason.
    dialogSaveFile.mockResolvedValue('/backups/library.db');
    dbBackupExport.mockRejectedValue(
      Object.assign(new Error('database is locked'), { code: 'INTERNAL' })
    );

    expect(await dbBackupApi.export()).toEqual({ success: false, error: 'database is locked' });
  });
});

describe('db:backup:import — routed through the existing open panel', () => {
  it('asks for SQLite files, adding no new Rust surface', async () => {
    dialogOpenFile.mockResolvedValue('/backups/library.db');
    dbBackupImport.mockResolvedValue({ success: true });

    await dbBackupApi.import();

    expect(dialogOpenFile).toHaveBeenCalledWith({
      filters: [
        { name: 'SQLite Database', extensions: ['db', 'sqlite'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    expect(dbBackupImport).toHaveBeenCalledWith('/backups/library.db');
  });

  it('reports a cancel with no error', async () => {
    dialogOpenFile.mockResolvedValue(null);

    expect(await dbBackupApi.import()).toEqual({ success: false });
    expect(dbBackupImport).not.toHaveBeenCalled();
  });

  it('turns a rejection into the { success: false, error } v1 returned', async () => {
    dialogOpenFile.mockResolvedValue('/backups/library.db');
    dbBackupImport.mockRejectedValue(new Error('not a database'));

    expect(await dbBackupApi.import()).toEqual({ success: false, error: 'not a database' });
  });
});

describe('share:import — typed from the zod schema', () => {
  const validTrackShare = {
    type: 'TRACK',
    payload: { title: 'Song', artist: 'Artist', ytId: 'abc123' },
    code: 'XYZ',
    expiresAt: '2026-08-02T12:00:00+00:00',
  };

  it('returns the discriminated union the renderer reads field by field', async () => {
    shareImport.mockResolvedValue(validTrackShare);
    const { shareApi } = await import('./namespaces/share');

    const imported = await shareApi.import('XYZ');

    expect(imported.type).toBe('TRACK');
    expect(imported).toEqual(validTrackShare);
  });

  it('raises v1’s INVALID_RESPONSE when the payload does not parse', async () => {
    // The import UI matches on the code and renders its own translation, so the
    // code has to be exactly v1's — not a generic failure.
    shareImport.mockResolvedValue({ type: 'TRACK', payload: { title: '' } });
    const { shareApi } = await import('./namespaces/share');

    const error = await rejectionOf(() => shareApi.import('XYZ'));

    expect((error as Error & { code: string }).code).toBe('share.invalid_response');
    expect((error as Error).message).toBe('Received invalid share data from the server');
    expect((error as Error).name).toBe('IpcError');
  });
});

describe('orUndefined — the eleven handlers whose own return value changed', () => {
  it('restores the undefined v1 resolved for an absent row', async () => {
    // `db:tracks:add` resolved `undefined` when the file was already imported;
    // `db_tracks_add` resolves `null`. That is a different value reaching the
    // renderer, so it is converted rather than asserted away.
    expect(await orUndefined(Promise.resolve(null))).toBeUndefined();
  });

  it('leaves a present row alone', async () => {
    const row = { id: 'a', title: 'Song' };

    expect(await orUndefined(Promise.resolve(row))).toBe(row);
  });
});
