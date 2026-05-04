/**
 * Phase 0 spike harness — runs under Electron, forks the bundled spike utility
 * at `dist/main/scan-utility-spike.js`, hands it the project's `icon-256.png`
 * fixture, and prints PASS or FAIL based on whether `nativeImage` decoded +
 * resized + JPEG-encoded the buffer inside the utility process.
 *
 * Run with:
 *   pnpm --filter @shiranami/desktop exec node esbuild.config.mjs
 *   pnpm --filter @shiranami/desktop exec electron apps/desktop/scripts/spike-utility-process.cjs
 *
 * Exit codes:
 *   0 — spike succeeded, nativeImage works in utilityProcess. Phase 2 cleared.
 *   1 — spike failed. Do NOT autonomously add `sharp`; report to the user.
 *
 * Findings doc: docs/arch/2026-05-04-metadata-scan-utility-process-plan.md §3.4
 */

const { app, utilityProcess } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const SPIKE_PATH = path.join(__dirname, '..', 'dist', 'main', 'scan-utility-spike.js');
const FIXTURE_PATH = path.join(__dirname, '..', 'resources', 'icon-256.png');
const TIMEOUT_MS = 10_000;

function fail(reason) {
  console.error('\n[spike] FAIL:', reason);
  app.exit(1);
}

function pass(detail) {
  console.log('\n[spike] PASS:', detail);
  app.exit(0);
}

async function main() {
  if (!fs.existsSync(SPIKE_PATH)) {
    fail(`bundled spike not found at ${SPIKE_PATH} — run \`node apps/desktop/esbuild.config.mjs\` first`);
    return;
  }
  if (!fs.existsSync(FIXTURE_PATH)) {
    fail(`fixture image not found at ${FIXTURE_PATH}`);
    return;
  }

  const fixture = fs.readFileSync(FIXTURE_PATH);
  console.log(`[spike] fixture: ${FIXTURE_PATH} (${fixture.length} bytes)`);
  console.log(`[spike] forking utilityProcess: ${SPIKE_PATH}`);

  const child = utilityProcess.fork(SPIKE_PATH, [], {
    serviceName: 'shiranami-scan-utility-spike',
    stdio: 'inherit',
  });

  const timer = setTimeout(() => {
    fail(`timed out after ${TIMEOUT_MS}ms — utility never replied`);
    try { child.kill(); } catch { /* noop */ }
  }, TIMEOUT_MS);

  child.on('exit', (code) => {
    clearTimeout(timer);
    if (code !== 0 && code !== null) {
      fail(`utility exited with code ${code} before completing the spike`);
    }
  });

  child.on('message', (msg) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'spike-ready') {
      console.log('[spike] utility ready, posting fixture buffer');
      // Pass a Uint8Array — structured clone handles it natively, no per-byte
      // serialisation. The utility reconstructs a Buffer with `Buffer.from(input)`.
      const input = new Uint8Array(fixture.buffer, fixture.byteOffset, fixture.byteLength);
      child.postMessage({ type: 'spike', input });
      return;
    }
    if (msg.type === 'spike-result') {
      clearTimeout(timer);
      if (msg.ok) {
        pass(
          `nativeImage works in utilityProcess. ` +
          `Decoded ${msg.width}x${msg.height} → resized + JPEG q=85 = ${msg.outputSize} bytes`
        );
      } else {
        fail(`nativeImage failed inside utilityProcess: ${msg.error}`);
      }
      try { child.kill(); } catch { /* noop */ }
    }
  });
}

app.whenReady().then(main).catch((e) => {
  fail(`harness threw: ${e instanceof Error ? e.stack || e.message : String(e)}`);
});
