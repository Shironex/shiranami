import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '@/stores/useUIStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { useAccentStore } from '@/stores/useAccentStore';
import { customBackgroundKeys } from '@/hooks/queries/useCustomBackground';
import type { CustomBackground } from '@shiranami/contracts/bindings';

import AppearanceSection from './AppearanceSection';

vi.mock('@/lib/bridge/stream-urls', () => ({
  toBackgroundUrl: (fileName: string) => `http://127.0.0.1:1234/tok/background/${fileName}`,
}));

const IMPORTED: CustomBackground = {
  fileName: 'bg-abc.png',
  stillFileName: null,
  width: 1920,
  height: 1080,
  animated: false,
};

function renderSection(record: CustomBackground | null = null): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(customBackgroundKeys.current, record);
  const ui: ReactElement = (
    <QueryClientProvider client={client}>
      <AppearanceSection />
    </QueryClientProvider>
  );
  render(ui);
}

function reset(): void {
  useUIStore.setState({ uiScale: 100 });
  useThemeStore.setState({ theme: 'none' });
  useAccentStore.setState({ accentColor: null });
  vi.clearAllMocks();
}

beforeEach(reset);
afterEach(reset);

describe('AppearanceSection', () => {
  it('renders the language, theme, and accent cards', () => {
    renderSection();

    expect(screen.getByRole('heading', { name: 'Language & scale' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Theme' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Accent color' })).toBeInTheDocument();
  });

  it('sets the interface scale when a preset chip is clicked', async () => {
    const user = userEvent.setup();
    const setUiScale = vi.fn();
    useUIStore.setState({ setUiScale });
    renderSection();

    await user.click(screen.getByRole('button', { name: '120%' }));

    expect(setUiScale).toHaveBeenCalledWith(120);
  });

  it('offers the picker only once the custom theme is selected', () => {
    renderSection();
    expect(screen.queryByRole('button', { name: /Choose an image/ })).not.toBeInTheDocument();
  });

  it('offers the picker when the custom theme is selected', () => {
    useThemeStore.setState({ theme: 'custom' });

    renderSection();

    expect(screen.getByRole('button', { name: /Choose an image/ })).toBeInTheDocument();
  });

  it('offers replace and remove once an image is imported', () => {
    useThemeStore.setState({ theme: 'custom' });

    renderSection(IMPORTED);

    expect(screen.getByRole('button', { name: /Replace image/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remove/ })).toBeInTheDocument();
  });

  it('offers the fit toggle only for an imported image', () => {
    // The five bundled photos are composed for `cover`; offering to letterbox
    // one would be offering a worse version of a deliberate crop.
    useThemeStore.setState({ theme: 'lofi-night' });

    renderSection();

    expect(screen.queryByRole('radiogroup', { name: 'Fit' })).not.toBeInTheDocument();
  });

  it('offers the fit toggle for an imported image', () => {
    useThemeStore.setState({ theme: 'custom' });

    renderSection(IMPORTED);

    expect(screen.getByRole('radiogroup', { name: 'Fit' })).toBeInTheDocument();
  });
});
