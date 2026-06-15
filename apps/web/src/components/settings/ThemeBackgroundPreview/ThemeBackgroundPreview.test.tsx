import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useThemeStore } from '@/stores/useThemeStore';
import { useThemeBgStore } from '@/stores/useThemeBgStore';

import ThemeBackgroundPreview from './ThemeBackgroundPreview';

function reset(): void {
  useThemeStore.setState({ theme: 'none' });
  useThemeBgStore.setState({ bgOpacity: 1, bgBlur: 0, bgDim: 0 });
}

beforeEach(reset);
afterEach(reset);

describe('ThemeBackgroundPreview', () => {
  it('renders nothing when no theme background is active', () => {
    const { container } = render(<ThemeBackgroundPreview />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the sample chrome once a theme is selected', () => {
    useThemeStore.setState({ theme: 'lofi-night' });
    render(<ThemeBackgroundPreview />);

    expect(screen.getByText('Sample Track')).toBeInTheDocument();
    expect(screen.getByText('Now playing over your background')).toBeInTheDocument();
  });
});
