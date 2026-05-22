import { app } from 'electron';
import { APP_NAME } from '@shiranami/shared';

/**
 * The app's own User-Agent for outbound requests we make as Shiranami
 * (yt-dlp release checks, radio stream proxying). Carries the live app
 * version from `package.json` rather than a hardcoded — and historically
 * stale — version literal.
 *
 * `app.getVersion()` is only callable after the Electron app module is ready,
 * which is always true for the network paths that use this (they run well
 * after `app.whenReady()`); resolved lazily so importing the const at module
 * load time never touches `app` too early.
 */
export function userAgent(): string {
  return `${APP_NAME}/${app.getVersion()}`;
}

/**
 * Browser-spoof User-Agent used only when scraping pages that gate content
 * behind a recognizable browser UA (Spotify's embed playlist page). This is
 * deliberately NOT the app UA — Spotify serves a different/empty payload to
 * non-browser clients. Kept here so the single magic string lives in one
 * place alongside the app UA.
 */
export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
