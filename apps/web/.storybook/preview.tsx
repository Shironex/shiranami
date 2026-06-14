import { useState } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { withThemeByClassName } from '@storybook/addon-themes';
import type { Decorator, Preview } from '@storybook/react-vite';
import {
  SHARE_ERROR_CODES,
  PLAYLIST_ERROR_CODES,
  VALIDATION_ERROR_CODES,
} from '@shiranami/contracts';
import i18n, { initI18n } from '@/lib/i18n';
import type { ElectronAPI } from '@/types/electron';
import '@/styles/globals.css';

// ---------------------------------------------------------------------------
// Browser-safe window.electronAPI mock.
//
// Components gate IPC on IS_ELECTRON (= !!window.electronAPI), so stories must
// provide an object that answers every nested method without throwing. Rather
// than hand-maintain the full ElectronAPI tree (it grows constantly), a
// recursive Proxy returns a resolved-promise no-op for any method access and a
// new proxy for any namespace access. Subscription-style methods (onX) follow
// the preload contract of returning an unsubscribe function, so callers that do
// `const off = api.x.onY(cb); return off;` get a callable cleanup.
//
// The few synchronous members the renderer reads as data — errors.*, platform,
// __e2e — are layered on top so they hold real values instead of proxies.
// ---------------------------------------------------------------------------
function createElectronAPIMock(): ElectronAPI {
  const noopUnsub = () => {};

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
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

      // A namespace access (api.downloader) returns another proxy; a method
      // access resolves a no-op. We can't distinguish the two ahead of time, so
      // return a callable proxy: invoking it yields a resolved promise (and the
      // unsubscribe function for onX subscriptions), while property access keeps
      // drilling into nested namespaces.
      return new Proxy(function mock() {} as never, {
        get: handler.get!,
        apply(_fn, _thisArg, args) {
          // Subscription methods receive a callback and must return a cleanup fn.
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

// Boot i18n once for the whole Storybook session so stories resolve t() keys
// (English ships eagerly). Mirrors how main.tsx initializes the shared instance.
void initI18n();

// Each story render owns a fresh, throwaway QueryClient so cache and query state
// never leak between stories. Queries never retry and never hit a backend, so
// component stories render without the app's IPC-backed data layer.
function StoryProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    </QueryClientProvider>
  );
}

const withProviders: Decorator = Story => (
  <StoryProviders>
    <Story />
  </StoryProviders>
);

const preview: Preview = {
  decorators: [
    withProviders,
    withThemeByClassName({
      themes: { light: '', dark: 'dark' },
      defaultTheme: 'light',
    }),
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
