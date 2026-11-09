/**
 * Compile-time feature switches for optional server surfaces.
 *
 * These are deliberately constants rather than environment variables: mounting
 * a route surface is a code-review decision, not a per-deployment toggle.
 */

/**
 * Whether the YouTube proxy module (`/api/youtube/*`) is mounted.
 *
 * On for the mobile app, its only consumer: search, suggestions and the audio
 * route the phone streams and saves songs from. While it is on, `API_KEY` is
 * mandatory in production (see `env.ts`), so the guarded surface can never
 * come online unauthenticated, and the image needs the `yt-dlp` binary
 * (`YTDLP_PATH`). Set it back to `false` to unmount every route at once.
 */
export const YOUTUBE_PROXY_ENABLED: boolean = true;
