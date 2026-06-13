/**
 * Format (or --check) the hand-written native addon sources with clang-format.
 *
 * clang-format ≈ Prettier for C++. Style lives in src/native/.clang-format.
 * Vendored code under vendor/ is excluded (it has its own DisableFormat config).
 *
 * The binary is OPTIONAL: editors with the clangd extension already format-on-
 * save from .clang-format. This script is for the CLI / a pre-commit pass.
 * Install it with `brew install clang-format`. If it's missing the script skips
 * with a hint instead of failing your build.
 *
 *   pnpm native:format         format in place
 *   pnpm native:format:check   verify only (exit 1 if anything would change)
 */

import { execFileSync } from 'child_process';
import { readdirSync } from 'fs';
import path from 'path';

const root = process.cwd(); // apps/desktop
const nativeDir = path.join(root, 'src/native');
const check = process.argv.includes('--check');

// clang-format isn't on PATH from Xcode's clang; look in the usual Homebrew spots too.
function resolveClangFormat() {
  const candidates = [
    'clang-format',
    '/opt/homebrew/bin/clang-format',
    '/opt/homebrew/opt/llvm/bin/clang-format',
    '/usr/local/bin/clang-format',
    '/usr/local/opt/llvm/bin/clang-format',
  ];
  for (const c of candidates) {
    try {
      execFileSync(c, ['--version'], { stdio: 'ignore' });
      return c;
    } catch {
      /* try next */
    }
  }
  return null;
}

const SRC_EXT = new Set(['.cpp', '.cc', '.cxx', '.hpp', '.h', '.hh']);

function collect(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'vendor') continue; // third-party — never reformat
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collect(full));
    else if (SRC_EXT.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

const clangFormat = resolveClangFormat();
if (!clangFormat) {
  console.warn('[native:format] clang-format not found — skipping (this is fine).');
  console.warn('[native:format] CLI formatting needs:  brew install clang-format');
  console.warn('[native:format] Editors with the clangd extension still format-on-save.');
  process.exit(0);
}

const files = collect(nativeDir);
const args = check ? ['--dry-run', '-Werror', ...files] : ['-i', ...files];

try {
  execFileSync(clangFormat, args, { stdio: 'inherit' });
  console.log(`[native:format] ${check ? 'checked' : 'formatted'} ${files.length} file(s).`);
} catch (err) {
  if (check) {
    console.error('[native:format] Formatting issues found — run `pnpm native:format` to fix.');
    process.exit(1);
  }
  throw err;
}
