import { z } from 'zod';
import { YOUTUBE_PROXY_ENABLED } from './features';

const envSchema = z
  .object({
    DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),
    REDIS_URL: z.string().default('redis://localhost:6379'),
    PORT: z.coerce.number().default(3000),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    SHARE_BASE_URL: z.string().default('https://api.shiranami.app'),
    SHARE_TTL_SECONDS: z.coerce.number().default(3600),
    YTDLP_PATH: z.string().default('yt-dlp'),
    // Base URL of a bgutil PO token provider (for example http://bgutil:4416).
    // When set, every yt-dlp run asks it for YouTube PO tokens; unset leaves
    // yt-dlp's arguments untouched.
    YTDLP_POT_PROVIDER_URL: z.string().url('YTDLP_POT_PROVIDER_URL must be a valid URL').optional(),
    // Extra yt-dlp plugin directory holding the provider plugin. Dockerfile.server
    // sets it; it is only passed to yt-dlp together with YTDLP_POT_PROVIDER_URL.
    YTDLP_PLUGIN_DIR: z.string().min(1).optional(),
    // Optional Netscape cookies.txt for yt-dlp, from a logged-in spare account:
    // YouTube answers "confirm you're not a bot" to datacenter IPs otherwise.
    // Export it from a private window per the yt-dlp wiki ("Exporting YouTube
    // cookies"), then close that window so the session is not rotated. It
    // expires, so renew it when the bot check comes back. Each yt-dlp run uses
    // a private copy under /tmp, so a read-only mount is fine; unset leaves
    // yt-dlp's arguments untouched and an unreadable file only logs a warning.
    YTDLP_COOKIES_FILE: z.string().min(1).optional(),
    // Mandatory in production while a guarded surface is mounted (the YouTube
    // proxy, see ./features): ApiKeyGuard denies every request when it is
    // unset, so booting without it would take those routes offline rather than
    // expose them. It also signs the audio links `stream/:videoId` hands out.
    // Optional in development and tests, and whenever YOUTUBE_PROXY_ENABLED is
    // false.
    API_KEY: z.string().min(1, 'API_KEY must not be empty').optional(),
  })
  .superRefine((env, ctx) => {
    if (YOUTUBE_PROXY_ENABLED && env.NODE_ENV === 'production' && !env.API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['API_KEY'],
        message: 'API_KEY is required when NODE_ENV is production and the YouTube proxy is enabled',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment variables:');
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  return result.data;
}
