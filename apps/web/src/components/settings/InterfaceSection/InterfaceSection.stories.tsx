import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, screen, userEvent, expect, waitFor } from 'storybook/test';
import { useInterfaceStore, INTERFACE_DEFAULTS } from '@/stores/useInterfaceStore';

import InterfaceSection from './InterfaceSection';

/**
 * settings · InterfaceSection. Four cards that hide/show interface elements: a
 * "Panel layout" card with a side-panel-position select, a "Top bar" card with
 * the "Language switcher" toggle, an "Overview widgets" card, and a "Player bar"
 * card — each toggle row driven by `useInterfaceStore`. Layout dock side lives in
 * `useLayoutStore`. State is reset to `INTERFACE_DEFAULTS` per story.
 */
const meta: Meta<typeof InterfaceSection> = {
  title: 'settings/InterfaceSection',
  component: InterfaceSection,
  // Every toggle row switch is named via aria-labelledby, the side-panel select
  // is a labelled combobox, the preview mocks are labelled role="img"s, and the
  // card titles are real headings — axe clean.
  parameters: { a11y: { test: 'error' } },
  decorators: [
    Story => {
      useInterfaceStore.setState({ ...INTERFACE_DEFAULTS });
      return (
        <div className="max-w-[680px] p-4">
          <Story />
        </div>
      );
    },
  ],
};

export default meta;

type Story = StoryObj<typeof InterfaceSection>;

/** Default — the four cards render; the Language-switcher toggle drives the store. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('heading', { name: 'Panel layout' })).toBeInTheDocument();
    await expect(canvas.getByRole('heading', { name: 'Overview widgets' })).toBeInTheDocument();
    await expect(canvas.getByRole('heading', { name: 'Player bar' })).toBeInTheDocument();

    // The side-panel position is a labelled combobox.
    await expect(canvas.getByRole('combobox', { name: 'Side panel position' })).toBeInTheDocument();

    // The top-bar "Language switcher" toggle is uniquely named; clicking it
    // updates the matching store flag.
    const langSwitch = canvas.getByRole('switch', { name: 'Language switcher' });
    const before = useInterfaceStore.getState().topBarLanguageSwitcher;
    await userEvent.click(langSwitch);
    await waitFor(() => expect(useInterfaceStore.getState().topBarLanguageSwitcher).toBe(!before));

    useInterfaceStore.setState({ ...INTERFACE_DEFAULTS });
  },
};

/** Open the side-panel select to confirm both dock options portal in. */
export const SidePanelOptions: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole('combobox', { name: 'Side panel position' }));
    // The listbox + options portal to the document body, so query via `screen`.
    const listbox = await screen.findByRole('listbox');
    await expect(within(listbox).getByRole('option', { name: 'Left' })).toBeInTheDocument();
    await expect(within(listbox).getByRole('option', { name: 'Right' })).toBeInTheDocument();
  },
};
