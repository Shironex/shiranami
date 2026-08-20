/**
 * The `v2.json` handover manifest: fetch, validate, and answer "does this
 * install cross over?".
 *
 * The whole module is written around one invariant: **`fetchV2Manifest` never
 * throws and never reports.** While no manifest is published (today, and for
 * every v1.x release until v2 ships) the poll gets a 404 and must be
 * indistinguishable from the app doing nothing at all — no renderer event, no
 * Sentry breadcrumb, and at most one log line per process.
 */

import { app } from 'electron';
import { z } from 'zod';
import { logger } from '../logger';
import { hasUpdate } from '../../utils/version';
import { getManifestUrl, MANIFEST_MAX_BYTES, MANIFEST_TIMEOUT_MS } from './constants';

/** A dotted numeric version, optionally with a suffix (`2.0.0`, `2.0.0-rc.1`). */
const versionString = z.string().regex(/^\d+(\.\d+)*(-.+)?$/, 'expected a dotted numeric version');

const artifactSchema = z.object({
  url: z.url(),
  /** Lowercase hex sha256 of the artifact bytes. */
  sha256: z.string().regex(/^[a-fA-F0-9]{64}$/, 'expected a hex sha256 digest'),
  size: z.number().int().positive(),
});

/**
 * Manifest shape. `platforms` is keyed `<process.platform>-<process.arch>`
 * (e.g. `win32-x64`, `darwin-arm64`) so a v1 install can resolve its own
 * artifact without the manifest encoding any Electron-specific naming.
 */
export const v2ManifestSchema = z.object({
  /** Kill switch. `false` halts the rollout without shipping a release. */
  enabled: z.boolean(),
  version: versionString,
  /** v1 installs older than this are not offered the handover. */
  min_v1_version: versionString,
  platforms: z.record(z.string(), artifactSchema),
  /**
   * Landing-page download URL used by the manual (macOS) path. Optional and
   * additive: absent means fall back to the platform artifact URL.
   */
  download_page: z.url().optional(),
});

export type V2Manifest = z.infer<typeof v2ManifestSchema>;
export type V2Artifact = z.infer<typeof artifactSchema>;

/** One log line per process for the dormant failure path — never per tick. */
let dormantFailureLogged = false;

/** Test seam: forget that the dormant failure was already logged. */
export function __resetManifestLogGate(): void {
  dormantFailureLogged = false;
}

function noteDormant(reason: string): null {
  if (!dormantFailureLogged) {
    dormantFailureLogged = true;
    logger.info(`[v2-bridge] No handover manifest (${reason}) — staying dormant`);
  }
  return null;
}

/** The `platforms` key this install resolves to. */
export function currentPlatformKey(): string {
  return `${process.platform}-${process.arch}`;
}

/** The artifact for this platform/arch, or null when the manifest omits it. */
export function selectArtifact(manifest: V2Manifest): V2Artifact | null {
  return manifest.platforms[currentPlatformKey()] ?? null;
}

/**
 * True when this install is new enough to cross over. `hasUpdate(a, b)` is true
 * when `b` is strictly newer than `a`, so the floor is met exactly when
 * `min_v1_version` is not newer than the running version.
 */
export function meetsMinimumV1Version(manifest: V2Manifest, currentVersion: string): boolean {
  return !hasUpdate(currentVersion, manifest.min_v1_version);
}

/**
 * Fetch and validate the manifest. Returns null for every dormant outcome —
 * 404, DNS failure, offline, timeout, oversized body, non-JSON body, or a body
 * that fails schema validation. Callers only ever branch on `null` vs manifest.
 */
export async function fetchV2Manifest(): Promise<V2Manifest | null> {
  const url = getManifestUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MANIFEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      // Bypass any intermediary cache so the kill switch takes effect on the
      // next tick rather than whenever a CDN entry happens to expire.
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });

    // 404 is the expected steady state until v2 ships. Treated identically to
    // any other non-2xx: dormant, silent.
    if (!response.ok) {
      return noteDormant(`HTTP ${response.status}`);
    }

    const declaredLength = Number(response.headers.get('content-length') ?? '0');
    if (Number.isFinite(declaredLength) && declaredLength > MANIFEST_MAX_BYTES) {
      return noteDormant('body too large');
    }

    const body = await response.text();
    if (body.length > MANIFEST_MAX_BYTES) {
      return noteDormant('body too large');
    }

    const parsed = v2ManifestSchema.safeParse(JSON.parse(body) as unknown);
    if (!parsed.success) {
      return noteDormant('manifest failed validation');
    }

    return parsed.data;
  } catch (error) {
    // Covers abort/timeout, DNS/socket failures, and malformed JSON.
    return noteDormant(error instanceof Error ? error.name : 'fetch failed');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve the manifest into the artifact this install should hand over to, or
 * null when the handover does not apply (kill switch off, version floor not
 * met, or no artifact for this platform).
 */
export function resolveHandover(manifest: V2Manifest): V2Artifact | null {
  if (!manifest.enabled) return null;
  if (!meetsMinimumV1Version(manifest, app.getVersion())) return null;
  return selectArtifact(manifest);
}
