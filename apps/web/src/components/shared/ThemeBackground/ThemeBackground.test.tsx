import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useThemeStore } from '@/stores/useThemeStore';
import { useUIStore } from '@/stores/useUIStore';
import { backgroundLibraryKeys, libraryOfRecord } from '@/hooks/queries/useBackgroundLibrary';
import type { CustomBackground } from '@shiranami/contracts/bindings';

import ThemeBackground from './ThemeBackground';

// The loopback base is only set inside the webview, so the URL builder answers
// `null` under vitest. Stubbing it is what lets a test assert which of the two
// files — the animation or its still — the layer resolved to.
vi.mock('@/lib/bridge/stream-urls', () => ({
  toBackgroundUrl: (fileName: string) => `http://127.0.0.1:1234/tok/background/${fileName}`,
}));

const ANIMATED: CustomBackground = {
  fileName: 'bg-abc.gif',
  stillFileName: 'bg-abc.still.jpg',
  width: 1920,
  height: 1080,
  animated: true,
};

function renderWith(record: CustomBackground | null): HTMLElement {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(backgroundLibraryKeys.library, libraryOfRecord(record));
  const ui: ReactElement = (
    <QueryClientProvider client={client}>
      <ThemeBackground />
    </QueryClientProvider>
  );
  return render(ui).container;
}

afterEach(() => {
  useThemeStore.setState({ theme: 'none' });
  useUIStore.setState({ lowPerformanceMode: false });
});

describe('ThemeBackground', () => {
  it('renders nothing for the "none" theme', () => {
    useThemeStore.setState({ theme: 'none' });

    expect(renderWith(null)).toBeEmptyDOMElement();
  });

  it('paints the theme image + scrim for a non-"none" theme', () => {
    useThemeStore.setState({ theme: 'lofi-night' });

    const container = renderWith(null);

    const image = container.querySelector('.theme-bg-image');
    expect(image).not.toBeNull();
    expect(image).toHaveStyle({ backgroundImage: 'url(./themes/lofi-night.webp)' });
    expect(container.querySelector('.theme-bg-scrim')).not.toBeNull();
  });

  it('paints the imported image for the "custom" theme', () => {
    useThemeStore.setState({ theme: 'custom' });

    const container = renderWith(ANIMATED);

    expect(container.querySelector('.theme-bg-image')).toHaveStyle({
      backgroundImage: 'url(http://127.0.0.1:1234/tok/background/bg-abc.gif)',
    });
  });

  /**
   * I1 — a custom image can never render un-scrimmed. The scrim is the only
   * thing holding the contrast floor over a photo nobody vetted, and the whole
   * reason the freeze is a URL swap rather than a second render branch is that
   * a second branch is where a missing scrim would hide.
   */
  it('never renders the custom image without its scrim and dim layers', () => {
    useThemeStore.setState({ theme: 'custom' });

    for (const lowPerformanceMode of [false, true]) {
      useUIStore.setState({ lowPerformanceMode });
      const container = renderWith(ANIMATED);

      expect(container.querySelector('.theme-bg-image')).not.toBeNull();
      expect(container.querySelector('.theme-bg-scrim')).not.toBeNull();
    }
  });

  /**
   * I2 — an animated import freezes to its poster still under low-performance
   * mode. This is what keeps the promise in the component doc that the layer is
   * "a single static bitmap" honest for a GIF.
   */
  it('resolves an animated import to its still under low-performance mode', () => {
    useThemeStore.setState({ theme: 'custom' });
    useUIStore.setState({ lowPerformanceMode: true });

    const container = renderWith(ANIMATED);

    expect(container.querySelector('.theme-bg-image')).toHaveStyle({
      backgroundImage: 'url(http://127.0.0.1:1234/tok/background/bg-abc.still.jpg)',
    });
  });

  /** I2, the other input: the OS reduced-motion preference. */
  it('resolves an animated import to its still under prefers-reduced-motion', () => {
    useThemeStore.setState({ theme: 'custom' });
    vi.spyOn(window, 'matchMedia').mockImplementation(
      query =>
        ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
          onchange: null,
        }) as unknown as MediaQueryList
    );

    const container = renderWith(ANIMATED);

    expect(container.querySelector('.theme-bg-image')).toHaveStyle({
      backgroundImage: 'url(http://127.0.0.1:1234/tok/background/bg-abc.still.jpg)',
    });
    vi.restoreAllMocks();
  });

  it('keeps a static import animating-irrelevant under low-performance mode', () => {
    useThemeStore.setState({ theme: 'custom' });
    useUIStore.setState({ lowPerformanceMode: true });

    const container = renderWith({ ...ANIMATED, animated: false, stillFileName: null });

    expect(container.querySelector('.theme-bg-image')).toHaveStyle({
      backgroundImage: 'url(http://127.0.0.1:1234/tok/background/bg-abc.gif)',
    });
  });

  /**
   * An animated record written before the importer encoded stills has nothing
   * to freeze to. Showing the animation beats showing nothing — the alternative
   * is a background that vanishes when the user enables low-performance mode.
   */
  it('falls back to the animation when an animated record has no still', () => {
    useThemeStore.setState({ theme: 'custom' });
    useUIStore.setState({ lowPerformanceMode: true });

    const container = renderWith({ ...ANIMATED, stillFileName: null });

    expect(container.querySelector('.theme-bg-image')).toHaveStyle({
      backgroundImage: 'url(http://127.0.0.1:1234/tok/background/bg-abc.gif)',
    });
  });

  it('renders nothing for the "custom" theme while no image resolves', () => {
    // The window between selecting `custom` and the record arriving — or after
    // the file was deleted outside the app. Painting the scrim over an empty
    // box would read as a broken background rather than as no background.
    useThemeStore.setState({ theme: 'custom' });

    expect(renderWith(null)).toBeEmptyDOMElement();
  });
});
