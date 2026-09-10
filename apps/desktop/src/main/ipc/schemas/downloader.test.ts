import { describe, it, expect } from 'vitest';
import {
  downloaderCheckArgs,
  downloaderGetDownloadLocationArgs,
  downloaderSetDownloadLocationArgs,
  downloaderCheckDependenciesArgs,
  downloaderGetCachedToolStatusArgs,
  downloaderRefreshToolStatusArgs,
  downloaderSearchArgs,
  downloaderSuggestArgs,
  downloaderDownloadArgs,
  downloaderInstallYtdlpArgs,
  downloaderGetYtdlpPathArgs,
  downloaderCheckFfmpegArgs,
  downloaderInstallFfmpegArgs,
  downloaderGetStreamUrlArgs,
  downloaderInstallDependenciesArgs,
} from './downloader';

describe('downloader payload schemas', () => {
  describe('zero-arg schemas', () => {
    it('accept zero args', () => {
      expect(downloaderCheckArgs.safeParse([]).success).toBe(true);
      expect(downloaderGetDownloadLocationArgs.safeParse([]).success).toBe(true);
      expect(downloaderCheckDependenciesArgs.safeParse([]).success).toBe(true);
      expect(downloaderGetCachedToolStatusArgs.safeParse([]).success).toBe(true);
      expect(downloaderRefreshToolStatusArgs.safeParse([]).success).toBe(true);
      expect(downloaderInstallYtdlpArgs.safeParse([]).success).toBe(true);
      expect(downloaderGetYtdlpPathArgs.safeParse([]).success).toBe(true);
      expect(downloaderCheckFfmpegArgs.safeParse([]).success).toBe(true);
      expect(downloaderInstallFfmpegArgs.safeParse([]).success).toBe(true);
      expect(downloaderInstallDependenciesArgs.safeParse([]).success).toBe(true);
    });

    it('reject extra args', () => {
      expect(downloaderCheckArgs.safeParse(['x']).success).toBe(false);
    });
  });

  describe('downloaderSetDownloadLocationArgs', () => {
    it('accepts a path string', () => {
      expect(downloaderSetDownloadLocationArgs.safeParse(['/tmp/music']).success).toBe(true);
    });

    it('accepts null', () => {
      expect(downloaderSetDownloadLocationArgs.safeParse([null]).success).toBe(true);
    });

    it('rejects a number', () => {
      expect(downloaderSetDownloadLocationArgs.safeParse([42]).success).toBe(false);
    });
  });

  describe('downloaderSearchArgs / downloaderSuggestArgs', () => {
    it('accept a non-empty query', () => {
      expect(downloaderSearchArgs.safeParse(['lofi']).success).toBe(true);
      expect(downloaderSuggestArgs.safeParse(['lofi']).success).toBe(true);
    });

    it('reject empty string', () => {
      expect(downloaderSearchArgs.safeParse(['']).success).toBe(false);
    });
  });

  describe('downloaderDownloadArgs', () => {
    it('accepts {url}', () => {
      expect(downloaderDownloadArgs.safeParse([{ url: 'https://x/y' }]).success).toBe(true);
    });

    it('accepts {url, outputDir}', () => {
      expect(
        downloaderDownloadArgs.safeParse([{ url: 'https://x/y', outputDir: '/tmp' }]).success
      ).toBe(true);
    });

    it('rejects missing url', () => {
      expect(downloaderDownloadArgs.safeParse([{}]).success).toBe(false);
    });
  });

  describe('downloaderGetStreamUrlArgs', () => {
    it('accepts a url', () => {
      expect(downloaderGetStreamUrlArgs.safeParse(['https://youtu.be/x']).success).toBe(true);
    });

    it('rejects empty', () => {
      expect(downloaderGetStreamUrlArgs.safeParse(['']).success).toBe(false);
    });
  });
});
