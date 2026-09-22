import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { useAppVersionQuery } from './useApp';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useAppVersionQuery', () => {
  it('reports the version the shell answers with, not the web package fallback', async () => {
    vi.mocked(window.electronAPI.app.getVersion).mockResolvedValueOnce('2.0.0-rc.2');

    const { result } = renderHook(() => useAppVersionQuery(), { wrapper });

    await waitFor(() => expect(result.current.data).toBe('2.0.0-rc.2'));
    expect(window.electronAPI.app.getVersion).toHaveBeenCalled();
  });
});
