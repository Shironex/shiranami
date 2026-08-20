import { spawn } from 'child_process';
import type { SearchResult } from '@shiranami/contracts';
import { logger } from '../app/logger';
import { getYtDlpPath } from '../downloads/ytdlp-manager';
import { isHttpUrl } from '../shared/url-safety';

export type { SearchResult };

/**
 * Append a user/extraction-derived URL to a yt-dlp argument array safely.
 *
 * Guards against ARGUMENT INJECTION: yt-dlp treats any argument starting with
 * `-` as an option, so a value like `--exec=<cmd>` would run an arbitrary OS
 * command. We (1) reject anything that is not an http(s) URL and (2) append the
 * literal `--` end-of-options separator so yt-dlp always parses the value as a
 * positional URL. Throws when `url` is not an http(s) URL — callers at IPC
 * boundaries should validate with `isHttpUrl` first to return a typed error.
 */
export function appendUrlArg(args: string[], url: string): string[] {
  if (!isHttpUrl(url)) {
    throw new Error(`yt-dlp: refusing to pass a non-http(s) URL argument: ${url}`);
  }
  return [...args, '--', url];
}

/**
 * Spawn the bundled yt-dlp binary with the given args and buffer its full
 * stdout / stderr. Resolves with the captured streams and the process exit
 * code (defaulting to 1 if the child exited without one).
 *
 * When a `signal` is supplied, aborting it kills the child and rejects with an
 * `AbortError` — used by the metadata-enrichment pool to cancel in-flight
 * lookups.
 */
export function spawnYtDlp(
  args: string[],
  signal?: AbortSignal
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('The operation was aborted', 'AbortError'));
      return;
    }

    // `--ignore-config` stops yt-dlp from reading any ambient yt-dlp.conf on
    // the config search path, which could otherwise inject dangerous options
    // (e.g. `--exec`) outside this app's control.
    const proc = spawn(getYtDlpPath(), ['--ignore-config', ...args], {
      env: { ...process.env },
    });
    let stdout = '';
    let stderr = '';

    const onAbort = () => {
      proc.kill();
      reject(new DOMException('The operation was aborted', 'AbortError'));
    };

    signal?.addEventListener('abort', onAbort, { once: true });

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    proc.on('error', err => {
      signal?.removeEventListener('abort', onAbort);
      reject(err);
    });
    proc.on('close', code => {
      signal?.removeEventListener('abort', onAbort);
      resolve({ stdout, stderr, code: code ?? 1 });
    });
  });
}

/**
 * Run a `ytsearch<n>:<query>` against yt-dlp and parse the JSON-lines output
 * into `SearchResult`s. Centralizes the `--flat-playlist --dump-json
 * --no-warnings` arg array shared by the download-search, single-match, and
 * playlist-resolution call sites. Throws when yt-dlp exits non-zero.
 */
export async function ytSearch(
  query: string,
  options: { limit?: number; signal?: AbortSignal } = {}
): Promise<SearchResult[]> {
  const { limit = 10, signal } = options;
  const { stdout, code } = await spawnYtDlp(
    ['--flat-playlist', '--dump-json', '--no-warnings', `ytsearch${limit}:${query}`],
    signal
  );

  if (code !== 0) {
    throw new Error('yt-dlp search failed');
  }

  return parseYtDlpJsonLines(stdout);
}

/**
 * Trim verbose yt-dlp/ffmpeg output down to the last few non-empty lines,
 * bounded by both a line count and a byte cap, for safe inclusion in error
 * messages and logs (format enumeration can emit hundreds of lines).
 */
export function tailOutput(output: string, maxLines = 20, maxBytes = 2048): string {
  const lines = output
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  const tail = lines.slice(-maxLines).join('\n');
  return tail.length > maxBytes ? tail.slice(-maxBytes) : tail;
}

/**
 * Stable error codes returned by classifyYtDlpFailure for known failure
 * modes. The renderer maps these to i18n strings (EN + PL) — see
 * apps/web/src/lib/ytdlpErrors.ts. Unknown failures return the raw tail
 * of yt-dlp/ffmpeg output, which is technical English from the tool itself.
 *
 * When adding a new code here, add a matching translation entry in
 * toast.json (both locales) and map it in translateYtDlpError().
 */
export const YT_DLP_ERROR_CODES = {
  AGE_RESTRICTED: 'yt_dlp_age_restricted',
  VIDEO_UNAVAILABLE: 'yt_dlp_video_unavailable',
  NO_AUDIO_FORMAT: 'yt_dlp_no_audio_format',
} as const;

/**
 * Classify a yt-dlp failure from its captured stdout+stderr and return a
 * stable error code (translated in the renderer) or a raw output tail for
 * unknown cases. Age-restriction is the top cause of per-video failures in
 * 2026 — YouTube will not hand out stream URLs or formats without sign-in
 * cookies for videos flagged by the content classifier.
 */
export function classifyYtDlpFailure(output: string): string {
  const text = output.toLowerCase();

  if (
    text.includes('sign in to confirm your age') ||
    text.includes('login_required') ||
    text.includes('age-restricted')
  ) {
    return YT_DLP_ERROR_CODES.AGE_RESTRICTED;
  }

  if (text.includes('video unavailable') || text.includes('unplayable')) {
    return YT_DLP_ERROR_CODES.VIDEO_UNAVAILABLE;
  }

  if (text.includes('requested format is not available')) {
    return YT_DLP_ERROR_CODES.NO_AUDIO_FORMAT;
  }

  const tail = tailOutput(output);
  return tail || 'yt-dlp failed without producing any output';
}

export { extractVersionSegments, hasUpdate } from './version';

/**
 * Parse the newline-delimited JSON output produced by `yt-dlp --dump-json`
 * into `SearchResult` entries. Malformed lines are logged and skipped.
 */
export function parseYtDlpJsonLines(stdout: string): SearchResult[] {
  return stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => {
      try {
        const data = JSON.parse(line);
        const result: SearchResult = {
          id: data.id ?? '',
          title: data.title ?? 'Unknown',
          uploader: data.uploader ?? data.channel ?? 'Unknown',
          duration: data.duration ?? 0,
          thumbnail: data.thumbnail ?? data.thumbnails?.[0]?.url ?? '',
          url: data.url ?? `https://www.youtube.com/watch?v=${data.id}`,
          webpage_url: data.webpage_url ?? `https://www.youtube.com/watch?v=${data.id}`,
          view_count: typeof data.view_count === 'number' ? data.view_count : undefined,
        };
        return result;
      } catch (err) {
        logger.debug('[yt-dlp] Failed to parse JSON line:', err);
        return null;
      }
    })
    .filter((result): result is SearchResult => result !== null);
}
