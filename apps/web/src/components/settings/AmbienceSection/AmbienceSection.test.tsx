import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DEFAULT_AMBIENT_LEVELS, useAmbientStore } from '@/stores/useAmbientStore';
import { useWeatherStore } from '@/stores/useWeatherStore';

import AmbienceSection from './AmbienceSection';

function reset(): void {
  localStorage.clear();
  useAmbientStore.setState({
    enabled: false,
    levels: { ...DEFAULT_AMBIENT_LEVELS },
    keepWhenPaused: false,
    followWeather: false,
  });
  useWeatherStore.setState({ enabled: false, coords: null });
  vi.clearAllMocks();
}

beforeEach(reset);
afterEach(reset);

function renderSection() {
  return render(
    <TooltipProvider>
      <AmbienceSection />
    </TooltipProvider>
  );
}

describe('AmbienceSection', () => {
  it('renders the ambience card with the inline mixer', () => {
    renderSection();

    expect(screen.getByRole('heading', { name: 'Ambience' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Play ambience' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Rain volume' })).toBeInTheDocument();
    // Inline: no player-bar trigger inside settings.
    expect(screen.queryByRole('button', { name: 'Ambience' })).not.toBeInTheDocument();
  });

  it('explains the sleep-timer coupling and credits the recording', () => {
    renderSection();

    expect(screen.getByText(/fades out with the sleep timer/)).toBeInTheDocument();
    expect(screen.getByText(/public-domain recording from Wikimedia Commons/)).toBeInTheDocument();
  });

  it('writes through to the ambience store', async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole('switch', { name: 'Play ambience' }));

    expect(useAmbientStore.getState().enabled).toBe(true);
  });
});
