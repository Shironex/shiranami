import { fireEvent, render, screen } from '@testing-library/react';
import { Brain, CloudRain } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import type { ISmartMixCard } from '../MixesView.types';

import SmartMixRow from './SmartMixRow';

function makeCard(overrides: Partial<ISmartMixCard> = {}): ISmartMixCard {
  return {
    id: 'focus',
    icon: Brain,
    title: 'Deep focus',
    desc: 'Steady instrumentals for a long stretch of work',
    count: 18,
    onPlay: vi.fn(),
    ...overrides,
  };
}

describe('SmartMixRow', () => {
  it('names the row button with its title, description and track count', () => {
    render(<SmartMixRow card={makeCard()} countLabel="18 tracks" />);

    expect(
      screen.getByRole('button', {
        name: 'Deep focus Steady instrumentals for a long stretch of work 18 tracks',
      })
    ).toBeInTheDocument();
  });

  it('plays the smart mix when the row is clicked', () => {
    const onPlay = vi.fn();
    render(<SmartMixRow card={makeCard({ onPlay })} countLabel="18 tracks" />);

    fireEvent.click(screen.getByRole('button', { name: /Deep focus/ }));

    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it('renders the icon belonging to the smart-mix kind', () => {
    const { container } = render(
      <SmartMixRow
        card={makeCard({ id: 'rainy-day', icon: CloudRain, title: 'Rainy day' })}
        countLabel="9 tracks"
      />
    );

    expect(container.querySelector('svg.lucide-cloud-rain')).not.toBeNull();
    expect(container.querySelector('svg.lucide-brain')).toBeNull();
  });

  it('always shows the trailing count, unlike the curated mix rows', () => {
    render(<SmartMixRow card={makeCard({ count: 0 })} countLabel="0 tracks" />);

    expect(screen.getByText('0 tracks')).toBeInTheDocument();
  });
});
