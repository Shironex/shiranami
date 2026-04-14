import { spawn } from 'child_process';
import { logger } from '../logger';
import { getYtDlpPath } from '../ytdlp-manager';

export interface SearchResult {
  id: string;
  title: string;
  uploader: string;
  duration: number;
  thumbnail: string;
  url: string;
  webpage_url: string;
  view_count?: number;
}

/**
 * Spawn the bundled yt-dlp binary with the given args and buffer its full
 * stdout / stderr. Resolves with the captured streams and the process exit
 * code (defaulting to 1 if the child exited without one).
 */
export function spawnYtDlp(
  args: string[]
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(getYtDlpPath(), args, { env: { ...process.env } });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    proc.on('error', (err) => {
      reject(err);
    });
    proc.on('close', (code) => {
      resolve({ stdout, stderr, code: code ?? 1 });
    });
  });
}

/**
 * Parse the newline-delimited JSON output produced by `yt-dlp --dump-json`
 * into `SearchResult` entries. Malformed lines are logged and skipped.
 */
export function parseYtDlpJsonLines(stdout: string): SearchResult[] {
  return stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
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
