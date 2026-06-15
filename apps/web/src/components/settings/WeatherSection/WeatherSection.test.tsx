import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWeatherStore } from '@/stores/useWeatherStore';

import WeatherSection from './WeatherSection';

function reset(): void {
  useWeatherStore.setState({ enabled: false, coords: null });
  vi.clearAllMocks();
}

beforeEach(reset);
afterEach(reset);

describe('WeatherSection', () => {
  it('renders the weather card with the enable toggle', () => {
    render(<WeatherSection />);

    expect(screen.getByRole('heading', { name: 'Weather on Overview' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Show weather on Overview' })).toBeInTheDocument();
  });

  it('reveals the city search only when enabled', async () => {
    const user = userEvent.setup();
    render(<WeatherSection />);

    expect(screen.queryByLabelText('City')).not.toBeInTheDocument();

    await user.click(screen.getByRole('switch', { name: 'Show weather on Overview' }));

    expect(screen.getByLabelText('City')).toBeInTheDocument();
  });
});
