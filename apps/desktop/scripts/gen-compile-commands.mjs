/**
 * Generate compile_commands.json for the native addon so the editor's C/C++
 * language server (clangd — used by VS Code and Cursor) can resolve napi.h, the
 * Node headers, and our own src/native includes. Without it clangd reports
 * "'napi.h' file not found" etc., even though the real build is fine.
 *
 * This is an EDITOR aid only. The actual build uses node-gyp (binding.gyp) and
 * never reads this file. It's machine-specific (it points at THIS machine's
 * node-addon-api install and node-gyp header cache) and git-ignored. Re-run
 * `pnpm native:ide` after changing include dirs, the Node version, or sources.
 *
 * Sources, local include dirs, and defines are read straight from binding.gyp
 * (which is plain JSON), so this stays in sync as the addon grows.
 */

import { createRequire } from 'module';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import os from 'os';
import path from 'path';

const root = process.cwd(); // apps/desktop
const require = createRequire(import.meta.url);

// 1. node-addon-api include dir (where napi.h / napi-inl.h live).
const napiInclude = path.resolve(root, require('node-addon-api').include_dir);

// 2. Node C headers (node_api.h, js_native_api.h) from the node-gyp cache.
function nodeGypCacheBase() {
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library/Caches/node-gyp');
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData/Local');
    return path.join(localAppData, 'node-gyp', 'Cache');
  }
  return path.join(os.homedir(), '.cache/node-gyp');
}

function nodeHeadersDir() {
  const base = nodeGypCacheBase();
  const preferred = path.join(base, process.versions.node, 'include/node');
  if (existsSync(path.join(preferred, 'node_api.h'))) return preferred;
  // Fallback: the newest cached version that actually has the headers.
  if (existsSync(base)) {
    const candidates = readdirSync(base)
      .map(v => path.join(base, v, 'include/node'))
      .filter(d => existsSync(path.join(d, 'node_api.h')))
      .sort();
    if (candidates.length) return candidates[candidates.length - 1];
  }
  console.warn('[native:ide] Node headers not found — run `pnpm native:build` first.');
  return preferred;
}
const nodeInclude = nodeHeadersDir();

// 3. Sources / local includes / defines straight from binding.gyp (plain JSON).
const gyp = JSON.parse(readFileSync(path.join(root, 'binding.gyp'), 'utf-8'));
const target = gyp.targets[0];
const localIncludes = (target.include_dirs ?? [])
  .filter(d => !d.includes('<!@')) // drop the node-addon-api gyp macro
  .map(d => path.resolve(root, d));
const defineFlags = (target.defines ?? []).map(d => `-D${d}`);
const includeFlags = [napiInclude, nodeInclude, ...localIncludes].map(i => `-I${i}`);

const SRC_EXT = new Set(['.cpp', '.cc', '.cxx', '.mm', '.c']);
const db = target.sources
  .filter(s => SRC_EXT.has(path.extname(s)))
  .map(s => {
    const file = path.resolve(root, s);
    return {
      directory: root,
      file,
      arguments: [
        'clang++',
        '-std=c++17',
        '-x',
        'c++',
        ...defineFlags,
        ...includeFlags,
        '-c',
        file,
      ],
    };
  });

const outPath = path.join(root, 'compile_commands.json');
writeFileSync(outPath, JSON.stringify(db, null, 2) + '\n');

console.log(`[native:ide] Wrote compile_commands.json (${db.length} entries)`);
console.log(`[native:ide]   napi: ${napiInclude}`);
console.log(`[native:ide]   node: ${nodeInclude}`);
console.log('[native:ide] Restart clangd / reload the editor window to pick it up.');
