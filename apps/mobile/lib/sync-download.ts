import { SyncError, asSyncError, requestError, type SyncResponse } from '@/lib/sync-client';

/**
 * Downloads one track's audio into a partial file, resuming where an earlier
 * attempt stopped. Every attempt is a fresh signed request (a signature is
 * single use), so resuming is done here with `Range` rather than by a native
 * download task that would replay its headers.
 */

/** Where the bytes go: a `.part` file beside the final one. */
export interface PartialFile {
  /** Bytes already there from an earlier attempt. */
  size(): number;
  append(bytes: Uint8Array): void;
  /** Drops the bytes and starts over. */
  reset(): void;
  /** Closes the file and moves it to its final name. Returns that uri. */
  finish(): Promise<string>;
  /** Closes the file, keeping the bytes for the next attempt. */
  close(): void;
}

export interface DownloadOptions {
  file: PartialFile;
  /** `sizeBytes` from the manifest. */
  expectedSize: number | null;
  /** `fileVersion` from the manifest, sent as `If-Range`. */
  fileVersion: string | null;
  /** Signs and sends the audio request with these extra headers. */
  send: (headers: Record<string, string>) => Promise<SyncResponse>;
  signal?: AbortSignal;
  onBytes?: (written: number) => void;
}

/**
 * The resume headers for a partial file of `partialSize` bytes. A file
 * changed on the desktop since then answers 200 with the whole new body
 * (`If-Range`), never a 206 that would splice two versions.
 */
export function resumeHeaders(
  partialSize: number,
  fileVersion: string | null
): Record<string, string> {
  if (partialSize <= 0 || !fileVersion) return {};
  return { Range: `bytes=${partialSize}-`, 'If-Range': `"${fileVersion}"` };
}

/** The first byte of a `Content-Range: bytes 100-199/200` header, or null. */
export function rangeStart(header: string | null): number | null {
  const match = /^bytes (\d+)-\d+\/(?:\d+|\*)$/.exec(header?.trim() ?? '');
  return match ? Number(match[1]) : null;
}

/** How many times one download restarts from zero after a range mismatch. */
const MAX_RESTARTS = 1;

/** Downloads, resuming when it can. Returns the final uri and size. */
export async function downloadAudio(
  options: DownloadOptions
): Promise<{ uri: string; size: number }> {
  const { file, expectedSize, fileVersion, send, signal, onBytes } = options;
  try {
    for (let restarts = 0; ; restarts++) {
      let start = file.size();
      // Without a version the desktop cannot tell a changed file from the
      // same one, and a partial longer than the file is not this file.
      if (start > 0 && (!fileVersion || (expectedSize != null && start > expectedSize))) {
        file.reset();
        start = 0;
      }
      if (start > 0 && start === expectedSize) break;

      const response = await send(resumeHeaders(start, fileVersion));
      if (
        response.status === 416 ||
        (response.status === 206 && rangeStart(response.headers.get('Content-Range')) !== start)
      ) {
        await response.body?.cancel().catch(() => undefined);
        if (restarts >= MAX_RESTARTS)
          throw new SyncError('failed', 'the desktop sent the wrong range');
        file.reset();
        continue;
      }
      if (response.status === 200) {
        if (start > 0) file.reset();
      } else if (response.status !== 206) {
        throw await requestError(response);
      }
      await copyBody(response, file, signal, onBytes);
      break;
    }

    const size = file.size();
    if (expectedSize != null && size !== expectedSize) {
      // Longer is not this file; shorter is a dropped connection, kept to resume.
      if (size > expectedSize) file.reset();
      throw new SyncError('failed', `got ${size} of ${expectedSize} bytes`);
    }
    return { uri: await file.finish(), size };
  } catch (error) {
    file.close();
    throw asSyncError(error, signal);
  }
}

async function copyBody(
  response: SyncResponse,
  file: PartialFile,
  signal: AbortSignal | undefined,
  onBytes: ((written: number) => void) | undefined
): Promise<void> {
  if (!response.body) throw new SyncError('failed', 'the response has no body');
  const reader = response.body.getReader();
  try {
    for (;;) {
      if (signal?.aborted) throw new SyncError('cancelled');
      const { done, value } = await reader.read();
      if (done) return;
      if (value?.length) {
        file.append(value);
        onBytes?.(file.size());
      }
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
}
