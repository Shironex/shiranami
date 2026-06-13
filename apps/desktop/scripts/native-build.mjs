/**
 * Build the native `waveform` addon (audio peak extraction for the seekbar).
 *
 * Pure C++ + the header-only dr_libs decoder — no platform APIs — so it builds
 * identically on every OS. The compiled binary lands at
 * build/Release/waveform.node and is loaded by src/main/waveform/.
 *
 * Because it's a pure N-API addon (NAPI_VERSION=8), the binary is ABI-stable:
 * built once against the local Node, it loads unchanged in Electron's runtime.
 *
 * Runs as a `predev` / `prebuild` hook, so it must be CHEAP when nothing
 * changed: we stat the compiled binary against every native source and skip the
 * (slow, full) `node-gyp rebuild` when the binary is already up to date.
 */

import { execFileSync } from 'child_process';
import { existsSync, statSync, readdirSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';

// Resolve node-gyp's own entry script instead of relying on it being on PATH.
// node-gyp is a transitive dep that isn't shimmed into every package's
// node_modules/.bin, so `node-gyp rebuild` fails under a bare `node` invocation.
// Running `node <node-gyp.js> rebuild` works regardless of PATH or launcher.
const require = createRequire(import.meta.url);
const nodeGypBin = require.resolve('node-gyp/bin/node-gyp.js');

const root = process.cwd();
const outFile = path.join(root, 'build', 'Release', 'shiranami_native.node');
const nativeDir = path.join(root, 'src', 'native');

/** Newest mtime across binding.gyp + every file under src/native. */
function newestSourceMtime() {
  const files = [path.join(root, 'binding.gyp')];
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(full);
    }
  };
  if (existsSync(nativeDir)) walk(nativeDir);
  return Math.max(...files.filter(existsSync).map(f => statSync(f).mtimeMs));
}

if (existsSync(outFile) && statSync(outFile).mtimeMs >= newestSourceMtime()) {
  // Already up to date — skip the recompile so `pnpm dev` starts instantly.
  process.exit(0);
}

try {
  // `rebuild` = clean + configure + build. node-gyp finds binding.gyp in cwd.
  execFileSync(process.execPath, [nodeGypBin, 'rebuild'], {
    stdio: 'inherit',
    cwd: root,
  });
} catch (error) {
  console.error('Native waveform addon build failed:', error.message);
  process.exit(1);
}
