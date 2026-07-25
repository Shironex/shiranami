import { z } from 'zod';

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
    // Optional locally so `pnpm dev` needs no secret, but mandatory in
    // production: ApiKeyGuard denies every request when it is unset, so a
    // production boot without it would take the guarded routes offline.
    API_KEY: z.string().min(1, 'API_KEY must not be empty').optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['API_KEY'],
        message: 'API_KEY is required when NODE_ENV is production',
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
