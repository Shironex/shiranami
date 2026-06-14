import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeTempDir, cleanupTempDir } from '../../../test/setup';

/**
 * extract-worker.ts is a Node worker script: when imported, it synchronously
 * reads `workerData` from 'node:worker_threads' and posts a result to
 * `parentPort`. We simulate that by mocking both before re-importing.
 */

type PostedMessage = { success: boolean; method?: string; error?: string };

async function runWorker(
  workerData: { zipPath: string; destDir: string },
  opts: {
    admZipImpl?: () => { extractAllTo: (dest: string, overwrite: boolean) => void };
    execFileSync?: (cmd: string, args: string[]) => Buffer | string;
  } = {}
): Promise<PostedMessage> {
  vi.resetModules();

  const messages: PostedMessage[] = [];
  vi.doMock('node:worker_threads', () => ({
    parentPort: {
      postMessage: (msg: PostedMessage) => {
        messages.push(msg);
      },
    },
    workerData,
  }));

  const admZipImpl =
    opts.admZipImpl ??
    function () {
      return { extractAllTo: vi.fn() };
    };
  vi.doMock('adm-zip', () => ({
    default: vi.fn().mockImplementation(admZipImpl),
  }));

  vi.doMock('node:child_process', () => ({
    execFileSync:
      opts.execFileSync ??
      vi.fn(() => {
        throw new Error('no fallback configured');
      }),
  }));

  await import('./extract-worker');
  // Give any microtasks a chance to flush
  await Promise.resolve();

  expect(messages).toHaveLength(1);
  return messages[0];
}

describe('extract-worker', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it('succeeds via adm-zip when it works', async () => {
    const msg = await runWorker({ zipPath: '/fake.zip', destDir: tempDir });
    expect(msg).toEqual({ success: true, method: 'adm-zip' });
  });

  it('falls back to tar when adm-zip fails', async () => {
    const msg = await runWorker(
      { zipPath: '/fake.zip', destDir: tempDir },
      {
        admZipImpl: function () {
          throw new Error('adm-zip broken');
        },
        execFileSync: vi.fn((cmd: string) => {
          if (cmd === 'tar') return Buffer.from('');
          throw new Error('should not be called');
        }),
      }
    );
    expect(msg).toEqual({ success: true, method: 'tar' });
  });

  it('falls back to powershell when adm-zip and tar fail', async () => {
    const execFileSync = vi.fn((cmd: string) => {
      if (cmd === 'powershell') return Buffer.from('');
      throw new Error(`${cmd} failed`);
    });
    const msg = await runWorker(
      { zipPath: '/fake.zip', destDir: tempDir },
      {
        admZipImpl: function () {
          throw new Error('adm-zip broken');
        },
        execFileSync,
      }
    );
    expect(msg).toEqual({ success: true, method: 'powershell' });
  });

  it('posts failure when all extractors fail', async () => {
    const msg = await runWorker(
      { zipPath: '/fake.zip', destDir: tempDir },
      {
        admZipImpl: function () {
          throw new Error('adm-zip err');
        },
        execFileSync: vi.fn(() => {
          throw new Error('all failed');
        }),
      }
    );
    expect(msg.success).toBe(false);
    expect(msg.error).toMatch(/All extraction methods failed/);
    expect(msg.error).toMatch(/adm-zip err/);
  });
});
