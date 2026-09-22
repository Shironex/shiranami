import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import CompanionSection from './CompanionSection';
import { useCompanionRuntimeStore } from '@/stores/useCompanionRuntimeStore';
import { useCompanionStore } from '@/stores/useCompanionStore';
import { useInterfaceStore } from '@/stores/useInterfaceStore';

/**
 * settings · CompanionSection. The companion's whole numeric surface: master
 * toggle, the species picker with both residents previewed live at perch
 * size (this is how a listener chooses Shio or Hotaru), the Sanctuary
 * "keeps watch" sub-toggle, and the single prose stage line — sought here,
 * never shown anywhere near the player.
 */
const meta: Meta<typeof CompanionSection> = {
  title: 'settings/CompanionSection',
  component: CompanionSection,
  decorators: [
    Story => (
      <div className="max-w-xl bg-background p-6">
        <Story />
      </div>
    ),
  ],
  loaders: [
    async () => {
      useInterfaceStore.setState({ companion: true });
      useCompanionStore.setState({ species: 'shio', sanctuaryKeepsWatch: false });
      return {};
    },
  ],
};

export default meta;

type Story = StoryObj<typeof CompanionSection>;

/** Fresh install: no ledger yet, so no numbers anywhere. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: /Shio/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(canvasElement.querySelectorAll('svg.companion-svg')).toHaveLength(2);
  },
};

/** A grown companion — the prose line is the only number in the feature. */
export const WithLedger: Story = {
  loaders: [
    async () => {
      useCompanionRuntimeStore.setState({
        ledger: { name: null, xpHours: 112, accessories: [], hasBackend: true },
      });
      useCompanionRuntimeStore.setState(state => ({
        machine: { ...state.machine, stage: 2 },
      }));
      return {};
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/112 hours of listening/)).toBeInTheDocument();
  },
};
