/**
 * Loop geometry of the recorded café layer (`assets/cafe-loop.mp3`).
 *
 * Voices, cups and chairs are the one texture synthesis cannot fake
 * convincingly, so this layer is a real recording (public domain, see
 * `assets/ASSETS_CREDITS.md`), trimmed by `scripts/ambient/make-cafe-loop.ts`.
 *
 * The file is `PAD + LOOP + PAD` seconds of audio that is periodic with period
 * LOOP: the leading pad is the loop's last PAD seconds and the trailing pad its
 * first. Any LOOP-long window inside the file therefore loops seamlessly,
 * which makes the loop immune to MP3 encoder delay and to resampling: however
 * many priming samples a decoder does or does not strip (it differs between
 * WebView2 and WKWebView), `loopStart = PAD` still lands on periodic audio.
 *
 * Kept free of the asset import so the Node script can share the numbers.
 */
export const CAFE_LOOP_SECONDS = 20;
export const CAFE_PAD_SECONDS = 0.5;
