/**
 * Compile-time feature switches for optional server surfaces.
 *
 * These are deliberately constants rather than environment variables: mounting
 * a route surface is a code-review decision, not a per-deployment toggle.
 */

/**
 * Whether the YouTube proxy module (`/api/youtube/*`) is mounted.
 *
 * The module is maintained but dormant — the mobile app is its only consumer,
 * and mobile work resumes after the v1 desktop release. Flipping this to `true`
 * mounts the routes *and* makes `API_KEY` mandatory in production (see
 * `env.ts`), so the guarded surface can never come online unauthenticated.
 */
export const YOUTUBE_PROXY_ENABLED: boolean = false;
