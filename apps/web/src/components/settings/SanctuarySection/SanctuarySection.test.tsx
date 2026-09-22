import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  useSanctuaryStore,
  SANCTUARY_AUTO_ENTER_DEFAULT_MINUTES,
  SANCTUARY_ROTATE_DEFAULT_MINUTES,
} from '@/stores/useSanctuaryStore';

import SanctuarySection from './SanctuarySection';

function reset(): void {
  useSanctuaryStore.setState({
    sanctuaryVariant: 'cover',
    sanctuaryClockFace: 'minimal',
    sanctuaryClockFormat: 'system',
    sanctuaryClockSeconds: false,
    sanctuaryRotation: 'off',
    sanctuaryRotationMinutes: SANCTUARY_ROTATE_DEFAULT_MINUTES,
    sanctuaryTrackInfo: { cover: true, clock: true, vinyl: true },
    sanctuaryTimeOfDay: false,
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
    expect(screen.getByRole('button', { name: 'Vinyl' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('selects the vinyl variant through its chip', () => {
    render(<SanctuarySection />);

    fireEvent.click(screen.getByRole('button', { name: 'Vinyl' }));

    expect(useSanctuaryStore.getState().sanctuaryVariant).toBe('vinyl');
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

  it('toggles a stage out of showing track details through its chip', () => {
    render(<SanctuarySection />);

    const chip = screen.getByRole('button', { name: 'Track details: Clock' });
    expect(chip).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(chip);

    expect(useSanctuaryStore.getState().sanctuaryTrackInfo).toEqual({
      cover: true,
      clock: false,
      vinyl: true,
    });
    expect(screen.getByRole('button', { name: 'Track details: Clock' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('follow-the-day locks the manual variant picker and rotation', () => {
    render(<SanctuarySection />);

    fireEvent.click(screen.getByRole('switch', { name: /Follow the day/ }));

    expect(useSanctuaryStore.getState().sanctuaryTimeOfDay).toBe(true);
    expect(screen.getByRole('button', { name: 'Cover' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: /Rotate the stage/ })).toBeDisabled();
  });

  it('shows the rotation window slider only for timer rotation', () => {
    render(<SanctuarySection />);

    expect(screen.queryByText('Minutes between turns')).not.toBeInTheDocument();

    act(() => {
      useSanctuaryStore.getState().setSanctuaryRotation('minutes');
    });

    expect(screen.getByText('Minutes between turns')).toBeInTheDocument();
  });

  it('selects a clock face through its chip', () => {
    render(<SanctuarySection />);

    fireEvent.click(screen.getByRole('button', { name: 'Library' }));

    expect(useSanctuaryStore.getState().sanctuaryClockFace).toBe('serif');
    expect(screen.getByRole('button', { name: 'Library' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('opts into seconds through the switch', () => {
    render(<SanctuarySection />);

    fireEvent.click(screen.getByRole('switch', { name: /Show seconds/ }));

    expect(useSanctuaryStore.getState().sanctuaryClockSeconds).toBe(true);
  });
});
