import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  useSanctuaryStore,
  SANCTUARY_AUTO_ENTER_DEFAULT_MINUTES,
} from '@/stores/useSanctuaryStore';

import SanctuarySection from './SanctuarySection';

function reset(): void {
  useSanctuaryStore.setState({
    sanctuaryVariant: 'cover',
    sanctuaryAutoEnter: false,
    sanctuaryAutoEnterMinutes: SANCTUARY_AUTO_ENTER_DEFAULT_MINUTES,
  });
}

beforeEach(reset);
afterEach(reset);

describe('SanctuarySection', () => {
  it('renders the card with the variant picker', () => {
    render(<SanctuarySection />);

    expect(screen.getByText('Sanctuary Mode')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cover' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Clock' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('selects the clock variant through its chip', () => {
    render(<SanctuarySection />);

    fireEvent.click(screen.getByRole('button', { name: 'Clock' }));

    expect(useSanctuaryStore.getState().sanctuaryVariant).toBe('clock');
  });

  it('hides the stillness slider until auto-entry is opted into', () => {
    render(<SanctuarySection />);

    expect(screen.queryByText('Stillness before entering')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: /Enter on its own/ }));

    expect(useSanctuaryStore.getState().sanctuaryAutoEnter).toBe(true);
    expect(screen.getByText('Stillness before entering')).toBeInTheDocument();
  });
});
