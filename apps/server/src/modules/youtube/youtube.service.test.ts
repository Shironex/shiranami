import { EventEmitter } from 'node:events';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import type { RedisService } from '../redis/redis.service';

import { UpstreamError, VideoUnavailableError, YoutubeService } from './youtube.service';

const spawnMock = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ spawn: spawnMock }));

const VIDEO = 'abcdefghijk';
const URL_ = 'https://rr1.googlevideo.com/videoplayback?itag=140';

/** A child process that prints `stdout` (and `stderr`) and exits with `code`. */
function fakeProcess(stdout: string, code = 0, stderr = '') {
  const proc = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    kill: vi.fn(),
  });
  setImmediate(() => {
    if (stdout) proc.stdout.emit('data', Buffer.from(stdout));
    if (stderr) proc.stderr.emit('data', Buffer.from(stderr));
    proc.emit('close', code);
  });
  return proc;
}

function audioLines({
  isLive = 'False',
  protocol = 'https',
  ext = 'm4a',
  filesize = '25',
  availableAt = 'NA',
  url = URL_,
} = {}) {
  return [isLive, protocol, ext, filesize, availableAt, url].join('\n') + '\n';
}

function createService() {
  const store = new Map<string, string>();
  const redis = {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
      return 'OK';
    }),
  } as unknown as RedisService;
  const config = { get: (_key: string, fallback: string) => fallback } as unknown as ConfigService;
  const logger = { info: vi.fn(), warn: vi.fn() } as unknown as PinoLogger;
  return { service: new YoutubeService(redis, config, logger), store, redis };
}

/** A body of `total` bytes where byte i is i % 256, served by Range like googlevideo. */
function upstream(total: number, refuseFirst = 0) {
  let refusals = refuseFirst;
  return vi.fn(async (_url: string, init: RequestInit) => {
    if (refusals > 0) {
      refusals--;
      return new Response(null, { status: 403 });
    }
    const header = (init.headers as Record<string, string>).Range;
    const [, from, to] = /bytes=(\d+)-(\d+)/.exec(header)!;
    const bytes = new Uint8Array(Number(to) - Number(from) + 1).map(
      (_, i) => (Number(from) + i) % 256
    );
    return new Response(bytes, {
      status: 206,
      headers: { 'Content-Range': `bytes ${from}-${to}/${total}` },
    });
  });
}

async function readAll(body: NodeJS.ReadableStream): Promise<number[]> {
  const out: number[] = [];
  for await (const chunk of body) out.push(...(chunk as Uint8Array));
  return out;
}

const signal = () => new AbortController().signal;

beforeEach(() => {
  spawnMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('YoutubeService.search', () => {
  it('keeps playable videos and drops channels, live streams and entries without a length', async () => {
    const lines = [
      { _type: 'url', id: 'aaaaaaaaaaa', title: 'Song', channel: 'Band', duration: 200 },
      { _type: 'url', id: 'UCxxxxxxxxxxxxxxxxxxxxxx', title: 'A channel' },
      { _type: 'url', id: 'bbbbbbbbbbb', title: 'Live', duration: 0, live_status: 'is_live' },
      { _type: 'url', id: 'ccccccccccc', title: 'Upcoming', live_status: 'is_upcoming' },
      { _type: 'playlist', id: 'ddddddddddd', title: 'A mix', duration: 900 },
    ].map(line => JSON.stringify(line));
    spawnMock.mockReturnValue(fakeProcess(lines.join('\n') + '\nnot json\n'));
    const { service } = createService();

    const results = await service.search('song');

    expect(results).toEqual([
      expect.objectContaining({ id: 'aaaaaaaaaaa', uploader: 'Band', duration: 200 }),
    ]);
  });

  it('throws when yt-dlp fails', async () => {
    spawnMock.mockReturnValue(fakeProcess('', 1, 'ERROR: boom'));
    const { service } = createService();

    await expect(service.search('song')).rejects.toThrow('yt-dlp search failed');
  });
});

describe('YoutubeService.resolveAudio', () => {
  it('reads the format yt-dlp picked and caches it', async () => {
    spawnMock.mockReturnValue(fakeProcess(audioLines({ availableAt: '1794219248' })));
    const { service, store } = createService();

    const source = await service.resolveAudio(VIDEO);

    expect(source).toEqual({
      url: URL_,
      ext: 'm4a',
      size: 25,
      mimeType: 'audio/mp4',
      availableAt: 1794219248,
    });
    expect(JSON.parse(store.get(`yt:audio:${VIDEO}`)!)).toEqual(source);
    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args).toContain(`node:${process.execPath}`);
    expect(args.at(-1)).toBe(`https://www.youtube.com/watch?v=${VIDEO}`);

    await service.resolveAudio(VIDEO);
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the clen in the URL when yt-dlp has no size', async () => {
    spawnMock.mockReturnValue(
      fakeProcess(audioLines({ filesize: 'NA', url: `${URL_}&clen=4096` }))
    );
    const { service } = createService();

    expect((await service.resolveAudio(VIDEO)).size).toBe(4096);
  });

  it('turns an unavailable video into VideoUnavailableError', async () => {
    spawnMock.mockReturnValue(
      fakeProcess('', 1, `ERROR: [youtube] ${VIDEO}: This video is unavailable\n`)
    );
    const { service } = createService();

    await expect(service.resolveAudio(VIDEO)).rejects.toBeInstanceOf(VideoUnavailableError);
  });

  it('refuses live streams and manifests', async () => {
    const { service } = createService();
    spawnMock.mockReturnValueOnce(fakeProcess(audioLines({ isLive: 'True' })));
    await expect(service.resolveAudio(VIDEO, true)).rejects.toBeInstanceOf(VideoUnavailableError);

    spawnMock.mockReturnValueOnce(fakeProcess(audioLines({ protocol: 'm3u8_native' })));
    await expect(service.resolveAudio(VIDEO, true)).rejects.toBeInstanceOf(VideoUnavailableError);
  });

  it('reports a bot check as a server problem, not a missing video', async () => {
    spawnMock.mockReturnValue(fakeProcess('', 1, "ERROR: Sign in to confirm you're not a bot\n"));
    const { service } = createService();

    const error = (await service.resolveAudio(VIDEO).catch((e: unknown) => e)) as Error;
    expect(error).not.toBeInstanceOf(VideoUnavailableError);
    expect(error.message).toMatch(/sign in/);
  });
});

describe('YoutubeService.openAudio', () => {
  function withSource(service: YoutubeService, size: number) {
    return vi.spyOn(service, 'resolveAudio').mockResolvedValue({
      url: URL_,
      ext: 'm4a',
      size,
      mimeType: 'audio/mp4',
      availableAt: null,
    });
  }

  it('streams the whole file with 200 when no range is asked for', async () => {
    const { service } = createService();
    withSource(service, 20);
    const fetchMock = upstream(20);
    vi.stubGlobal('fetch', fetchMock);

    const audio = await service.openAudio(VIDEO, undefined, signal());

    expect(audio).toMatchObject({ status: 200, range: { start: 0, end: 19 }, total: 20 });
    if (audio.status === 416) throw new Error('unexpected 416');
    expect(await readAll(audio.body)).toEqual([...Array(20).keys()]);
  });

  it('answers a range with 206 and only those bytes', async () => {
    const { service } = createService();
    withSource(service, 1000);
    const fetchMock = upstream(1000);
    vi.stubGlobal('fetch', fetchMock);

    const audio = await service.openAudio(VIDEO, 'bytes=300-303', signal());

    expect(audio).toMatchObject({ status: 206, range: { start: 300, end: 303 }, total: 1000 });
    if (audio.status === 416) throw new Error('unexpected 416');
    expect(await readAll(audio.body)).toEqual([300 % 256, 301 % 256, 302 % 256, 303 % 256]);
    expect((fetchMock.mock.calls[0][1].headers as Record<string, string>).Range).toBe(
      'bytes=300-303'
    );
  });

  it('fetches a big range upstream in pieces, one after another', async () => {
    const { service } = createService();
    withSource(service, 20 * 1024 * 1024);
    const fetchMock = upstream(20 * 1024 * 1024);
    vi.stubGlobal('fetch', fetchMock);

    const audio = await service.openAudio(VIDEO, undefined, signal());
    if (audio.status === 416) throw new Error('unexpected 416');
    // Only the first piece is fetched before anything is sent.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    let length = 0;
    for await (const chunk of audio.body) length += (chunk as Uint8Array).length;

    expect(length).toBe(20 * 1024 * 1024);
    expect(
      fetchMock.mock.calls.map(call => (call[1].headers as Record<string, string>).Range)
    ).toEqual(['bytes=0-8388607', 'bytes=8388608-16777215', 'bytes=16777216-20971519']);
  });

  it('answers 416 for a range past the end without calling upstream', async () => {
    const { service } = createService();
    withSource(service, 100);
    const fetchMock = upstream(100);
    vi.stubGlobal('fetch', fetchMock);

    expect(await service.openAudio(VIDEO, 'bytes=100-', signal())).toEqual({
      status: 416,
      total: 100,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resolves the URL again once when googlevideo refuses the cached one', async () => {
    const { service } = createService();
    const resolve = withSource(service, 10);
    vi.stubGlobal('fetch', upstream(10, 1));

    const audio = await service.openAudio(VIDEO, undefined, signal());

    expect(audio.status).toBe(200);
    expect(resolve.mock.calls).toEqual([
      [VIDEO, false],
      [VIDEO, true],
    ]);
  });

  it('gives up with UpstreamError when the fresh URL is refused too', async () => {
    const { service } = createService();
    withSource(service, 10);
    vi.stubGlobal('fetch', upstream(10, 2));

    await expect(service.openAudio(VIDEO, undefined, signal())).rejects.toBeInstanceOf(
      UpstreamError
    );
  });

  it('stops fetching pieces once the client goes away', async () => {
    const { service } = createService();
    withSource(service, 20 * 1024 * 1024);
    const fetchMock = upstream(20 * 1024 * 1024);
    vi.stubGlobal('fetch', fetchMock);
    const abort = new AbortController();

    const audio = await service.openAudio(VIDEO, undefined, abort.signal);
    if (audio.status === 416) throw new Error('unexpected 416');
    for await (const _chunk of audio.body) {
      abort.abort();
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  describe('timeouts', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      // Node's AbortSignal.timeout runs on its own clock; route it through the
      // fake one so a timeout spanning the body would show up here too.
      vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(new Error('timed out')), ms);
        return controller.signal;
      });
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    /**
     * A 206 whose body sends one byte per `gapMs`, `count` times. Like
     * undici, aborting the request signal also errors the body.
     */
    function slowPiece(count: number, gapMs: number, captured: AbortSignal[]) {
      return vi.fn(async (_url: string, init: RequestInit) => {
        const requestSignal = init.signal as AbortSignal;
        captured.push(requestSignal);
        let sent = 0;
        const body = new ReadableStream<Uint8Array>({
          start: controller => {
            requestSignal.addEventListener('abort', () => controller.error(requestSignal.reason));
          },
          pull: controller =>
            new Promise<void>(resolve => {
              setTimeout(() => {
                try {
                  if (sent === count) controller.close();
                  else controller.enqueue(new Uint8Array([sent++]));
                } catch {
                  // Cancelled meanwhile.
                }
                resolve();
              }, gapMs);
            }),
        });
        return new Response(body, {
          status: 206,
          headers: { 'Content-Range': `bytes 0-${count - 1}/${count}` },
        });
      });
    }

    it('lets a body that takes longer than the headers timeout finish', async () => {
      const { service } = createService();
      withSource(service, 4);
      const signals: AbortSignal[] = [];
      vi.stubGlobal('fetch', slowPiece(4, 15_000, signals));

      const audio = await service.openAudio(VIDEO, undefined, signal());
      if (audio.status === 416) throw new Error('unexpected 416');
      const read = readAll(audio.body);
      await vi.advanceTimersByTimeAsync(5 * 15_000);

      expect(await read).toEqual([0, 1, 2, 3]);
      expect(signals[0].aborted).toBe(false);
    });

    it('does not count time the client spends not reading', async () => {
      const { service } = createService();
      withSource(service, 2);
      vi.stubGlobal('fetch', slowPiece(2, 10, []));

      const audio = await service.openAudio(VIDEO, undefined, signal());
      if (audio.status === 416) throw new Error('unexpected 416');
      const iterator = audio.body[Symbol.asyncIterator]();
      const first = iterator.next();
      await vi.advanceTimersByTimeAsync(10);
      expect(Array.from((await first).value as Uint8Array)).toEqual([0]);

      // A paused player: nothing is read for two minutes.
      await vi.advanceTimersByTimeAsync(120_000);
      const second = iterator.next();
      await vi.advanceTimersByTimeAsync(10);
      expect(Array.from((await second).value as Uint8Array)).toEqual([1]);
    });

    it('fails a body that sends nothing for the idle timeout', async () => {
      const { service } = createService();
      withSource(service, 4);
      vi.stubGlobal('fetch', slowPiece(4, 31_000, []));

      const audio = await service.openAudio(VIDEO, undefined, signal());
      if (audio.status === 416) throw new Error('unexpected 416');
      const read = readAll(audio.body).catch((e: Error) => e);
      await vi.advanceTimersByTimeAsync(31_000);

      expect(((await read) as Error).message).toBe('YouTube stopped sending audio');
    });

    it('gives up when the headers do not arrive in time', async () => {
      const { service } = createService();
      withSource(service, 4);
      vi.stubGlobal(
        'fetch',
        vi.fn(
          (_url: string, init: RequestInit) =>
            new Promise((_, reject) =>
              (init.signal as AbortSignal).addEventListener('abort', () =>
                reject((init.signal as AbortSignal).reason)
              )
            )
        )
      );

      const opened = service.openAudio(VIDEO, undefined, signal()).catch((e: Error) => e);
      await vi.advanceTimersByTimeAsync(20_000);

      expect(((await opened) as Error).message).toBe('YouTube did not answer in time');
    });
  });
});
