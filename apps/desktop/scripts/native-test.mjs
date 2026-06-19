/**
 * Run the native test suite — both layers, in order:
 *
 *   1. C++ unit tests (doctest) on the pure core/ algorithms. We build with
 *      `-Dbuild_native_tests=true`, which flips on the gated `shiranami_native_tests`
 *      executable target in binding.gyp (off by default so predev/prebuild stay
 *      fast). The same build also (re)builds the addon, since that target is
 *      unconditional. We then run the executable, pointing it at the fixtures
 *      directory via the SHIRANAMI_FIXTURE_DIR env var.
 *
 *   2. JS integration tests (vitest) that load the freshly-built .node and
 *      assert the N-API surface against the same fixtures.
 *
 * Any failure in either layer fails the whole script (non-zero exit).
 */

import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import path from 'path';

const require = createRequire(import.meta.url);
const nodeGypBin = require.resolve('node-gyp/bin/node-gyp.js');
// vitest's package `exports` doesn't expose ./vitest.mjs directly, but it does
// expose ./package.json, whose `bin` points at the CLI entry — resolve it from
// there so we can run it with the current node, no PATH/.bin shim needed.
const vitestBin = path.join(path.dirname(require.resolve('vitest/package.json')), 'vitest.mjs');

const root = process.cwd();
const fixtureDir = path.join(root, 'src', 'native', 'test', 'fixtures');
const exeName = process.platform === 'win32' ? 'shiranami_native_tests.exe' : 'shiranami_native_tests';
const testExe = path.join(root, 'build', 'Release', exeName);

function run(file, args, extraEnv = {}) {
  execFileSync(file, args, { stdio: 'inherit', cwd: root, env: { ...process.env, ...extraEnv } });
}

try {
  // 1. Build with the test target enabled. `rebuild` = clean + configure +
  //    build; the args after `--` are forwarded to gyp's configure step, where
  //    -D sets the `build_native_tests` gyp variable.
  console.log('[native:test] Building native tests (and addon)…');
  run(process.execPath, [nodeGypBin, 'rebuild', '--', '-Dbuild_native_tests=true']);

  // 2. Run the C++ unit tests.
  console.log('\n[native:test] Running C++ unit tests…');
  run(testExe, [], { SHIRANAMI_FIXTURE_DIR: fixtureDir });

  // 3. Run the JS addon integration tests against the built .node.
  console.log('\n[native:test] Running JS addon integration tests…');
  run(process.execPath, [
    vitestBin,
    'run',
    '--project',
    'desktop',
    'src/main/workers/native-addon.test.ts',
  ]);

  console.log('\n[native:test] All native tests passed.');
} catch (error) {
  console.error('\n[native:test] FAILED:', error.message);
  process.exit(1);
}
