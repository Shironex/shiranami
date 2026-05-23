/**
 * @shiranami/recommendation
 *
 * Pure scoring core for the recommendation engine. No DB, no yt-dlp, no IPC,
 * no Electron — just typed functions that turn listening signals into ranked
 * tracks. Platform adapters (desktop main, later mobile) project their storage
 * into these shapes and consume the ranked output.
 */

export * from './types.js';
export { affinityScore, rankByAffinity, selectSeedTracks } from './affinity.js';
export { similarityScore, rankBySimilarity } from './similarity.js';
