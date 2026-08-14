import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import NamingCeremony from './NamingCeremony';
import { stopCompanionDriver } from '@/lib/companionDriver';
import { createCompanionState } from '@/lib/companionMachine';
import { useCompanionRuntimeStore } from '@/stores/useCompanionRuntimeStore';
import { useCompanionStore } from '@/stores/useCompanionStore';
import { useInterfaceStore } from '@/stores/useInterfaceStore';

function reset(): void {
  useInterfaceStore.setState({ companion: true });
  useCompanionStore.setState({ species: 'shio', namingCeremonyDone: false });
  useCompanionRuntimeStore.setState({
    machine: createCompanionState(),
    ledger: { name: null, xpHours: null, accessories: [], hasBackend: false },
  });
}

/** The due state: first evolution reached, ledger live, still nameless. */
function makeDue(): void {
  useCompanionRuntimeStore.setState({
    machine: { ...useCompanionRuntimeStore.getState().machine, stage: 1 },
    ledger: { name: null, xpHours: 30, accessories: [], hasBackend: true },
  });
}

describe('NamingCeremony', () => {
  beforeEach(reset);
  afterEach(() => {
    stopCompanionDriver();
    reset();
  });

  it('stays silent before the first evolution', () => {
    render(<NamingCeremony />);
    useCompanionRuntimeStore.setState({
      ledger: { name: null, xpHours: 0, accessories: [], hasBackend: true },
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('appears once the stage is reached and names the companion', async () => {
    const user = userEvent.setup();
    render(<NamingCeremony />);
    makeDue();

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Companion name' }), '  Puddle  ');
    await user.click(screen.getByRole('button', { name: 'Name it' }));

    expect(useCompanionRuntimeStore.getState().ledger.name).toBe('Puddle');
    expect(useCompanionStore.getState().namingCeremonyDone).toBe(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('cannot confirm an empty name', async () => {
    render(<NamingCeremony />);
    makeDue();
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Name it' })).toBeDisabled();
  });

  it('"maybe later" passes the moment forever — one-time means one-time', async () => {
    const user = userEvent.setup();
    render(<NamingCeremony />);
    makeDue();

    await user.click(await screen.findByRole('button', { name: 'Maybe later' }));
    expect(useCompanionStore.getState().namingCeremonyDone).toBe(true);
    expect(useCompanionRuntimeStore.getState().ledger.name).toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // The due state coming around again changes nothing.
    makeDue();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('never interrupts a companion that already has a name', () => {
    render(<NamingCeremony />);
    useCompanionRuntimeStore.setState({
      machine: { ...useCompanionRuntimeStore.getState().machine, stage: 2 },
      ledger: { name: 'Puddle', xpHours: 120, accessories: [], hasBackend: true },
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('waits out the level-up celebration before asking', () => {
    render(<NamingCeremony />);
    useCompanionRuntimeStore.setState({
      machine: { ...useCompanionRuntimeStore.getState().machine, stage: 1, overlay: 'levelup' },
      ledger: { name: null, xpHours: 30, accessories: [], hasBackend: true },
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
