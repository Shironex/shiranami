/**
 * Reading the app's own log file.
 *
 * The log is the suite's only window into what the Rust half did, and for the
 * shutdown scenario it is the *whole* assertion — a process that has exited
 * answers no WebDriver commands, so the evidence has to already be on disk.
 *
 * `infra::logging` writes plain text (never JSON — the `json` feature is
 * deliberately absent from the workspace pin) with `with_target(true)`, so every
 * line carries its module path and a substring match is unambiguous.
 */

import fs from 'node:fs';

import { logFile } from './paths.js';

/** Read the log for `home`, or `''` when the app has not written one yet. */
export function readLog(home: string): string {
  const file = logFile(home);
  if (!fs.existsSync(file)) return '';
  return fs.readFileSync(file, 'utf8');
}

/** Every line mentioning `needle`, for assertion messages worth reading. */
export function linesMatching(home: string, needle: string): string[] {
  return readLog(home)
    .split('\n')
    .filter(line => line.includes(needle));
}

/**
 * Poll the log until `needle` appears.
 *
 * Polling rather than watching because the file layer is non-blocking: the
 * worker thread writes on its own schedule, so a line emitted before a command
 * returned is not necessarily a line that has reached the disk.
 */
export async function waitForLogLine(
  home: string,
  needle: string,
  { timeout = 15_000, interval = 250 }: { timeout?: number; interval?: number } = {}
): Promise<string> {
  const deadline = Date.now() + timeout;

  for (;;) {
    const hit = linesMatching(home, needle)[0];
    if (hit !== undefined) return hit;

    if (Date.now() >= deadline) {
      throw new Error(
        `timed out after ${timeout}ms waiting for ${JSON.stringify(needle)} in ${logFile(home)}\n` +
          `--- last 40 lines ---\n${tail(home, 40)}`
      );
    }

    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

/** The last `count` lines, for failure messages. */
export function tail(home: string, count = 40): string {
  const lines = readLog(home).trimEnd().split('\n');
  return lines.slice(-count).join('\n');
}

/**
 * The `port=` field of the loopback server's startup line.
 *
 * `boot::sequence` logs this at INFO, so it is present without raising
 * `LOG_LEVEL`. Returns `null` when the server has not announced itself.
 */
export function servePort(home: string): number | null {
  const line = linesMatching(home, 'the loopback media server is listening').at(-1);
  if (line === undefined) return null;
  const match = /port=(\d+)/.exec(line);
  return match ? Number(match[1]) : null;
}
