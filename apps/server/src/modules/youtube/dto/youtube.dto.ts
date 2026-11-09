import { z } from 'zod';

export const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
});

export const suggestQuerySchema = z.object({
  q: z.string().min(1).max(200),
});

export const streamParamsSchema = z.object({
  videoId: z
    .string()
    .min(1)
    .max(20)
    .regex(/^[a-zA-Z0-9_-]+$/),
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

/** What `stream/:videoId` answers: a signed link to the audio on this server. */
export interface StreamResponse {
  /** Server-relative path of the audio route, with its signed `t` token. */
  path: string;
  /** Unix seconds after which the link stops working. */
  expiresAt: number;
  /** File extension of the audio format, such as `m4a`. */
  ext: string;
  mimeType: string;
  /** Size of the whole file in bytes. */
  size: number;
}
