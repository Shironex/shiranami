import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/platform', () => ({ IS_ELECTRON: true }));

import { useSettingsQuery, useUpdateSettingsMutation } from './useSettings';

describe('useUpdateSettingsMutation', () => {
  it('refetches only after the last of several pending saves', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const releases: Array<() => void> = [];
    vi.mocked(window.electronAPI.store.set).mockImplementation(
      () => new Promise<void>(resolve => releases.push(resolve))
    );
    const get = vi.mocked(window.electronAPI.store.get);
    get.mockResolvedValue({});

    const { result } = renderHook(
      () => ({ query: useSettingsQuery(), save: useUpdateSettingsMutation() }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    const readsBefore = get.mock.calls.length;

    act(() => {
      result.current.save.mutate({ a: 1 });
      result.current.save.mutate({ b: 2 });
    });
    // Saves run one at a time: the second write starts only once the first lands.
    await waitFor(() => expect(releases).toHaveLength(1));
    await act(async () => {
      releases[0]();
    });
    await waitFor(() => expect(releases).toHaveLength(2));
    expect(get.mock.calls.length).toBe(readsBefore);

    await act(async () => {
      releases[1]();
    });
    await waitFor(() => expect(get.mock.calls.length).toBe(readsBefore + 1));
  });
});
