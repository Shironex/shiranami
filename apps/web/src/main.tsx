// MUST stay the first import. Installs `window.electronAPI` over the Tauri
// bindings, and does nothing at all outside the Tauri webview. `@/lib/platform`
// freezes IS_ELECTRON at module scope and is reached through this file's own
// import graph (queryClient -> sentry -> i18n), so a statement in the body below
// would run after that constant had already been decided.
import '@/lib/bridge/install';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import App from './App';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { initSentryRenderer, captureException } from '@/lib/sentry';
import { logger } from '@/lib/logger';
import './styles/globals.css';
import { initI18n } from '@/lib/i18n';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Failed to find root element');
}

// Bring the e2e store registry online only when launched under SHIRANAMI_E2E=1.
// The preload exposes the flag synchronously so the chunk loads in parallel
// with the React bootstrap and is in place before any spec calls into it.
if (window.electronAPI?.__e2e) {
  void import('./e2e-bridge');
}

// Initialize crash/error reporting. No-op unless the user opted in and this is
// a packaged/production Electron build; events route to the main transport.
void initSentryRenderer();

// Global safety net for async failures that never reach React's render path —
// rejected IPC promises, event-handler errors, useEffect rejections. Without
// this they vanish (the ErrorBoundary only catches render-time errors): not
// logged, not reported. captureException is a no-op until Sentry is initialized.
window.addEventListener('unhandledrejection', event => {
  logger.error('[unhandledrejection]', event.reason);
  captureException(event.reason);
});
window.addEventListener('error', event => {
  const err = event.error ?? new Error(event.message);
  logger.error('[window.error]', err);
  captureException(err);
});

// English ships in the entry chunk; any other persisted locale is lazy. Await
// init so the initial language's namespaces are loaded before first paint —
// a Polish user never sees a flash of raw English keys.
void initI18n()
  .catch(err => logger.error('[i18n] init failed', err))
  .finally(() => {
    createRoot(rootElement).render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider delayDuration={300}>
            <ErrorBoundary root viewName="Root">
              <App />
            </ErrorBoundary>
            <Toaster />
          </TooltipProvider>
        </QueryClientProvider>
      </StrictMode>
    );
  });
