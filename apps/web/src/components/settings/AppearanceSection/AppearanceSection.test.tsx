import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '@/stores/useUIStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { useAccentStore } from '@/stores/useAccentStore';

import AppearanceSection from './AppearanceSection';

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
    render(<AppearanceSection />);

    expect(screen.getByRole('heading', { name: 'Language & scale' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Theme' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Accent color' })).toBeInTheDocument();
  });

  it('sets the interface scale when a preset chip is clicked', async () => {
    const user = userEvent.setup();
    const setUiScale = vi.fn();
    useUIStore.setState({ setUiScale });
    render(<AppearanceSection />);

    await user.click(screen.getByRole('button', { name: '120%' }));

    expect(setUiScale).toHaveBeenCalledWith(120);
  });
});
