import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { WeatherCurrent } from '@shiranami/contracts';

import WeatherRow from './WeatherRow';

const rain: WeatherCurrent = { tempC: 11.6, condition: 'rain', label: 'Rain' };

describe('WeatherRow', () => {
  it('renders the condition, rounded temperature, and city-prefixed flavor', () => {
    render(<WeatherRow weather={rain} isError={false} cityLabel="Kraków, PL" />);

    expect(screen.getByText('Rain · 12°C')).toBeInTheDocument();
    expect(screen.getByText(/Kraków, PL · /)).toBeInTheDocument();
  });

  it('shows the unavailable line on error', () => {
    render(<WeatherRow weather={undefined} isError />);

    expect(screen.getByText('Weather unavailable')).toBeInTheDocument();
  });

  it('shows the unavailable line when weather is missing', () => {
    render(<WeatherRow weather={undefined} isError={false} />);

    expect(screen.getByText('Weather unavailable')).toBeInTheDocument();
  });
});
