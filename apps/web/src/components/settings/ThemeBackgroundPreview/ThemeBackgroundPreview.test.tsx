import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useThemeStore } from '@/stores/useThemeStore';
import { useThemeBgStore } from '@/stores/useThemeBgStore';
import { backgroundLibraryKeys, libraryOfRecord } from '@/hooks/queries/useBackgroundLibrary';
import type { CustomBackground } from '@shiranami/contracts/bindings';

import ThemeBackgroundPreview from './ThemeBackgroundPreview';

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

function renderPreview(record: CustomBackground | null = null): HTMLElement {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(backgroundLibraryKeys.library, libraryOfRecord(record));
  const ui: ReactElement = (
    <QueryClientProvider client={client}>
      <ThemeBackgroundPreview />
    </QueryClientProvider>
  );
  return render(ui).container;
}

function reset(): void {
  useThemeStore.setState({ theme: 'none' });
  useThemeBgStore.setState({ bgOpacity: 1, bgBlur: 0, bgDim: 0, bgFit: 'cover' });
}

beforeEach(reset);
afterEach(reset);

describe('ThemeBackgroundPreview', () => {
  it('renders nothing when no theme background is active', () => {
    expect(renderPreview()).toBeEmptyDOMElement();
  });

  it('renders the sample chrome once a theme is selected', () => {
    useThemeStore.setState({ theme: 'lofi-night' });
    renderPreview();

    expect(screen.getByText('Sample Track')).toBeInTheDocument();
    expect(screen.getByText('Now playing over your background')).toBeInTheDocument();
  });

  it('previews the imported image rather than a themes/custom.webp that does not exist', () => {
    useThemeStore.setState({ theme: 'custom' });

    const container = renderPreview(IMPORTED);

    expect(container.querySelector('.theme-bg-image')).toHaveStyle({
      backgroundImage: 'url(http://127.0.0.1:1234/tok/background/bg-abc.png)',
    });
  });

  it('renders nothing for the custom theme while no image is imported', () => {
    useThemeStore.setState({ theme: 'custom' });

    expect(renderPreview(null)).toBeEmptyDOMElement();
  });

  it('reflects the sliders and the fit mode, so the preview is honest', () => {
    // The implementation this feature is modelled on showed the raw image at
    // full opacity while the user dragged three sliders that changed nothing
    // they could see. This is the assertion that we do not.
    useThemeStore.setState({ theme: 'custom' });
    useThemeBgStore.setState({ bgOpacity: 0.4, bgBlur: 6, bgDim: 0.3, bgFit: 'contain' });

    const image = renderPreview(IMPORTED).querySelector('.theme-bg-image');

    expect(image).toHaveStyle({
      opacity: '0.4',
      filter: 'blur(6px)',
      backgroundSize: 'contain',
    });
  });
});
