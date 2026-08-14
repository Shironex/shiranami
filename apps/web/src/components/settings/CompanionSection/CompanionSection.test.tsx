import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import CompanionSection from './CompanionSection';
import { stopCompanionDriver } from '@/lib/companionDriver';
import { useCompanionRuntimeStore } from '@/stores/useCompanionRuntimeStore';
import { useCompanionStore } from '@/stores/useCompanionStore';
import { useInterfaceStore } from '@/stores/useInterfaceStore';

function reset(): void {
  useInterfaceStore.setState({ companion: true });
  useCompanionStore.setState({
    species: 'shio',
    sanctuaryKeepsWatch: false,
    dressForWeather: true,
  });
  useCompanionRuntimeStore.setState({
    ledger: { name: null, xpHours: null, hasBackend: false },
  });
}

describe('CompanionSection', () => {
  beforeEach(reset);
  afterEach(() => {
    stopCompanionDriver();
    reset();
  });

  it('renders the card with both residents previewed', () => {
    render(<CompanionSection />);
    expect(screen.getByRole('heading', { name: 'Companion' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Shio/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Hotaru/ })).toHaveAttribute('aria-pressed', 'false');
    // Both previews are live sprites at perch size.
    expect(document.querySelectorAll('svg.companion-svg')).toHaveLength(2);
  });

  it('switching species is a preference, not a collection — one click, no cost', async () => {
    const user = userEvent.setup();
    render(<CompanionSection />);

    await user.click(screen.getByRole('button', { name: /Hotaru/ }));
    expect(useCompanionStore.getState().species).toBe('hotaru');
  });

  it('the master toggle gates the picker and the keeps-watch sub-toggle', async () => {
    const user = userEvent.setup();
    render(<CompanionSection />);

    const switches = screen.getAllByRole('switch');
    await user.click(switches[0]);
    expect(useInterfaceStore.getState().companion).toBe(false);
  });

  it('toggles the weather-fits preference from its own row', async () => {
    const user = userEvent.setup();
    render(<CompanionSection />);

    await user.click(screen.getByRole('switch', { name: /Dresses for the weather/ }));
    expect(useCompanionStore.getState().dressForWeather).toBe(false);
  });

  it('keeps numbers out of sight until the ledger answers, then prose only', () => {
    const { rerender } = render(<CompanionSection />);
    expect(screen.queryByText(/hours of listening/)).not.toBeInTheDocument();

    useCompanionRuntimeStore.setState({
      ledger: { name: null, xpHours: 112, hasBackend: true },
    });
    rerender(<CompanionSection />);
    expect(screen.getByText(/grown from 112 hours of listening/)).toBeInTheDocument();
  });

  it('greets a hatchling without inventing hours', () => {
    useCompanionRuntimeStore.setState({
      ledger: { name: null, xpHours: 0, hasBackend: true },
    });
    render(<CompanionSection />);
    expect(screen.getByText(/just hatched/)).toBeInTheDocument();
  });
});
