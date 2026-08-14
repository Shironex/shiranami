import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import NamingCeremony from './NamingCeremony';
import { createCompanionState } from '@/lib/companionMachine';
import { useCompanionRuntimeStore } from '@/stores/useCompanionRuntimeStore';
import { useCompanionStore } from '@/stores/useCompanionStore';
import { useInterfaceStore } from '@/stores/useInterfaceStore';

/**
 * companion · NamingCeremony. The one-time cozy naming moment: due when the
 * first evolution is reached (or on first enable past it) while the pet is
 * still nameless. "Maybe later" passes the moment forever; the rename
 * affordance in Settings remains.
 */
const meta: Meta<typeof NamingCeremony> = {
  title: 'companion/NamingCeremony',
  component: NamingCeremony,
  loaders: [
    async () => {
      useInterfaceStore.setState({ companion: true });
      useCompanionStore.setState({ species: 'shio', namingCeremonyDone: false });
      useCompanionRuntimeStore.setState({
        machine: { ...createCompanionState(), stage: 1 },
        ledger: { name: null, xpHours: 30, accessories: [], hasBackend: true },
      });
      return {};
    },
  ],
};

export default meta;

type Story = StoryObj<typeof NamingCeremony>;

/** The moment itself — sprite, one line, one input, no pressure. */
export const Due: Story = {
  play: async () => {
    const dialog = await within(document.body).findByRole('dialog');
    await expect(within(dialog).getByRole('button', { name: 'Name it' })).toBeDisabled();
    await expect(within(dialog).getByRole('button', { name: 'Maybe later' })).toBeEnabled();
  },
};
