// design-sync preview provider chain. The converter can't bundle .storybook/
// preview.tsx (it imports globals.css -> `@import 'tailwindcss'`, which esbuild
// can't resolve), so this reproduces the essential context the decorators gave
// previews: a browser-safe window.electronAPI mock + eager i18n init at module
// scope, then QueryClient + I18next providers via DsPreviewRoot (cfg.provider).
import { useState } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  SHARE_ERROR_CODES,
  PLAYLIST_ERROR_CODES,
  VALIDATION_ERROR_CODES,
} from '@shiranami/contracts';
import i18n, { initI18n } from '@/lib/i18n';
import type { ElectronAPI } from '@/types/electron';

// Recursive Proxy mock: components gate IPC on IS_ELECTRON (= !!window.electronAPI),
// so every nested method access must answer without throwing. Mirrors the mock in
// .storybook/preview.tsx.
function createElectronAPIMock(): ElectronAPI {
  const noopUnsub = () => {};
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_t, prop) {
      if (prop === 'errors') {
        return {
          isIpcError: (e: unknown): e is { code: string; message: string; details?: unknown } =>
            typeof e === 'object' &&
            e !== null &&
            'code' in e &&
            typeof (e as Record<string, unknown>).code === 'string',
          SHARE_ERROR_CODES,
          PLAYLIST_ERROR_CODES,
          VALIDATION_ERROR_CODES,
        };
      }
      if (prop === 'platform') return 'darwin';
      if (prop === '__e2e') return false;
      if (typeof prop === 'symbol') return undefined;
      return new Proxy(function mock() {} as never, {
        get: handler.get!,
        apply(_fn, _thisArg, args) {
          if (typeof prop === 'string' && prop.startsWith('on') && typeof args[0] === 'function') {
            return noopUnsub;
          }
          return Promise.resolve(undefined);
        },
      });
    },
  };
  return new Proxy({}, handler) as unknown as ElectronAPI;
}

if (typeof window !== 'undefined' && !window.electronAPI) {
  window.electronAPI = createElectronAPIMock();
}

// Boot i18n once (English ships eagerly) so t() keys resolve from the first frame.
void initI18n();

export function DsPreviewRoot({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
  );
  // Shiranami is dark-only: components are translucent surfaces designed to sit
  // on the app's dark background. The emitted preview card forces body=#fff, so
  // wrap every preview in the themed app surface to match the storybook render.
  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <TooltipProvider delayDuration={300}>
          <div
            style={{
              background: 'var(--background)',
              color: 'var(--foreground)',
              minHeight: '100%',
              display: 'flow-root',
            }}
          >
            {children}
          </div>
        </TooltipProvider>
      </I18nextProvider>
    </QueryClientProvider>
  );
}
