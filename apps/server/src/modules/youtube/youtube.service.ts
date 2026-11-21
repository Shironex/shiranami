import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';
import { chmod, copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { RedisService } from '../redis/redis.service';
import type { SearchResult } from './dto/youtube.dto';
import {
  audioMimeType,
  chunkRanges,
  contentLengthFromUrl,
  expiryFromUrl,
  parseRange,
  type ByteRange,
} from './youtube-audio';

const SEARCH_CACHE_TTL = 300; // 5 minutes
const SUGGEST_CACHE_TTL = 600; // 10 minutes
/** Upper bound for a cached audio source; googlevideo URLs live about six hours. */
const AUDIO_CACHE_TTL = 3600;
/** A cached source is dropped this long before its URL expires. */
const AUDIO_EXPIRY_MARGIN = 300;
/** A yt-dlp run that takes longer than this is killed. */
const YTDLP_TIMEOUT_MS = 45_000;
/** How long one upstream request may take to answer with its headers. */
const UPSTREAM_TIMEOUT_MS = 20_000;
/**
 * How long one read of an upstream body may wait for bytes. Only the wait on
 * googlevideo counts: time the client spends not reading (a paused player,
 * slow Wi-Fi) is backpressure, not a stall, and never trips it.
 */
const UPSTREAM_IDLE_TIMEOUT_MS = 30_000;
/** The longest pre-roll wait honoured before the first upstream request. */
const MAX_AVAILABILITY_WAIT_MS = 30_000;

/**
 * Audio-only, AAC in MP4 first: Android's player handles it everywhere and a
 * saved file gets a plain `.m4a` name. Opus in WebM is the fallback.
 */
const AUDIO_FORMAT = 'bestaudio[ext=m4a]/bestaudio[acodec^=mp4a]/bestaudio';

/** One audio format of a video, resolved by yt-dlp on this server. */
export interface AudioSource {
  url: string;
  ext: string;
  size: number;
  mimeType: string;
  /**
   * Unix seconds before which googlevideo refuses the URL. Some YouTube
   * clients only serve a format after the length of the ad they would have
   * shown; yt-dlp reports it, and requests before then get 403.
   */
  availableAt: number | null;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** One body read that fails when googlevideo sends nothing for the idle timeout. */
async function readWithIdleTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<Awaited<ReturnType<ReadableStreamDefaultReader<Uint8Array>['read']>>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const idle = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('YouTube stopped sending audio')),
      UPSTREAM_IDLE_TIMEOUT_MS
    );
  });
  try {
    return await Promise.race([reader.read(), idle]);
  } finally {
    clearTimeout(timer);
  }
}

/** The video exists but cannot be played here (removed, private, live, age gated). */
export class VideoUnavailableError extends Error {}

/** googlevideo answered with an error status. */
export class UpstreamError extends Error {
  constructor(readonly status: number) {
    super(`YouTube answered ${status}`);
  }
}

export type AudioStream =
  | {
      status: 200 | 206;
      range: ByteRange;
      total: number;
      mimeType: string;
      body: Readable;
    }
  | { status: 416; total: number };

/** yt-dlp's stderr lines that mean the video itself is the problem, not the server. */
const UNAVAILABLE_PATTERNS = [
  /unavailable/i,
  /private video/i,
  /has been removed/i,
  /confirm your age/i,
  /members-only/i,
  /not available/i,
  /premieres in/i,
  /live event/i,
];

function toSearchResult(line: string, requireDuration: boolean): SearchResult | null {
  try {
    const data = JSON.parse(line);
    // Channels, playlists, live streams and upcoming premieres show up in
    // search too; only finished videos with a length can be played and saved.
    if (data._type && data._type !== 'url' && data._type !== 'video') return null;
    if (typeof data.id !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(data.id)) return null;
    if (data.live_status === 'is_live' || data.live_status === 'is_upcoming') return null;
    const duration = typeof data.duration === 'number' && data.duration > 0 ? data.duration : 0;
    if (requireDuration && !duration) return null;
    return {
      id: data.id,
      title: data.title ?? 'Unknown',
      uploader: data.uploader ?? data.channel ?? 'Unknown',
      duration,
      thumbnail: data.thumbnail ?? data.thumbnails?.[0]?.url ?? '',
      url: data.webpage_url ?? `https://www.youtube.com/watch?v=${data.id}`,
      viewCount: typeof data.view_count === 'number' ? data.view_count : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Search drops anything without a length (channels, live, upcoming). A
 * playlist keeps such entries: some playlist pages leave the length out.
 */
function parseResults(stdout: string, requireDuration: boolean): SearchResult[] {
  return stdout
    .split('\n')
    .filter(Boolean)
    .map(line => toSearchResult(line, requireDuration))
    .filter((r): r is SearchResult => r !== null);
}

/**
 * Points yt-dlp at a bgutil PO token provider: loads the plugin from
 * `pluginDir` (when the plugin is not in a default location) and hands it the
 * provider's URL. No URL, no arguments.
 *
 * The mweb client goes first because a PO token is what it needs to get past
 * the bot check on a flagged IP, where the default clients only answer
 * LOGIN_REQUIRED; the defaults stay behind it as a fallback.
 */
function potProviderArgs(providerUrl?: string, pluginDir?: string): string[] {
  if (!providerUrl) return [];
  return [
    ...(pluginDir ? ['--plugin-dirs', pluginDir] : []),
    '--extractor-args',
    `youtubepot-bgutilhttp:base_url=${providerUrl}`,
    '--extractor-args',
    'youtube:player_client=mweb,default',
  ];
}

/** Private scratch directory for the per-run cookies copies. */
const COOKIES_DIR = join(tmpdir(), 'yt-dlp');

@Injectable()
export class YoutubeService {
  private readonly ytdlpPath: string;
  /** Arguments every yt-dlp run gets first, the PO token provider when one is set. */
  private readonly baseArgs: string[];
  /** Source cookies.txt (read-only mount in production), when one is configured. */
  private readonly cookiesFile?: string;
  private cookiesWarned = false;

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    @InjectPinoLogger(YoutubeService.name) private readonly logger: PinoLogger
  ) {
    this.ytdlpPath = this.config.get<string>('YTDLP_PATH', 'yt-dlp');
    this.baseArgs = potProviderArgs(
      this.config.get<string>('YTDLP_POT_PROVIDER_URL'),
      this.config.get<string>('YTDLP_PLUGIN_DIR')
    );
    this.cookiesFile = this.config.get<string>('YTDLP_COOKIES_FILE') || undefined;
  }

  /**
   * A private copy of the cookies file for one yt-dlp run. yt-dlp dumps its
   * cookie jar back into the `--cookies` file when it finishes, and the source
   * is a read-only mount; concurrent runs would also rewrite one shared copy
   * in place. So each run gets its own copy (mode 0600) and removes it after.
   * An unreadable source logs one warning and the run goes without cookies.
   */
  private async prepareCookies(): Promise<{ args: string[]; cleanup: () => Promise<void> }> {
    const none = { args: [], cleanup: async () => undefined };
    if (!this.cookiesFile) return none;
    let dir: string | undefined;
    try {
      await mkdir(COOKIES_DIR, { recursive: true, mode: 0o700 });
      dir = await mkdtemp(join(COOKIES_DIR, 'run-'));
      const copy = join(dir, 'cookies.txt');
      await copyFile(this.cookiesFile, copy);
      await chmod(copy, 0o600);
      const runDir = dir;
      return {
        args: ['--cookies', copy],
        cleanup: () => rm(runDir, { recursive: true, force: true }).catch(() => undefined),
      };
    } catch (error) {
      if (dir) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
      if (!this.cookiesWarned) {
        this.cookiesWarned = true;
        const code = (error as NodeJS.ErrnoException).code ?? 'unknown';
        this.logger.warn(
          `YTDLP_COOKIES_FILE could not be copied (${code}); running yt-dlp without cookies`
        );
      }
      return none;
    }
  }

  async search(query: string): Promise<SearchResult[]> {
    const cacheKey = `yt:search:${query}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const { stdout, stderr, code } = await this.spawnYtDlp([
      '--flat-playlist',
      '--dump-json',
      '--no-warnings',
      `ytsearch15:${query}`,
    ]);

    if (code !== 0) {
      this.logger.warn({ stderr: stderr.slice(-500) }, 'yt-dlp search failed');
      throw new Error('yt-dlp search failed');
    }

    const results = parseResults(stdout, true).slice(0, 10);
    this.logger.info(`Search "${query}" returned ${results.length} results`);
    await this.redis.set(cacheKey, JSON.stringify(results), 'EX', SEARCH_CACHE_TTL);
    return results;
  }

  async suggest(query: string): Promise<string[]> {
    const cacheKey = `yt:suggest:${query}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const url = `https://clients1.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
    if (!res.ok) {
      throw new Error(`Suggest answered ${res.status}`);
    }
    const data = (await res.json()) as [string, string[]];
    const suggestions = Array.isArray(data[1]) ? data[1] : [];

    await this.redis.set(cacheKey, JSON.stringify(suggestions), 'EX', SUGGEST_CACHE_TTL);
    return suggestions;
  }

  /**
   * The audio format the server streams for a video, from Redis while its
   * URL is still good. `fresh` skips the cache, after googlevideo refused it.
   */
  async resolveAudio(videoId: string, fresh = false): Promise<AudioSource> {
    const cacheKey = `yt:audio:${videoId}`;
    if (!fresh) {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as AudioSource;
    }

    const { stdout, stderr, code } = await this.spawnYtDlp([
      '-f',
      AUDIO_FORMAT,
      '--no-playlist',
      '--no-warnings',
      // Solving YouTube's JS challenges needs a JS runtime; use the very Node
      // this server runs on, so the image needs nothing besides yt-dlp.
      '--no-js-runtimes',
      '--js-runtimes',
      `node:${process.execPath}`,
      '--print',
      'is_live',
      '--print',
      'protocol',
      '--print',
      'ext',
      '--print',
      'filesize',
      '--print',
      'available_at',
      '--print',
      'url',
      `https://www.youtube.com/watch?v=${videoId}`,
    ]);

    if (code !== 0) {
      const tail = stderr.slice(-500);
      this.logger.warn({ videoId, stderr: tail }, 'yt-dlp audio extraction failed');
      if (/not a bot/i.test(tail)) {
        throw new Error('YouTube is asking this server to sign in');
      }
      if (UNAVAILABLE_PATTERNS.some(pattern => pattern.test(tail))) {
        throw new VideoUnavailableError('This video cannot be played');
      }
      throw new Error('Failed to extract audio');
    }

    const [isLive, protocol, ext, filesize, availableAt, url] = stdout.trim().split('\n');
    if (isLive === 'True') {
      throw new VideoUnavailableError('Live streams cannot be played');
    }
    // A manifest (HLS or DASH) cannot be proxied as one file.
    if (!url || !protocol?.startsWith('http') || protocol.includes('m3u8')) {
      throw new VideoUnavailableError('No audio file for this video');
    }

    const source: AudioSource = {
      url,
      ext,
      size: Number(filesize) > 0 ? Number(filesize) : (contentLengthFromUrl(url) ?? 0),
      mimeType: audioMimeType(ext),
      availableAt: Number(availableAt) > 0 ? Number(availableAt) : null,
    };
    if (!source.size) source.size = await this.probeSize(source);

    const expiresAt = expiryFromUrl(url);
    const ttl = expiresAt
      ? Math.min(AUDIO_CACHE_TTL, expiresAt - Math.floor(Date.now() / 1000) - AUDIO_EXPIRY_MARGIN)
      : AUDIO_CACHE_TTL;
    if (ttl > 0) {
      await this.redis.set(cacheKey, JSON.stringify(source), 'EX', ttl);
    }
    this.logger.info(`Resolved ${ext} audio for ${videoId} (${source.size} bytes)`);
    return source;
  }

  /**
   * Opens the audio of a video for one request, honouring its `Range` header.
   * The first upstream piece is fetched before anything is sent, so a stale
   * URL is resolved again once and an error still becomes a proper status.
   * The rest streams piece by piece as the client reads; nothing is buffered
   * beyond what the socket asks for, and `signal` stops it when the client
   * goes away.
   */
  async openAudio(
    videoId: string,
    rangeHeader: string | undefined,
    signal: AbortSignal
  ): Promise<AudioStream> {
    for (let attempt = 0; ; attempt++) {
      const source = await this.resolveAudio(videoId, attempt > 0);
      const requested = parseRange(rangeHeader, source.size);
      if (requested === 'unsatisfiable') return { status: 416, total: source.size };
      const range = requested ?? { start: 0, end: source.size - 1 };
      const [first, ...rest] = chunkRanges(range);

      await this.waitUntilAvailable(source, signal);
      const response = await this.fetchPiece(source.url, first, signal);
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        // An expired or IP-mismatched URL: drop it and resolve once more.
        if (attempt === 0 && (response.status === 403 || response.status === 410)) {
          this.logger.info(`Audio URL for ${videoId} was refused, resolving again`);
          continue;
        }
        throw new UpstreamError(response.status);
      }

      return {
        status: requested ? 206 : 200,
        range,
        total: source.size,
        mimeType: source.mimeType,
        body: Readable.from(this.pieces(source.url, response, rest, signal)),
      };
    }
  }

  private async waitUntilAvailable(source: AudioSource, signal: AbortSignal): Promise<void> {
    if (!source.availableAt) return;
    const wait = source.availableAt * 1000 - Date.now();
    if (wait <= 0) return;
    await sleep(Math.min(wait, MAX_AVAILABILITY_WAIT_MS));
    signal.throwIfAborted();
  }

  private async *pieces(
    url: string,
    first: Response,
    rest: ByteRange[],
    signal: AbortSignal
  ): AsyncGenerator<Uint8Array> {
    yield* this.bodyOf(first);
    for (const piece of rest) {
      if (signal.aborted) return;
      const response = await this.fetchPiece(url, piece, signal);
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new UpstreamError(response.status);
      }
      yield* this.bodyOf(response);
    }
  }

  private async *bodyOf(response: Response): AsyncGenerator<Uint8Array> {
    if (!response.body) return;
    const reader = response.body.getReader();
    try {
      for (;;) {
        const { done, value } = await readWithIdleTimeout(reader);
        if (done) return;
        if (value?.length) yield value;
      }
    } finally {
      // Runs when the client stops reading too, so the upstream socket closes.
      await reader.cancel().catch(() => undefined);
    }
  }

  /**
   * Requests one piece. The timeout covers the wait for the headers only: a
   * signal handed to fetch also aborts the body, and a piece read at playback
   * speed takes minutes. The body is guarded by the idle timeout instead, and
   * `signal` (the client hanging up) still aborts both.
   */
  private async fetchPiece(url: string, piece: ByteRange, signal: AbortSignal): Promise<Response> {
    const headersTimeout = new AbortController();
    const timer = setTimeout(
      () => headersTimeout.abort(new Error('YouTube did not answer in time')),
      UPSTREAM_TIMEOUT_MS
    );
    try {
      return await fetch(url, {
        headers: { Range: `bytes=${piece.start}-${piece.end}` },
        signal: AbortSignal.any([signal, headersTimeout.signal]),
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /** The total size from a one byte request, for a format yt-dlp gave no size for. */
  private async probeSize(source: AudioSource): Promise<number> {
    const signal = new AbortController().signal;
    await this.waitUntilAvailable(source, signal);
    const response = await this.fetchPiece(source.url, { start: 0, end: 0 }, signal);
    await response.body?.cancel().catch(() => undefined);
    const total = Number(/\/(\d+)$/.exec(response.headers.get('content-range') ?? '')?.[1]);
    if (!response.ok || !(total > 0)) {
      throw new Error('Could not read the audio size');
    }
    return total;
  }

  async extractPlaylist(url: string): Promise<SearchResult[]> {
    const { stdout, stderr, code } = await this.spawnYtDlp([
      '--flat-playlist',
      '--dump-json',
      '--no-warnings',
      url,
    ]);

    if (code !== 0) {
      this.logger.warn({ stderr: stderr.slice(-500) }, 'yt-dlp playlist extraction failed');
      throw new Error('Failed to extract playlist');
    }

    const results = parseResults(stdout, false);
    this.logger.info(`Playlist extraction returned ${results.length} tracks`);
    return results;
  }

  private async spawnYtDlp(
    args: string[]
  ): Promise<{ stdout: string; stderr: string; code: number }> {
    const cookies = await this.prepareCookies();
    try {
      return await this.runYtDlp([...this.baseArgs, ...cookies.args, ...args]);
    } finally {
      await cookies.cleanup();
    }
  }

  private runYtDlp(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.ytdlpPath, args, { env: { ...process.env } });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => proc.kill('SIGKILL'), YTDLP_TIMEOUT_MS);

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
      proc.on('error', error => {
        clearTimeout(timer);
        reject(error);
      });
      proc.on('close', code => {
        clearTimeout(timer);
        resolve({ stdout, stderr, code: code ?? 1 });
      });
    });
  }
}
