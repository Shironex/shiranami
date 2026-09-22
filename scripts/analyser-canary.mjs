#!/usr/bin/env node
/**
 * The analyser-energy regression test (docs/v2/architecture.md §8, risk R2).
 *
 * Spike A proved that a media element pointed at a cross-origin response with no
 * `Access-Control-Allow-Origin` keeps playing while the audio graph built from it
 * emits digital silence (docs/v2/spike-a-results.md §2). There is no error event,
 * no failed request and no log line — the symptom is "the visualiser looks
 * broken", reported by a user weeks later. This is the only automated detector of
 * that failure.
 *
 * It drives a real browser engine against the real `shiranami-serve` router. The
 * Rust half — `cargo run -p shiranami-serve --example analyser_canary` — boots
 * that router twice over one `ServeState`: once intact, and once wrapped in a
 * layer that deletes the CORS header on the way out. This script plays a
 * synthesized 440 Hz tone through `createMediaElementSource` → `AnalyserNode` on
 * both and asserts the difference.
 *
 * Three cases, all three load-bearing:
 *
 *   1. guarded + crossOrigin=anonymous — the app's real configuration. Must
 *      produce energy: RMS at the theoretical level and an FFT peak on the tone.
 *      Deleting the CORS layer from `cors.rs` fails here.
 *   2. stripped + crossOrigin=anonymous — Spike A shape 2a. The load must fail
 *      outright, which is why the decks keep the attribute: it converts a header
 *      regression into a loud error.
 *   3. stripped, no crossOrigin — Spike A shape 2b, the silent trap. Must play
 *      and be silent. This is the anti-vacuity control: if the probe ever stops
 *      being able to tell energy from silence, case 3 starts passing case 1's
 *      assertions and the run fails.
 *
 * A canary that cannot die is not a canary — the same discipline D7 applies to
 * the contract-drift guard's `--prove` mode (R17).
 *
 * Usage:
 *
 *   pnpm canary:analyser                       # chromium + webkit
 *   CANARY_ENGINES=webkit pnpm canary:analyser
 *   CANARY_HARNESS_BIN=target/debug/examples/analyser_canary pnpm canary:analyser
 *
 * Requires a Playwright browser download (`pnpm exec playwright install
 * chromium webkit`) but no display: both engines run headless.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createInterface } from 'node:readline';

// Same indirection as scripts/screenshot-app.mjs: playwright is a root
// devDependency, but a caller running this from elsewhere can point at its own.
const PW = process.env.PLAYWRIGHT_PATH ?? 'playwright';
const playwright = await import(PW);

/** Engines to drive. Chromium stands in for WebView2, WebKit for WKWebView. */
const ENGINES = (process.env.CANARY_ENGINES ?? 'chromium,webkit')
  .split(',')
  .map(name => name.trim())
  .filter(Boolean);

/** A prebuilt harness binary, or cargo builds and runs it. */
const HARNESS_BIN = process.env.CANARY_HARNESS_BIN ?? null;

/** How long to sample the analyser per case, in ms. */
const SAMPLE_MS = Number(process.env.CANARY_SAMPLE_MS ?? 2500);

/**
 * FFT size. Larger than the app's 256 so the tone lands in a bin narrow enough
 * to assert on: at 2048 the bins are ~21 Hz wide, so "the peak is at 440" is a
 * real claim rather than a restatement of "something is happening below 1 kHz".
 */
const FFT_SIZE = 2048;

/**
 * RMS floor for the passing case. The theoretical figure for the 0.5-amplitude
 * sine the harness generates is 0.354, and Spike A measured exactly that. The
 * floor sits well below it because the element is still buffering for part of
 * the sampling window, and well above the noise floor of a tainted graph, which
 * is exactly zero.
 */
const RMS_FLOOR = 0.15;

/** How close the FFT peak must sit to the tone, in bins. */
const PEAK_TOLERANCE_BINS = 2;

/** RMS ceiling for the silent cases. A tainted graph reads exactly 0. */
const SILENCE_CEILING = 0.005;

/**
 * Runs in the page. Plays `url` through the same graph shape
 * `apps/web/src/lib/audioAnalyser.ts` builds — element → MediaElementSource →
 * AnalyserNode → destination — and reports what the analyser saw.
 */
async function probe({ url, anonymous, sampleMs, fftSize }) {
  const AudioCtx = window.AudioContext ?? window.webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    await ctx.resume();
  } catch {
    /* a suspended context still reports its state below */
  }

  const el = new Audio();
  el.preload = 'auto';
  el.loop = true;
  if (anonymous) {
    el.crossOrigin = 'anonymous';
  }

  let mediaError = null;
  el.addEventListener('error', () => {
    mediaError = el.error ? el.error.code : -1;
  });

  el.src = url;

  const source = ctx.createMediaElementSource(el);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = fftSize;
  analyser.smoothingTimeConstant = 0;
  source.connect(analyser);
  analyser.connect(ctx.destination);

  let playRejected = null;
  try {
    await el.play();
  } catch (error) {
    playRejected = String(error?.name ?? error);
  }

  const time = new Float32Array(analyser.fftSize);
  const freq = new Float32Array(analyser.frequencyBinCount);
  const bytes = new Uint8Array(analyser.frequencyBinCount);

  let rms = 0;
  let peakDb = -Infinity;
  let peakBin = -1;
  let byteSum = 0;

  const deadline = Date.now() + sampleMs;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 16));

    analyser.getFloatTimeDomainData(time);
    let sum = 0;
    for (const sample of time) {
      sum += sample * sample;
    }
    rms = Math.max(rms, Math.sqrt(sum / time.length));

    analyser.getFloatFrequencyData(freq);
    for (let bin = 0; bin < freq.length; bin += 1) {
      if (freq[bin] > peakDb) {
        peakDb = freq[bin];
        peakBin = bin;
      }
    }

    analyser.getByteFrequencyData(bytes);
    let frameSum = 0;
    for (const value of bytes) {
      frameSum += value;
    }
    byteSum = Math.max(byteSum, frameSum);
  }

  const result = {
    rms,
    peakBin,
    peakDb,
    peakHz: peakBin < 0 ? 0 : (peakBin * ctx.sampleRate) / fftSize,
    binWidthHz: ctx.sampleRate / fftSize,
    byteSum,
    currentTime: el.currentTime,
    readyState: el.readyState,
    mediaError,
    playRejected,
    contextState: ctx.state,
    sampleRate: ctx.sampleRate,
  };

  el.pause();
  await ctx.close();
  return result;
}

/** Start the Rust harness and read its handshake line. */
async function startHarness() {
  const [command, args] = HARNESS_BIN
    ? [HARNESS_BIN, []]
    : ['cargo', ['run', '-q', '-p', 'shiranami-serve', '--example', 'analyser_canary']];

  const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'inherit'] });
  const lines = createInterface({ input: child.stdout });

  const handshake = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('the harness printed no handshake within 180s')),
      180_000
    );
    lines.once('line', line => {
      clearTimeout(timer);
      resolve(JSON.parse(line));
    });
    child.once('exit', code => {
      clearTimeout(timer);
      reject(new Error(`the harness exited with code ${String(code)} before serving`));
    });
  });

  return {
    handshake,
    // The harness serves until its stdin closes; killing it too is belt and
    // braces for the case where cargo, not the example, is our direct child.
    stop() {
      child.stdin.end();
      child.kill();
    },
  };
}

/** A page origin distinct from the audio origin, so the requests are cross-origin. */
async function startPageServer() {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    // The button is the gesture target: some engines gate `play()` and
    // `AudioContext.resume()` on a user activation, and a zero-height <body>
    // is not something Playwright will click.
    response.end(
      '<!doctype html><meta charset="utf-8"><title>analyser canary</title>' +
        '<body><button id="gesture" style="width:200px;height:80px">start</button>'
    );
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    origin: `http://127.0.0.1:${String(server.address().port)}/`,
    stop: () => new Promise(resolve => server.close(resolve)),
  };
}

/** Assert one case, collecting failures rather than throwing on the first. */
function check(failures, engine, label, condition, message) {
  if (!condition) {
    failures.push(`[${engine}] ${label}: ${message}`);
  }
}

function evaluateEngine(engine, handshake, results, failures) {
  const { guarded, strippedAnonymous, strippedPlain } = results;
  const tolerance = PEAK_TOLERANCE_BINS * guarded.binWidthHz;

  // Case 1 — the app's real configuration must produce energy.
  check(
    failures,
    engine,
    'guarded+anonymous',
    guarded.mediaError === null,
    `the element errored (MediaError code ${String(guarded.mediaError)}) against a CORS-correct route`
  );
  check(
    failures,
    engine,
    'guarded+anonymous',
    guarded.currentTime > 0,
    'currentTime never advanced — the fixture did not play at all'
  );
  check(
    failures,
    engine,
    'guarded+anonymous',
    guarded.rms >= RMS_FLOOR,
    `RMS ${guarded.rms.toFixed(4)} is below the ${String(RMS_FLOOR)} floor. This is the silent-on-CORS failure: the element plays but the analyser reads nothing.`
  );
  check(
    failures,
    engine,
    'guarded+anonymous',
    guarded.byteSum > 0,
    'sum(getByteFrequencyData()) is 0 — the §8 energy assertion, failing'
  );
  check(
    failures,
    engine,
    'guarded+anonymous',
    Math.abs(guarded.peakHz - handshake.toneHz) <= tolerance,
    `FFT peak at ${guarded.peakHz.toFixed(1)} Hz is more than ${tolerance.toFixed(1)} Hz from the ${String(handshake.toneHz)} Hz tone`
  );

  // Case 2 — Spike A shape 2a. crossOrigin=anonymous turns a missing header into
  // a loud failure, which is the whole reason the decks set the attribute.
  check(
    failures,
    engine,
    'stripped+anonymous',
    strippedAnonymous.mediaError !== null || strippedAnonymous.playRejected !== null,
    'a route with no Access-Control-Allow-Origin loaded cleanly in anonymous mode. The engine stopped enforcing CORS on media, so the attribute no longer converts a header regression into an error.'
  );
  check(
    failures,
    engine,
    'stripped+anonymous',
    strippedAnonymous.rms < SILENCE_CEILING,
    `RMS ${strippedAnonymous.rms.toFixed(4)} — a CORS-refused load produced audio`
  );

  // Case 3 — Spike A shape 2b, the silent trap, and this suite's anti-vacuity
  // control. It must play and it must be silent.
  check(
    failures,
    engine,
    'stripped+plain',
    strippedPlain.rms < SILENCE_CEILING && strippedPlain.byteSum === 0,
    `RMS ${strippedPlain.rms.toFixed(4)} / byteSum ${String(strippedPlain.byteSum)} — a tainted MediaElementSource produced energy, so the probe cannot tell silence from sound and case 1 proves nothing`
  );
  check(
    failures,
    engine,
    'stripped+plain',
    strippedPlain.currentTime > 0,
    'the silent-trap case never played, so this run did not exercise the failure it exists to detect. Spike A §2 records that a tainted element keeps playing; if that changed, re-derive the control.'
  );
}

function formatCase(label, result) {
  const parts = [
    `rms=${result.rms.toFixed(4)}`,
    `peak=${result.peakHz.toFixed(1)}Hz`,
    `byteSum=${String(result.byteSum)}`,
    `t=${result.currentTime.toFixed(2)}s`,
    `ctx=${result.contextState}@${String(result.sampleRate)}`,
  ];
  if (result.mediaError !== null) {
    parts.push(`mediaError=${String(result.mediaError)}`);
  }
  if (result.playRejected !== null) {
    parts.push(`playRejected=${result.playRejected}`);
  }
  return `    ${label.padEnd(19)} ${parts.join('  ')}`;
}

async function runEngine(engine, handshake, pageOrigin) {
  const launcher = playwright[engine];
  if (!launcher) {
    throw new Error(`unknown engine "${engine}"`);
  }

  const browser = await launcher.launch({
    args: engine === 'chromium' ? ['--autoplay-policy=no-user-gesture-required'] : [],
  });

  try {
    const page = await browser.newPage();
    await page.goto(pageOrigin);
    // A real user gesture, so no engine's autoplay policy is what we measure.
    await page.click('#gesture');

    const shared = { sampleMs: SAMPLE_MS, fftSize: FFT_SIZE };
    return {
      guarded: await page.evaluate(probe, {
        ...shared,
        url: handshake.guardedAudioUrl,
        anonymous: true,
      }),
      strippedAnonymous: await page.evaluate(probe, {
        ...shared,
        url: handshake.strippedAudioUrl,
        anonymous: true,
      }),
      strippedPlain: await page.evaluate(probe, {
        ...shared,
        url: handshake.strippedAudioUrl,
        anonymous: false,
      }),
    };
  } finally {
    await browser.close();
  }
}

const harness = await startHarness();
const pageServer = await startPageServer();
const failures = [];

try {
  console.log(
    `analyser canary — tone ${String(harness.handshake.toneHz)} Hz, engines: ${ENGINES.join(', ')}`
  );

  for (const engine of ENGINES) {
    const results = await runEngine(engine, harness.handshake, pageServer.origin);
    console.log(`  ${engine}`);
    console.log(formatCase('guarded+anonymous', results.guarded));
    console.log(formatCase('stripped+anonymous', results.strippedAnonymous));
    console.log(formatCase('stripped+plain', results.strippedPlain));
    evaluateEngine(engine, harness.handshake, results, failures);
  }
} finally {
  await pageServer.stop();
  harness.stop();
}

if (failures.length > 0) {
  console.error(`\nanalyser canary FAILED (${String(failures.length)}):`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log('\nanalyser canary passed: energy with the CORS header, silence without it.');
