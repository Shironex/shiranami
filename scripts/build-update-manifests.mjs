#!/usr/bin/env node
/**
 * Builds the two release manifests v2 publishes, from a directory of built
 * bundles.
 *
 * They are different files for different readers and must never be confused:
 *
 * - **`latest.json`** — the feed `tauri-plugin-updater` polls, so v2 can update
 *   itself. Windows only: `updater::is_supported` excludes macOS until the
 *   Developer ID certificate lands (architecture §4.3), and a feed entry for a
 *   platform whose updater is compiled out would be a promise nothing keeps.
 *
 * - **`v2.json`** — the handover manifest the *v1 Electron* app polls (§4.1),
 *   whose shape is fixed by the shipped bridge in
 *   `apps/desktop/src/main/app/v2-bridge/manifest.ts`. Every platform goes in
 *   here, because macOS's handover is a modal (§4.3) and the bridge only shows
 *   it when the manifest carries an artifact for that platform.
 *
 * Both are generated, never hand-written: the digests and sizes in `v2.json`
 * are what v1 verifies an installer against before executing it, and a stale
 * digest there is a silent failed crossover.
 *
 * ## Dormancy
 *
 * `enabled` defaults to `false`. Generating the manifest is not publishing the
 * rollout — Phase 20 flips it once v2 is actually out. A `v2.json` uploaded
 * with `enabled: true` before then would start handing users over to a draft
 * release.
 *
 * ## Usage
 *
 *   node scripts/build-update-manifests.mjs \
 *     --artifacts <dir> --out <dir> --version <semver> \
 *     --tag <tag> --repo <owner/name> --min-v1 <semver> \
 *     [--download-page <url>] [--notes-file <path>] [--enabled] [--pub-date <iso>]
 *
 *   node scripts/build-update-manifests.mjs --self-test
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';

/**
 * The bridge's own validators, restated. `manifest.ts` rejects a manifest that
 * fails any of these and goes dormant *silently* — so a violation here would
 * surface as "nobody ever crossed over", months later, with no error anywhere.
 * Asserting at generation time is the only place it can be loud.
 */
const VERSION_RE = /^\d+(\.\d+)*(-.+)?$/;
const SHA256_RE = /^[a-f0-9]{64}$/;

/**
 * `handover.ts#installerFileName` refuses to write or execute anything whose
 * URL basename does not match this. A Windows artifact that fails it strands
 * every Windows user on v1 with no visible error.
 */
const SAFE_INSTALLER_NAME_RE = /^[A-Za-z0-9._-]+\.exe$/;

/** `constants.ts#INSTALLER_MAX_BYTES` — the bridge refuses anything larger. */
const INSTALLER_MAX_BYTES = 300 * 1024 * 1024;

/**
 * Rust target triple fragments, as `tauri-plugin-updater` builds its lookup
 * key: `{updater_os()}-{updater_arch()}`.
 */
const UPDATER_ARCH = { x64: 'x86_64', arm64: 'aarch64' };

/**
 * `process.platform`-`process.arch`, as the bridge's `currentPlatformKey()`
 * builds it. Deliberately Node's vocabulary and not Rust's — the reader is an
 * Electron app.
 */
const BRIDGE_ARCH = { x64: 'x64', arm64: 'arm64' };

/**
 * What a bundle file is, from its name alone.
 *
 * Tauri names artifacts `<productName>_<version>_<arch>[-setup].<ext>`, so the
 * arch token is the only thing that has to be read out of it. `null` for
 * anything unrecognised — the bundle directory also holds `.sig` files, the
 * unpacked `.app`, and NSIS/WiX scratch.
 */
export function classifyArtifact(fileName) {
  const arch = fileName.includes('aarch64') || fileName.includes('arm64') ? 'arm64' : 'x64';

  if (fileName.endsWith('-setup.exe')) return { kind: 'nsis', platform: 'win32', arch };
  if (fileName.endsWith('.dmg')) return { kind: 'dmg', platform: 'darwin', arch };
  if (fileName.endsWith('.app.tar.gz')) return { kind: 'app-archive', platform: 'darwin', arch };
  return null;
}

/** A GitHub release asset URL. Tauri artifact names never contain spaces. */
export function assetUrl(repo, tag, fileName) {
  return `https://github.com/${repo}/releases/download/${tag}/${fileName}`;
}

/**
 * The Tauri updater feed. Static format: one `platforms` map keyed
 * `{os}-{arch}`, each entry carrying the minisign signature of the artifact the
 * URL points at.
 *
 * Windows-only by construction, per the module docs. `signed` entries missing a
 * signature are a build that did not run with `TAURI_SIGNING_PRIVATE_KEY` set,
 * which is a hard error rather than an omission: an unsigned feed entry makes
 * every client reject the update at install time.
 */
export function buildLatestJson({ version, pubDate, notes, signed }) {
  const platforms = {};

  for (const entry of signed) {
    if (entry.platform !== 'win32') continue;
    if (!entry.signature) {
      throw new Error(`${entry.fileName} has no minisign signature — was the build signed?`);
    }
    platforms[`windows-${UPDATER_ARCH[entry.arch]}`] = {
      signature: entry.signature,
      url: entry.url,
    };
  }

  if (Object.keys(platforms).length === 0) {
    throw new Error('latest.json would carry no platforms — no signed Windows installer found');
  }

  return { version, notes, pub_date: pubDate, platforms };
}

/**
 * The v1 handover manifest (§4.1). Shape is fixed by the bridge's zod schema;
 * every field below is one it validates.
 */
export function buildHandoverManifest({ version, minV1Version, downloadPage, enabled, artifacts }) {
  if (!VERSION_RE.test(version)) throw new Error(`version "${version}" is not a dotted version`);
  if (!VERSION_RE.test(minV1Version)) {
    throw new Error(`min_v1_version "${minV1Version}" is not a dotted version`);
  }

  const platforms = {};

  for (const artifact of artifacts) {
    // One artifact per platform: the NSIS installer is what v1 executes on
    // Windows, and the DMG is what the macOS modal links to. The `.app.tar.gz`
    // is updater-only and would be meaningless to a v1 install.
    if (artifact.kind === 'app-archive') continue;

    if (artifact.kind === 'nsis') {
      if (!SAFE_INSTALLER_NAME_RE.test(artifact.fileName)) {
        throw new Error(
          `"${artifact.fileName}" would be rejected by the v1 bridge's installer-name guard`
        );
      }
      if (artifact.size > INSTALLER_MAX_BYTES) {
        throw new Error(
          `"${artifact.fileName}" is ${artifact.size} bytes, over the bridge's ${INSTALLER_MAX_BYTES} ceiling`
        );
      }
    }

    if (!SHA256_RE.test(artifact.sha256)) {
      throw new Error(`"${artifact.fileName}" has a malformed sha256`);
    }

    platforms[`${artifact.platform}-${BRIDGE_ARCH[artifact.arch]}`] = {
      url: artifact.url,
      sha256: artifact.sha256,
      size: artifact.size,
    };
  }

  if (!platforms['win32-x64']) {
    throw new Error('handover manifest has no win32-x64 artifact — the automatic path needs one');
  }

  const manifest = {
    enabled,
    version,
    min_v1_version: minV1Version,
    platforms,
  };
  // Optional and additive: absent means the modal falls back to the platform
  // artifact URL, which for macOS would hand a user a raw DMG link.
  if (downloadPage) manifest.download_page = downloadPage;
  return manifest;
}

/** Every file under `dir`, recursively. */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

/** Reads the bundle directory into the descriptors both builders consume. */
function collectArtifacts({ artifactsDir, repo, tag }) {
  const files = walk(artifactsDir);
  const signatures = new Map();

  for (const file of files) {
    if (file.endsWith('.sig')) signatures.set(basename(file).slice(0, -'.sig'.length), file);
  }

  const artifacts = [];
  for (const file of files) {
    const fileName = basename(file);
    const classified = classifyArtifact(fileName);
    if (!classified) continue;

    const bytes = readFileSync(file);
    const signaturePath = signatures.get(fileName);

    artifacts.push({
      ...classified,
      fileName,
      url: assetUrl(repo, tag, fileName),
      size: statSync(file).size,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      signature: signaturePath ? readFileSync(signaturePath, 'utf8').trim() : null,
    });
  }

  if (artifacts.length === 0) {
    throw new Error(`no recognisable bundles under ${artifactsDir}`);
  }
  return artifacts;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) args[key] = true;
    else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

/**
 * Fixture round-trip over the pure builders. This is the only automated check
 * these two shapes get — nothing else in CI reads a manifest, and the readers
 * that do live in another app (v1) and another language (the Rust plugin).
 */
function selfTest() {
  const repo = 'Shironex/shiranami';
  const tag = 'v2.0.0';
  const artifacts = [
    {
      ...classifyArtifact('Shiranami_2.0.0_x64-setup.exe'),
      fileName: 'Shiranami_2.0.0_x64-setup.exe',
      url: assetUrl(repo, tag, 'Shiranami_2.0.0_x64-setup.exe'),
      size: 11_000_000,
      sha256: 'a'.repeat(64),
      signature: 'dW50cnVzdGVkIGNvbW1lbnQ6IHNpZw==',
    },
    {
      ...classifyArtifact('Shiranami_2.0.0_aarch64.dmg'),
      fileName: 'Shiranami_2.0.0_aarch64.dmg',
      url: assetUrl(repo, tag, 'Shiranami_2.0.0_aarch64.dmg'),
      size: 22_000_000,
      sha256: 'b'.repeat(64),
      signature: null,
    },
    {
      ...classifyArtifact('Shiranami.app.tar.gz'),
      fileName: 'Shiranami.app.tar.gz',
      url: assetUrl(repo, tag, 'Shiranami.app.tar.gz'),
      size: 21_000_000,
      sha256: 'c'.repeat(64),
      signature: 'dW50cnVzdGVkIGNvbW1lbnQ6IG1hYw==',
    },
  ];

  const assert = (condition, message) => {
    if (!condition) throw new Error(`self-test: ${message}`);
  };

  const latest = buildLatestJson({
    version: '2.0.0',
    pubDate: '2026-08-02T00:00:00Z',
    notes: 'notes',
    signed: artifacts,
  });
  assert(
    Object.keys(latest.platforms).join() === 'windows-x86_64',
    `latest.json must carry only windows-x86_64, got ${Object.keys(latest.platforms).join()}`
  );
  assert(latest.platforms['windows-x86_64'].signature.length > 0, 'signature must be carried');
  assert(
    latest.platforms['windows-x86_64'].url.endsWith('Shiranami_2.0.0_x64-setup.exe'),
    'updater url must point at the installer'
  );

  const handover = buildHandoverManifest({
    version: '2.0.0',
    minV1Version: '1.0.1',
    downloadPage: 'https://shiranami.app/download',
    enabled: false,
    artifacts,
  });
  assert(handover.enabled === false, 'a generated manifest is dormant');
  assert(
    Object.keys(handover.platforms).sort().join() === 'darwin-arm64,win32-x64',
    `handover keys wrong: ${Object.keys(handover.platforms).sort().join()}`
  );
  assert(handover.platforms['win32-x64'].size === 11_000_000, 'size must be carried');
  assert(handover.min_v1_version === '1.0.1', 'min_v1_version must be carried');
  assert(handover.download_page === 'https://shiranami.app/download', 'download_page must survive');

  // The guards have to be able to fail, or they are decoration (R17's lesson).
  const mustThrow = (fn, label) => {
    try {
      fn();
    } catch {
      return;
    }
    throw new Error(`self-test: ${label} did not reject`);
  };

  mustThrow(
    () =>
      buildLatestJson({
        version: '2.0.0',
        pubDate: '',
        notes: '',
        signed: [{ ...artifacts[0], signature: null }],
      }),
    'an unsigned Windows installer'
  );
  mustThrow(
    () =>
      buildHandoverManifest({
        version: '2.0.0',
        minV1Version: '1.0.1',
        enabled: false,
        artifacts: [{ ...artifacts[0], fileName: 'Shiranami 2.0.0 setup.exe' }],
      }),
    'an installer name the bridge would refuse'
  );
  mustThrow(
    () =>
      buildHandoverManifest({
        version: '2.0.0',
        minV1Version: '1.0.1',
        enabled: false,
        artifacts: [artifacts[1]],
      }),
    'a manifest with no Windows artifact'
  );
  mustThrow(
    () =>
      buildHandoverManifest({
        version: 'two point oh',
        minV1Version: '1.0.1',
        enabled: false,
        artifacts,
      }),
    'a non-numeric version'
  );

  console.log('build-update-manifests self-test: OK');
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args['self-test']) {
    selfTest();
    return;
  }

  const required = ['artifacts', 'out', 'version', 'tag', 'repo', 'min-v1'];
  const missing = required.filter(key => typeof args[key] !== 'string');
  if (missing.length > 0) {
    console.error(`Missing required arguments: ${missing.map(k => `--${k}`).join(', ')}`);
    process.exit(1);
  }

  const artifacts = collectArtifacts({
    artifactsDir: resolve(args.artifacts),
    repo: args.repo,
    tag: args.tag,
  });

  const notes = args['notes-file'] ? readFileSync(resolve(args['notes-file']), 'utf8').trim() : '';

  const latest = buildLatestJson({
    version: args.version,
    pubDate: args['pub-date'] || new Date().toISOString(),
    notes,
    signed: artifacts,
  });

  const handover = buildHandoverManifest({
    version: args.version,
    minV1Version: args['min-v1'],
    downloadPage: args['download-page'] || undefined,
    enabled: args.enabled === true || args.enabled === 'true',
    artifacts,
  });

  const outDir = resolve(args.out);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'latest.json'), `${JSON.stringify(latest, null, 2)}\n`);
  writeFileSync(join(outDir, 'v2.json'), `${JSON.stringify(handover, null, 2)}\n`);

  console.log(`latest.json  platforms: ${Object.keys(latest.platforms).join(', ')}`);
  console.log(`v2.json      platforms: ${Object.keys(handover.platforms).join(', ')}`);
  console.log(`v2.json      enabled: ${handover.enabled}`);
}

main();
