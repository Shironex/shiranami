import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { makeTempDir, cleanupTempDir } from '../../../test/setup';

/** Captured protocol handler (set when registerAudioProtocol() runs). */
let capturedHandler: ((req: Request) => Promise<Response>) | null = null;

vi.mock('electron', () => ({
  protocol: {
    handle(_scheme: string, handler: (req: Request) => Promise<Response>) {
      capturedHandler = handler;
    },
  },
}));

vi.mock('../app/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const mockIsPathAllowed = vi.fn<(p: string) => Promise<boolean>>();
vi.mock('../shared/folders-cache', () => ({
  isPathAllowed: (p: string) => mockIsPathAllowed(p),
}));

import { registerAudioProtocol, toAudioUrl } from './audio-protocol';

describe('audio-protocol', () => {
  describe('toAudioUrl', () => {
    it('encodes file path into a shiranami-audio:// URL', () => {
      const url = toAudioUrl('/Users/me/Music/song.mp3');
      expect(url).toBe('shiranami-audio://play?path=%2FUsers%2Fme%2FMusic%2Fsong.mp3');
    });

    it('normalizes Windows backslashes to forward slashes', () => {
      const url = toAudioUrl('C:\\Music\\song.mp3');
      expect(url).toContain('C%3A%2FMusic%2Fsong.mp3');
    });

    it('safely encodes special characters', () => {
      const url = toAudioUrl('/Music/song with spaces & stuff.mp3');
      expect(url).toContain('song%20with%20spaces%20%26%20stuff.mp3');
    });
  });

  describe('protocol handler', () => {
    let tempDir: string;

    beforeEach(() => {
      capturedHandler = null;
      tempDir = makeTempDir();
      mockIsPathAllowed.mockReset();
      // Default: containment passes so existing tests exercise their assertions.
      mockIsPathAllowed.mockResolvedValue(true);
      registerAudioProtocol();
    });

    afterEach(() => {
      cleanupTempDir(tempDir);
    });

    function makeRequest(url: string, headers: Record<string, string> = {}): Request {
      return new Request(url, { headers });
    }

    it('returns 400 when path parameter is missing', async () => {
      const res = await capturedHandler!(makeRequest('shiranami-audio://play'));
      expect(res.status).toBe(400);
    });

    it('returns 403 for disallowed extensions', async () => {
      const badPath = path.join(tempDir, 'not-audio.txt');
      fs.writeFileSync(badPath, 'hello');
      const url = toAudioUrl(badPath);
      const res = await capturedHandler!(makeRequest(url));
      expect(res.status).toBe(403);
    });

    it('returns 404 when file does not exist', async () => {
      const missingPath = path.join(tempDir, 'missing.mp3');
      const url = toAudioUrl(missingPath);
      const res = await capturedHandler!(makeRequest(url));
      expect(res.status).toBe(404);
    });

    it('returns 200 and full file content for a valid audio file', async () => {
      const filePath = path.join(tempDir, 'song.mp3');
      const payload = Buffer.from('ID3FAKEMP3BYTES');
      fs.writeFileSync(filePath, payload);
      const url = toAudioUrl(filePath);
      const res = await capturedHandler!(makeRequest(url));

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('audio/mpeg');
      expect(res.headers.get('Content-Length')).toBe(String(payload.length));
      expect(res.headers.get('Accept-Ranges')).toBe('bytes');
    });

    it('returns 206 partial content for a Range request', async () => {
      const filePath = path.join(tempDir, 'song.flac');
      const payload = Buffer.alloc(100, 0xab);
      fs.writeFileSync(filePath, payload);
      const url = toAudioUrl(filePath);
      const res = await capturedHandler!(makeRequest(url, { Range: 'bytes=0-9' }));

      expect(res.status).toBe(206);
      expect(res.headers.get('Content-Type')).toBe('audio/flac');
      expect(res.headers.get('Content-Range')).toBe('bytes 0-9/100');
      expect(res.headers.get('Content-Length')).toBe('10');
    });

    it('returns 403 when path points to a directory', async () => {
      const url = toAudioUrl(path.join(tempDir, 'sub.mp3'));
      // Create a directory at that path
      fs.mkdirSync(path.join(tempDir, 'sub.mp3'));
      const res = await capturedHandler!(makeRequest(url));
      expect(res.status).toBe(403);
    });

    it('returns 403 when isPathAllowed denies the path (even with valid extension/file)', async () => {
      mockIsPathAllowed.mockResolvedValue(false);
      const filePath = path.join(tempDir, 'denied.mp3');
      fs.writeFileSync(filePath, Buffer.from('ID3FAKE'));
      const url = toAudioUrl(filePath);
      const res = await capturedHandler!(makeRequest(url));
      expect(res.status).toBe(403);
    });

    it('does not stat the file when isPathAllowed denies (containment runs first)', async () => {
      mockIsPathAllowed.mockResolvedValue(false);
      // Path looks like an audio file but does not exist — would normally 404.
      // Containment short-circuits to 403 before the stat call.
      const url = toAudioUrl(path.join(tempDir, 'never-created.mp3'));
      const res = await capturedHandler!(makeRequest(url));
      expect(res.status).toBe(403);
    });
  });
});
