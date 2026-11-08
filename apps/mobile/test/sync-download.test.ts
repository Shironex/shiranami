import type { SyncResponse } from '@/lib/sync-client';
import { downloadAudio, rangeStart, resumeHeaders, type PartialFile } from '@/lib/sync-download';

const bytes = (...values: number[]) => Uint8Array.from(values);

/** A partial file in memory; `finish` names it `final`. */
function memoryFile(initial: number[] = []) {
  let data = [...initial];
  const file: PartialFile & { data: () => number[]; finished: boolean; closed: number } = {
    finished: false,
    closed: 0,
    data: () => data,
    size: () => data.length,
    append: chunk => {
      data = [...data, ...chunk];
    },
    reset: () => {
      data = [];
    },
    close: () => {
      file.closed++;
    },
    finish: async () => {
      file.finished = true;
      return 'file:///tracks/final.mp3';
    },
  };
  return file;
}

/** A response whose body yields `chunks`, then optionally fails like a dropped connection. */
function response(
  status: number,
  chunks: Uint8Array[] = [],
  headers: Record<string, string> = {},
  dropAfter?: number
): SyncResponse {
  let index = 0;
  const body = {
    getReader: () => ({
      read: async () => {
        if (dropAfter !== undefined && index === dropAfter) throw new TypeError('connection reset');
        if (index >= chunks.length) return { done: true, value: undefined };
        return { done: false, value: chunks[index++] };
      },
      cancel: async () => undefined,
    }),
    cancel: async () => undefined,
  };
  return {
    status,
    headers: { get: name => headers[name] ?? null },
    json: async () => ({}),
    text: async () => '',
    body: body as unknown as ReadableStream<Uint8Array>,
  };
}

describe('resume headers', () => {
  it('asks for the rest of the file only when it can tell the file has not changed', () => {
    expect(resumeHeaders(0, 'v1')).toEqual({});
    expect(resumeHeaders(100, null)).toEqual({});
    expect(resumeHeaders(100, '1000-5')).toEqual({ Range: 'bytes=100-', 'If-Range': '"1000-5"' });
  });

  it('reads where a 206 starts', () => {
    expect(rangeStart('bytes 100-199/200')).toBe(100);
    expect(rangeStart('bytes 0-0/*')).toBe(0);
    expect(rangeStart(null)).toBeNull();
    expect(rangeStart('items 1-2/3')).toBeNull();
  });
});

describe('downloadAudio', () => {
  it('downloads a whole file from scratch', async () => {
    const file = memoryFile();
    const send = jest.fn(async () => response(200, [bytes(1, 2), bytes(3, 4)]));
    const progress: number[] = [];
    const result = await downloadAudio({
      file,
      expectedSize: 4,
      fileVersion: 'v1',
      send,
      onBytes: written => progress.push(written),
    });
    expect(send).toHaveBeenCalledWith({});
    expect(result).toEqual({ uri: 'file:///tracks/final.mp3', size: 4 });
    expect(file.data()).toEqual([1, 2, 3, 4]);
    expect(progress).toEqual([2, 4]);
  });

  it('keeps what arrived when the connection drops, then resumes with Range and If-Range', async () => {
    const file = memoryFile();
    await expect(
      downloadAudio({
        file,
        expectedSize: 4,
        fileVersion: 'v1',
        send: async () => response(200, [bytes(1, 2), bytes(3, 4)], {}, 1),
      })
    ).rejects.toMatchObject({ code: 'unreachable' });
    expect(file.data()).toEqual([1, 2]);
    expect(file.closed).toBe(1);

    const send = jest.fn(async () =>
      response(206, [bytes(3, 4)], { 'Content-Range': 'bytes 2-3/4' })
    );
    await downloadAudio({ file, expectedSize: 4, fileVersion: 'v1', send });
    expect(send).toHaveBeenCalledWith({ Range: 'bytes=2-', 'If-Range': '"v1"' });
    expect(file.data()).toEqual([1, 2, 3, 4]);
    expect(file.finished).toBe(true);
  });

  it('starts over when the file changed on the desktop (200 to a range request)', async () => {
    const file = memoryFile([9, 9]);
    await downloadAudio({
      file,
      expectedSize: 3,
      fileVersion: 'v2',
      send: async () => response(200, [bytes(5, 6, 7)]),
    });
    expect(file.data()).toEqual([5, 6, 7]);
  });

  it('starts over after a 416 or a 206 for the wrong range', async () => {
    for (const first of [
      response(416),
      response(206, [bytes(0)], { 'Content-Range': 'bytes 0-0/3' }),
    ]) {
      const file = memoryFile([1, 2]);
      const send = jest
        .fn<Promise<SyncResponse>, [Record<string, string>]>()
        .mockResolvedValueOnce(first)
        .mockResolvedValueOnce(response(200, [bytes(7, 8, 9)]));
      await downloadAudio({ file, expectedSize: 3, fileVersion: 'v1', send });
      expect(send.mock.calls.map(call => call[0])).toEqual([
        { Range: 'bytes=2-', 'If-Range': '"v1"' },
        {},
      ]);
      expect(file.data()).toEqual([7, 8, 9]);
    }
  });

  it('drops a partial it cannot trust: no version, or longer than the file', async () => {
    for (const [initial, version] of [
      [[1, 2], null],
      [[1, 2, 3, 4, 5], 'v1'],
    ] as const) {
      const file = memoryFile([...initial]);
      const send = jest.fn(async () => response(200, [bytes(7, 8, 9)]));
      await downloadAudio({ file, expectedSize: 3, fileVersion: version, send });
      expect(send).toHaveBeenCalledWith({});
      expect(file.data()).toEqual([7, 8, 9]);
    }
  });

  it('finishes a partial that is already complete without a request', async () => {
    const file = memoryFile([1, 2, 3]);
    const send = jest.fn();
    expect(await downloadAudio({ file, expectedSize: 3, fileVersion: 'v1', send })).toEqual({
      uri: 'file:///tracks/final.mp3',
      size: 3,
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses a short body and keeps it for the next attempt', async () => {
    const file = memoryFile();
    await expect(
      downloadAudio({
        file,
        expectedSize: 5,
        fileVersion: 'v1',
        send: async () => response(200, [bytes(1, 2)]),
      })
    ).rejects.toMatchObject({ code: 'failed' });
    expect(file.data()).toEqual([1, 2]);
    expect(file.finished).toBe(false);
  });

  it('stops on cancel and maps refusals', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      downloadAudio({
        file: memoryFile(),
        expectedSize: 2,
        fileVersion: 'v1',
        send: async () => response(200, [bytes(1, 2)]),
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ code: 'cancelled' });
    await expect(
      downloadAudio({
        file: memoryFile(),
        expectedSize: 2,
        fileVersion: 'v1',
        send: async () => response(404),
      })
    ).rejects.toMatchObject({ code: 'unpaired' });
  });
});
