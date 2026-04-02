import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { spawn } from 'child_process';
import { RedisService } from '../redis/redis.service';
import type { SearchResult } from './dto/youtube.dto';

const SEARCH_CACHE_TTL = 300; // 5 minutes
const STREAM_CACHE_TTL = 3600; // 1 hour (yt-dlp stream URLs expire)
const SUGGEST_CACHE_TTL = 600; // 10 minutes

@Injectable()
export class YoutubeService {
  private readonly ytdlpPath: string;

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    @InjectPinoLogger(YoutubeService.name) private readonly logger: PinoLogger,
  ) {
    this.ytdlpPath = this.config.get<string>('YTDLP_PATH', 'yt-dlp');
  }

  async search(query: string): Promise<SearchResult[]> {
    const cacheKey = `yt:search:${query}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const { stdout, code } = await this.spawnYtDlp([
      '--flat-playlist',
      '--dump-json',
      '--no-warnings',
      `ytsearch10:${query}`,
    ]);

    if (code !== 0) {
      throw new Error('yt-dlp search failed');
    }

    const results: SearchResult[] = stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => {
        try {
          const data = JSON.parse(line);
          return {
            id: data.id ?? '',
            title: data.title ?? 'Unknown',
            uploader: data.uploader ?? data.channel ?? 'Unknown',
            duration: data.duration ?? 0,
            thumbnail: data.thumbnail ?? data.thumbnails?.[0]?.url ?? '',
            url: data.webpage_url ?? `https://www.youtube.com/watch?v=${data.id}`,
            viewCount: typeof data.view_count === 'number' ? data.view_count : undefined,
          };
        } catch {
          return null;
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null) as SearchResult[];

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
    const res = await fetch(url);
    const data = await res.json() as [string, string[]];
    const suggestions = Array.isArray(data[1]) ? data[1] : [];

    await this.redis.set(cacheKey, JSON.stringify(suggestions), 'EX', SUGGEST_CACHE_TTL);
    return suggestions;
  }

  async getStreamUrl(videoId: string): Promise<string> {
    const cacheKey = `yt:stream:${videoId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return cached;
    }

    const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const { stdout, code } = await this.spawnYtDlp([
      '-f', 'bestaudio',
      '--get-url',
      '--no-warnings',
      ytUrl,
    ]);

    if (code !== 0) {
      throw new Error('Failed to extract stream URL');
    }

    const streamUrl = stdout.trim().split('\n')[0];
    if (!streamUrl) {
      throw new Error('No stream URL returned');
    }

    this.logger.info(`Extracted stream URL for ${videoId}`);
    await this.redis.set(cacheKey, streamUrl, 'EX', STREAM_CACHE_TTL);
    return streamUrl;
  }

  async extractPlaylist(url: string): Promise<SearchResult[]> {
    const { stdout, code } = await this.spawnYtDlp([
      '--flat-playlist',
      '--dump-json',
      '--no-warnings',
      url,
    ]);

    if (code !== 0) {
      throw new Error('Failed to extract playlist');
    }

    const results: SearchResult[] = stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => {
        try {
          const data = JSON.parse(line);
          return {
            id: data.id ?? '',
            title: data.title ?? 'Unknown',
            uploader: data.uploader ?? data.channel ?? 'Unknown',
            duration: data.duration ?? 0,
            thumbnail: data.thumbnail ?? data.thumbnails?.[0]?.url ?? '',
            url: data.webpage_url ?? `https://www.youtube.com/watch?v=${data.id}`,
            viewCount: typeof data.view_count === 'number' ? data.view_count : undefined,
          };
        } catch {
          return null;
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null) as SearchResult[];

    this.logger.info(`Playlist extraction returned ${results.length} tracks`);
    return results;
  }

  private spawnYtDlp(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.ytdlpPath, args, { env: { ...process.env } });
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
      proc.on('error', reject);
      proc.on('close', code => {
        resolve({ stdout, stderr, code: code ?? 1 });
      });
    });
  }
}
