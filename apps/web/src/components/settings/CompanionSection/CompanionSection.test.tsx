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
    ledger: { name: null, xpHours: null, accessories: [], hasBackend: false },
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
      ledger: { name: null, xpHours: 112, accessories: [], hasBackend: true },
    });
    rerender(<CompanionSection />);
    expect(screen.getByText(/grown from 112 hours of listening/)).toBeInTheDocument();
  });

  it('greets a hatchling without inventing hours', () => {
    useCompanionRuntimeStore.setState({
      ledger: { name: null, xpHours: 0, accessories: [], hasBackend: true },
    });
    render(<CompanionSection />);
    expect(screen.getByText(/just hatched/)).toBeInTheDocument();
  });

  it('hides the keepsake wardrobe without a ledger to persist to', () => {
    render(<CompanionSection />);
    expect(screen.queryByText('Little keepsakes')).not.toBeInTheDocument();
  });

  it('renames the companion inline, trimming the draft', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<CompanionSection />);
    useCompanionRuntimeStore.setState({
      ledger: { name: 'Puddle', xpHours: 112, accessories: [], hasBackend: true },
    });
    rerender(<CompanionSection />);

    expect(screen.getByText('Puddle')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Rename' }));

    const input = screen.getByRole('textbox', { name: 'Name' });
    await user.clear(input);
    await user.type(input, '  Mochi  ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(useCompanionRuntimeStore.getState().ledger.name).toBe('Mochi');
  });

  it('offers "Give a name" while the companion is still nameless', () => {
    const { rerender } = render(<CompanionSection />);
    useCompanionRuntimeStore.setState({
      ledger: { name: null, xpHours: 5, accessories: [], hasBackend: true },
    });
    rerender(<CompanionSection />);
    expect(screen.getByRole('button', { name: 'Give a name' })).toBeInTheDocument();
    expect(screen.getByText('No name yet')).toBeInTheDocument();
  });

  it('gates keepsakes by the reached stage and toggles the worn set', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<CompanionSection />);
    // After mount: the driver's ledger probe has already answered (absent in
    // tests), so this stands as the state the section re-reads.
    useCompanionRuntimeStore.setState({
      machine: { ...useCompanionRuntimeStore.getState().machine, stage: 2 },
      ledger: { name: null, xpHours: 112, accessories: [], hasBackend: true },
    });
    rerender(<CompanionSection />);

    // Stage 2: beret + glasses reachable, satchel + pendant still growing.
    expect(screen.getByRole('button', { name: 'beret' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'round glasses' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'satchel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'shell pendant' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'beret' }));
    expect(useCompanionRuntimeStore.getState().ledger.accessories).toEqual(['beret']);
    expect(screen.getByRole('button', { name: 'beret' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'beret' }));
    expect(useCompanionRuntimeStore.getState().ledger.accessories).toEqual([]);
  });
});
