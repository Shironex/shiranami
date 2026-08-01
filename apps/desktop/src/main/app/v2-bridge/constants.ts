/**
 * Tunables for the dormant v2 handover bridge.
 *
 * Every value here is sized for the dormant case — the manifest does not exist
 * yet, so the poll must stay cheap enough that a 404 an hour is free.
 */

/** Default manifest location. Deliberately NOT `latest.yml`: electron-updater
 * must never see this file, and this file must never be parsed as an
 * electron-builder feed. */
const DEFAULT_MANIFEST_URL = 'https://shiranami.app/v2.json';

/**
 * Manifest URL, overridable for the Spike B rehearsal (a clean Windows VM
 * running a real published v1.x against a test manifest). Read per call rather
 * than at module load so tests can flip it without re-importing.
 */
export function getManifestUrl(): string {
  const override = process.env.SHIRANAMI_V2_MANIFEST_URL;
  return override && override.length > 0 ? override : DEFAULT_MANIFEST_URL;
}

/** True when a manifest URL override is set (the Spike B / local-test hatch). */
export function hasManifestUrlOverride(): boolean {
  const override = process.env.SHIRANAMI_V2_MANIFEST_URL;
  return typeof override === 'string' && override.length > 0;
}

/** Manifest poll timeout. Short — a hanging poll must never pile up per tick. */
export const MANIFEST_TIMEOUT_MS = 5_000;

/** Hard cap on the manifest body. The real file is well under 2 KB. */
export const MANIFEST_MAX_BYTES = 64 * 1024;

/** Installer download timeout (Windows automatic path only). */
export const INSTALLER_TIMEOUT_MS = 10 * 60_000;

/** Refuse to buffer an installer larger than this, whatever the manifest says. */
export const INSTALLER_MAX_BYTES = 300 * 1024 * 1024;

/** Subdirectory of `userData` holding the downloaded Tauri installer. */
export const INSTALLER_DIR_NAME = 'v2-update';

/**
 * NSIS passive-mode flag. Shows a progress bar, takes no input. Matches the
 * `installMode: "passive"` the v2 bundle is configured with.
 */
export const NSIS_PASSIVE_FLAG = '/P';

/** Handoff descriptor consumed by v2's first-run continuity step. */
export const HANDOFF_FILE_NAME = 'v2-handoff.json';

/** Renderer `localStorage` dump consumed by v2 before the zustand stores hydrate. */
export const RENDERER_STATE_FILE_NAME = 'renderer-state.json';

/** Only keys under this prefix are dumped — everything shiranami persists is namespaced. */
export const RENDERER_STATE_KEY_PREFIX = 'shiranami.';

/**
 * Envelope version for both handoff files. Bump only on a breaking shape
 * change; new fields are additive and optional so an older v2 reader survives.
 */
export const HANDOFF_SCHEMA_VERSION = 1;

/** Store key recording that the one-time crossover ping already fired. */
export const CROSSOVER_PINGED_KEY = 'v2.crossoverPinged' as const;
