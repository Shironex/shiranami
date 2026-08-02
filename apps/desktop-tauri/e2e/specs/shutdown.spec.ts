/**
 * The `ExitRequested` path, exercised for the first time.
 *
 * # Why this had never run
 *
 * §2.4 makes `ExitRequested` the media server's documented lifetime, and both
 * Phase 16 and Phase 17 recorded that the path had never actually been taken: a
 * `pnpm tauri:dev` session ends with a signal, which never reaches
 * `ExitRequested`, and nothing before this suite could deliver a real quit. So
 * the shutdown branch was code that had been reviewed and never executed.
 *
 * This spec closes the app the way a user does — through `window.close()` on the
 * production IPC — and then reads the log the dead process left behind. That
 * ordering is the whole design: once the app is gone there is no WebDriver
 * session to ask anything, so every assertion has to be against bytes already on
 * disk. It is also why `lib.rs`'s `shutdown` flushes the file appender
 * explicitly: `tao` exits via `std::process::exit`, which runs no destructors,
 * and without that flush the last lines of every session were being dropped.
 *
 * # It runs last in its capability, and that is not incidental
 *
 * `wdio.conf.ts` lists this file last under `migrated` because it ends the
 * process. Anything after it in the same capability would open a second app
 * against a profile this one has already closed.
 */

import { browser } from '@wdio/globals';

import { waitForStores, waitForShell } from '../helpers/app.js';
import { profile } from '../helpers/profile.js';
import { readLog, waitForLogLine, linesMatching } from '../helpers/logs.js';

const HOME = profile('migrated').home;

describe('shutdown', () => {
  before(async () => {
    await waitForStores();
    await waitForShell();
    // The server has to be up for its shutdown to mean anything.
    await waitForLogLine(HOME, 'the loopback media server is listening', { timeout: 30_000 });
  });

  it('quits on a renderer close request and runs the graceful path', async () => {
    // Fire and forget. `window.close()` never resolves — the process it would
    // resolve into is the one being torn down — so awaiting it would hang until
    // the command timeout and then fail a spec whose subject had worked.
    await browser
      .execute(() => {
        void window.electronAPI.window.close();
      })
      .catch(() => {
        /* the session dying underneath this call is the expected outcome */
      });

    // From here on the app is the log file.
    await waitForLogLine(HOME, 'exit requested; shutting down', { timeout: 30_000 });
    await waitForLogLine(HOME, 'graceful shutdown complete', { timeout: 30_000 });
  });

  it('stopped the loopback media server on the way out', async () => {
    // §2.4's contract, and the half most likely to rot: the server is an
    // `Arc`, and a stray clone anywhere would turn this line into the
    // "still referenced" warning instead.
    await waitForLogLine(HOME, 'the loopback media server is stopped', { timeout: 15_000 });

    expect(linesMatching(HOME, 'the media server is still referenced')).toEqual([]);
  });

  it('flushed the log rather than losing its tail to process::exit', async () => {
    // The ordering assertion that makes the flush provable. `graceful shutdown
    // complete` is logged *after* the server stops and immediately before the
    // appender's worker is joined, so its presence — at the end, in that order —
    // is the evidence the flush ran. Without it `tao`'s `std::process::exit`
    // takes the buffered tail with it.
    const log = readLog(HOME);

    const stopped = log.indexOf('the loopback media server is stopped');
    const complete = log.indexOf('graceful shutdown complete');
    const requested = log.indexOf('exit requested; shutting down');

    expect(requested).toBeGreaterThan(-1);
    expect(stopped).toBeGreaterThan(requested);
    expect(complete).toBeGreaterThan(stopped);
  });

  it('left no error or panic behind', async () => {
    const log = readLog(HOME);

    expect(log).not.toContain('panicked at');
    // A shutdown that logged an ERROR did not shut down gracefully, whatever
    // else it managed to write.
    expect(linesMatching(HOME, ' ERROR ')).toEqual([]);
  });
});
