import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useThemeStore } from '@/stores/useThemeStore';

import ThemeBackground from './ThemeBackground';

afterEach(() => {
  useThemeStore.setState({ theme: 'none' });
});

describe('ThemeBackground', () => {
  it('renders nothing for the "none" theme', () => {
    useThemeStore.setState({ theme: 'none' });

    const { container } = render(<ThemeBackground />);

    expect(container).toBeEmptyDOMElement();
  });

  it('paints the theme image + scrim for a non-"none" theme', () => {
    useThemeStore.setState({ theme: 'lofi-night' });

    const { container } = render(<ThemeBackground />);

    const image = container.querySelector('.theme-bg-image');
    expect(image).not.toBeNull();
    expect(image).toHaveStyle({ backgroundImage: 'url(./themes/lofi-night.webp)' });
    expect(container.querySelector('.theme-bg-scrim')).not.toBeNull();
  });
});
