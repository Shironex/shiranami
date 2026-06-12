// Build-time stub for Sentry's Session Replay + User Feedback packages.
//
// @sentry/browser's barrel statically re-exports a handful of names from
// @sentry-internal/replay, @sentry-internal/replay-canvas, and
// @sentry-internal/feedback. Those re-exports drag in rrweb, the replay-canvas
// recorder, a compression web worker, and the feedback widget (screenshot +
// modal) — ~420 KB raw / ~138 KB gzip combined — even though this app never
// enables Session Replay or User Feedback (see ./sentry.ts: only
// browserTracingIntegration is ever added). A namespace re-export defeats
// tree-shaking, so the bundler can't drop them on its own.
//
// vite.config.ts aliases those three packages to this file so every binding
// @sentry/browser pulls from them resolves to an inert no-op and the heavy code
// never enters the graph. If Session Replay or Feedback is ever adopted, remove
// the aliases (and this file) so the real packages are bundled again.

type NoopIntegration = { name: string; setupOnce: () => void };

function noopIntegration(name: string): NoopIntegration {
  return { name, setupOnce() {} };
}

// --- @sentry-internal/replay + @sentry-internal/replay-canvas ---
// Integration factories: a harmless no-op integration keeps any accidental call
// from crashing init, while the real recorder stays out of the bundle.
export function replayIntegration(): NoopIntegration {
  return noopIntegration('ReplayStub');
}

export function replayCanvasIntegration(): NoopIntegration {
  return noopIntegration('ReplayCanvasStub');
}

// Accessor: there is never a live replay instance in this build.
export function getReplay(): undefined {
  return undefined;
}

// --- @sentry-internal/feedback ---
// @sentry/browser's feedbackSync/feedbackAsync modules construct their
// integrations via buildFeedbackIntegration(...) at module load, so the stub
// must supply it (plus the modal/screenshot integrations it threads through).
// The resulting integration is never added by this app, so a no-op is correct.
export function buildFeedbackIntegration(): () => NoopIntegration {
  return () => noopIntegration('FeedbackStub');
}

export function feedbackScreenshotIntegration(): NoopIntegration {
  return noopIntegration('FeedbackScreenshotStub');
}

export function feedbackModalIntegration(): NoopIntegration {
  return noopIntegration('FeedbackModalStub');
}

export function getFeedback(): undefined {
  return undefined;
}

export function sendFeedback(): Promise<string> {
  return Promise.reject(
    new Error('[sentry] User Feedback is not bundled in this build (stubbed in vite.config.ts).')
  );
}
