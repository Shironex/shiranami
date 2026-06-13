/**
 * Lint the hand-written native addon sources with clang-tidy.
 *
 * clang-tidy ≈ ESLint for C++. Checks live in src/native/.clang-tidy. It reads
 * compile_commands.json to know the include paths, so run `pnpm native:ide`
 * first. Vendored sources (vendor/) are skipped — we only lint our own code.
 *
 * The binary is OPTIONAL: the clangd editor extension already runs these checks
 * inline. This script is for a CLI / pre-commit pass. Install it with
 * `brew install llvm`. If it's missing the script skips with a hint.
 */

import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

const root = process.cwd(); // apps/desktop

function resolveClangTidy() {
  const candidates = [
    'clang-tidy',
    '/opt/homebrew/opt/llvm/bin/clang-tidy',
    '/opt/homebrew/bin/clang-tidy',
    '/usr/local/opt/llvm/bin/clang-tidy',
    '/usr/local/bin/clang-tidy',
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

const clangTidy = resolveClangTidy();
if (!clangTidy) {
  console.warn('[native:lint] clang-tidy not found — skipping (this is fine).');
  console.warn('[native:lint] CLI linting needs:  brew install llvm');
  console.warn('[native:lint] Editors with the clangd extension still lint inline.');
  process.exit(0);
}

if (!existsSync(path.join(root, 'compile_commands.json'))) {
  console.error('[native:lint] compile_commands.json missing — run `pnpm native:ide` first.');
  process.exit(1);
}

// Lint the sources from binding.gyp, minus the vendored translation unit
// (dr_libs_impl.cpp pulls in ~30k lines of third-party code we don't own).
const gyp = JSON.parse(readFileSync(path.join(root, 'binding.gyp'), 'utf-8'));
const files = gyp.targets[0].sources
  .filter(s => s.endsWith('.cpp') && !s.includes('/vendor/'))
  .map(s => path.resolve(root, s));

console.log(`[native:lint] clang-tidy on ${files.length} source(s)...`);
try {
  execFileSync(clangTidy, ['-p', root, ...files], { stdio: 'inherit' });
  console.log('[native:lint] clean.');
} catch {
  // clang-tidy exits non-zero when it emits diagnostics — surface, don't crash.
  console.error('[native:lint] clang-tidy reported issues (see above).');
  process.exit(1);
}
