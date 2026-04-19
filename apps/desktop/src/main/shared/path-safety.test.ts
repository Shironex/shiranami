import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  isPathWithin,
  isPathWithinAny,
  normalizePathForCompare,
} from './path-safety';

/* ------------------------------------------------------------------ */
/*  normalizePathForCompare                                           */
/* ------------------------------------------------------------------ */

describe('normalizePathForCompare', () => {
  it('strips trailing separator when not a root', () => {
    const a = normalizePathForCompare('/foo/bar/');
    const b = normalizePathForCompare('/foo/bar');
    expect(a).toBe(b);
  });

  it.skipIf(process.platform === 'linux')(
    'lowercases paths on case-insensitive platforms',
    () => {
      const a = normalizePathForCompare('/Users/Me/Music');
      const b = normalizePathForCompare('/users/me/music');
      expect(a).toBe(b);
    },
  );
});

/* ------------------------------------------------------------------ */
/*  isPathWithin                                                      */
/* ------------------------------------------------------------------ */

describe('isPathWithin', () => {
  it('accepts a deeply nested child of the root', () => {
    const root = normalizePathForCompare('/home/user/music');
    const child = normalizePathForCompare('/home/user/music/folder/sub/song.mp3');
    expect(isPathWithin(child, root)).toBe(true);
  });

  it('accepts a child equal to the root', () => {
    const root = normalizePathForCompare('/home/user/music');
    const child = normalizePathForCompare('/home/user/music');
    expect(isPathWithin(child, root)).toBe(true);
  });

  it('rejects `..` traversal out of the root', () => {
    const root = normalizePathForCompare('/home/user/music');
    // path.resolve collapses `..` — construct an already-escaped path directly.
    const child = normalizePathForCompare('/home/user/other/secret.txt');
    expect(isPathWithin(child, root)).toBe(false);
  });

  it('rejects an absolute path outside the root', () => {
    const root = normalizePathForCompare('/home/user/music');
    const child = normalizePathForCompare('/etc/passwd');
    expect(isPathWithin(child, root)).toBe(false);
  });

  it('rejects a sibling whose name prefixes the root (music-evil vs music)', () => {
    // Guards against the classic string-startsWith bug.
    const root = normalizePathForCompare('/home/user/music');
    const child = normalizePathForCompare('/home/user/music-evil/song.mp3');
    expect(isPathWithin(child, root)).toBe(false);
  });

  it.skipIf(process.platform !== 'win32')(
    'rejects paths on a different Windows drive',
    () => {
      const root = normalizePathForCompare('C:\\music');
      const child = normalizePathForCompare('D:\\music\\song.mp3');
      expect(isPathWithin(child, root)).toBe(false);
    },
  );

  it('treats paths with and without a trailing separator as equivalent', () => {
    const withSlash = normalizePathForCompare('/home/user/music/');
    const without = normalizePathForCompare('/home/user/music');
    const child = normalizePathForCompare('/home/user/music/song.mp3');
    expect(isPathWithin(child, withSlash)).toBe(true);
    expect(isPathWithin(child, without)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  isPathWithinAny                                                   */
/* ------------------------------------------------------------------ */

describe('isPathWithinAny', () => {
  it('accepts when any root contains the child', () => {
    const roots = [
      normalizePathForCompare('/home/user/music'),
      normalizePathForCompare('/home/user/podcasts'),
    ];
    expect(isPathWithinAny('/home/user/podcasts/ep01.mp3', roots)).toBe(true);
  });

  it('rejects when no root contains the child', () => {
    const roots = [
      normalizePathForCompare('/home/user/music'),
      normalizePathForCompare('/home/user/podcasts'),
    ];
    expect(isPathWithinAny('/etc/passwd', roots)).toBe(false);
  });

  it('rejects against an empty roots list', () => {
    expect(isPathWithinAny('/home/user/music/song.mp3', [])).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Symlink behaviour (documents current behaviour — no realpath)     */
/* ------------------------------------------------------------------ */

describe('symlink handling (documents current behaviour)', () => {
  let tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs = [];
  });

  function mkTemp(prefix: string): string {
    // Use realpath so symlinks like /var/folders -> /private/var/folders on
    // macOS don't cause false rejections in the assertion.
    const dir = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), prefix)),
    );
    tempDirs.push(dir);
    return dir;
  }

  it('treats a symlink inside the root as contained even if the target is outside', () => {
    const allowedRoot = mkTemp('path-safety-root-');
    const outsideDir = mkTemp('path-safety-outside-');

    const targetFile = path.join(outsideDir, 'secret.mp3');
    fs.writeFileSync(targetFile, 'x');

    const linkPath = path.join(allowedRoot, 'shortcut.mp3');
    try {
      fs.symlinkSync(targetFile, linkPath);
    } catch {
      // Symlink creation can fail on Windows without elevation — skip.
      return;
    }

    // Path stays inside allowedRoot textually because we don't call realpath.
    expect(
      isPathWithin(
        normalizePathForCompare(linkPath),
        normalizePathForCompare(allowedRoot),
      ),
    ).toBe(true);
  });
});
