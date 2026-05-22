import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import App from './App';
import ErrorBoundary from '@/components/shared/ErrorBoundary';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { initSentryRenderer } from '@/lib/sentry';
import './styles/globals.css';
import '@/lib/i18n';

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
