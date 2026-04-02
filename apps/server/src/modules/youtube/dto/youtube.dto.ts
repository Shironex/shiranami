import { z } from 'zod';

export const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
});

export const suggestQuerySchema = z.object({
  q: z.string().min(1).max(200),
});

export const streamParamsSchema = z.object({
  videoId: z.string().min(1).max(20).regex(/^[a-zA-Z0-9_-]+$/),
});

export const playlistBodySchema = z.object({
  url: z.string().url(),
});

export interface SearchResult {
  id: string;
  title: string;
  uploader: string;
  duration: number;
  thumbnail: string;
  url: string;
  viewCount?: number;
}
